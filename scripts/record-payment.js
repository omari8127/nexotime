#!/usr/bin/env node
/**
 * Registra un pago a mano y renueva la suscripción de una empresa — Fase 4 de
 * la migración de licencia por dispositivo a cuenta con suscripción (ver
 * docs/ESTADO.md). Corre con la llave de SERVICIO de Supabase, que ignora las
 * reglas de seguridad (RLS); por diseño, nadie puede hacer esto desde la app
 * con su propia sesión (ver supabase/migrations/004_suscripciones.sql).
 *
 * NUNCA pongas SUPABASE_SERVICE_ROLE_KEY con el prefijo VITE_ — eso la
 * mandaría al navegador de cualquiera que abra la app.
 *
 * Uso:
 *   node --env-file=.env.local scripts/record-payment.js \
 *     --company-id <uuid de companies.id>   (o --email <correo del propietario>) \
 *     --amount 2400 [--currency MXN] [--months 1] [--method manual] \
 *     [--reference "Transferencia BBVA"] [--plan profesional]
 *
 * O, más corto, con el script de package.json:
 *   npm run record-payment -- --email admin@cliente.com --amount 2400
 */
import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('Falta VITE_SUPABASE_URL (o SUPABASE_URL) en tu .env.local.')
if (!serviceKey) {
  fail(
    'Falta SUPABASE_SERVICE_ROLE_KEY en tu .env.local.\n' +
      '  Cópiala de Supabase → Project Settings → API → "service_role" (secreta, no la "anon").\n' +
      '  Agrégala como SUPABASE_SERVICE_ROLE_KEY=... (sin el prefijo VITE_) y vuelve a correr este script.',
  )
}
if (!args['company-id'] && !args.email) fail('Pasa --company-id <uuid> o --email <correo del propietario>.')
const amount = Number(args.amount)
if (!args.amount || Number.isNaN(amount) || amount <= 0) fail('Pasa --amount con un número mayor a 0.')

const months = args.months ? Number(args.months) : 1
if (!Number.isInteger(months) || months <= 0) fail('--months debe ser un entero mayor a 0.')
const method = args.method ?? 'manual'
if (!['manual', 'stripe', 'mercadopago'].includes(method)) fail("--method debe ser 'manual', 'stripe' o 'mercadopago'.")
const plan = args.plan
if (plan && !['basico', 'profesional', 'empresa'].includes(plan)) fail("--plan debe ser 'basico', 'profesional' o 'empresa'.")

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

async function resolveCompanyId() {
  if (args['company-id']) return args['company-id']
  const { data, error } = await db.from('profiles').select('company_id, email').eq('email', args.email).limit(1)
  if (error) fail(`No se pudo buscar el correo: ${error.message}`)
  if (!data?.length) fail(`No encontré ningún usuario con el correo "${args.email}".`)
  return data[0].company_id
}

async function main() {
  const companyId = await resolveCompanyId()

  const { data: company, error: companyError } = await db
    .from('companies')
    .select('id, name, plan, subscription_status, current_period_end')
    .eq('id', companyId)
    .single()
  if (companyError) fail(`No encontré la empresa: ${companyError.message}`)

  const base = company.current_period_end && new Date(company.current_period_end) > new Date()
    ? new Date(company.current_period_end)
    : new Date()
  const newPeriodEnd = new Date(base)
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + months)

  const { error: paymentError } = await db.from('payments').insert({
    company_id: companyId,
    amount,
    currency: args.currency ?? 'MXN',
    method,
    reference: args.reference ?? '',
    months_covered: months,
  })
  if (paymentError) fail(`No se pudo registrar el pago: ${paymentError.message}`)

  const { error: updateError } = await db
    .from('companies')
    .update({
      subscription_status: 'active',
      current_period_end: newPeriodEnd.toISOString(),
      ...(plan ? { plan } : {}),
    })
    .eq('id', companyId)
  if (updateError) fail(`El pago quedó registrado, pero no se pudo actualizar la empresa: ${updateError.message}`)

  console.log(`\n✓ Pago registrado para "${company.name}"`)
  console.log(`  Plan: ${plan ?? company.plan}`)
  console.log(`  Cubre hasta: ${newPeriodEnd.toLocaleDateString('es-MX', { dateStyle: 'long' })}`)
  console.log(`  Monto: ${amount} ${args.currency ?? 'MXN'} (${method})\n`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
