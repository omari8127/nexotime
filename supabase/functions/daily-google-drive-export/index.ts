// NEXOTIME · Edge Function: daily-google-drive-export
//
// Pensada para correr una vez al día por un Cron Job de Supabase (no la llama
// el navegador). Para cada empresa que conectó Google Drive: renueva su
// access_token, arma un CSV con la asistencia del día anterior y lo sube a
// una carpeta "Nexotime" dentro de SU propio Drive.
//
// Cómo programarla: ver "Integraciones" en supabase/README.md.

import { createClient } from 'npm:@supabase/supabase-js@2'

/** Mismo criterio que src/services/exportService.ts: evita que un nombre con
 *  =, +, -, @ se interprete como fórmula al abrir el CSV en Excel. */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}
function escapeCSV(value: string | number): string {
  const s = typeof value === 'number' ? String(value) : neutralize(String(value ?? ''))
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCSV(header: string[], rows: Array<Array<string | number>>): string {
  const lines = [header, ...rows].map((r) => r.map(escapeCSV).join(','))
  return '﻿' + lines.join('\r\n')
}

function formatTime(hhmm?: string): string {
  return hhmm ?? '—'
}

const PUNCH_LABEL: Record<string, string> = {
  entry: 'entrada',
  lunch_out: 'salidaComida',
  lunch_in: 'regresoComida',
  exit: 'salida',
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description ?? 'No se pudo renovar el acceso a Google.')
  return json.access_token as string
}

/** Reutiliza la carpeta "Nexotime" del Drive del cliente si ya existe, o la crea. */
async function ensureFolder(accessToken: string, existingFolderId: string | null): Promise<string> {
  if (existingFolderId) return existingFolderId

  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='Nexotime' and trashed=false")
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const searchJson = await searchRes.json()
  if (searchJson.files?.length) return searchJson.files[0].id as string

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nexotime', mimeType: 'application/vnd.google-apps.folder' }),
  })
  const createJson = await createRes.json()
  if (!createRes.ok) throw new Error(createJson.error?.message ?? 'No se pudo crear la carpeta en Drive.')
  return createJson.id as string
}

async function uploadCSV(accessToken: string, folderId: string, filename: string, csv: string) {
  const boundary = 'nexotime-' + crypto.randomUUID()
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/csv; charset=UTF-8\r\n\r\n' +
    `${csv}\r\n` +
    `--${boundary}--`

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}))
    throw new Error(errJson.error?.message ?? 'No se pudo subir el archivo a Drive.')
  }
}

Deno.serve(async (req) => {
  // Solo la llama el Cron Job de Supabase, con la service_role como apikey.
  const authHeader = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), { status: 401 })
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  const { data: integrations, error } = await admin.from('integrations_google_drive').select('*')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // El reporte es el de "ayer" en hora de Ciudad de México, para que a nadie
  // le llegue un reporte del día que todavía no termina.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(yesterday)

  const results: Array<{ companyId: string; ok: boolean; error?: string }> = []

  for (const row of integrations ?? []) {
    try {
      const accessToken = await refreshAccessToken(row.refresh_token, clientId, clientSecret)

      const [{ data: records }, { data: employees }, { data: branches }] = await Promise.all([
        admin.from('attendance_records').select('*').eq('company_id', row.company_id).eq('date', dateStr),
        admin.from('employees').select('id, full_name, employee_number').eq('company_id', row.company_id),
        admin.from('branches').select('id, name').eq('company_id', row.company_id),
      ])
      const empById = new Map((employees ?? []).map((e) => [e.id, e]))
      const branchById = new Map((branches ?? []).map((b) => [b.id, b]))

      const header = [
        'Empleado',
        'Número',
        'Sucursal',
        'Fecha',
        'Entrada',
        'Salida a comida',
        'Regreso de comida',
        'Salida',
        'Horas trabajadas',
        'Minutos de retardo',
        'Estado',
      ]
      const csvRows = (records ?? []).map((r) => {
        const emp = empById.get(r.employee_id)
        const branch = branchById.get(r.branch_id)
        const punchTime = (type: string) =>
          formatTime((r.punches as Array<{ type: string; time: string }> | null)?.find((p) => p.type === type)?.time)
        return [
          emp?.full_name ?? r.employee_id,
          emp?.employee_number ?? '',
          branch?.name ?? '',
          r.date,
          punchTime(PUNCH_LABEL.entry),
          punchTime(PUNCH_LABEL.lunch_out),
          punchTime(PUNCH_LABEL.lunch_in),
          punchTime(PUNCH_LABEL.exit),
          (Number(r.worked_minutes ?? 0) / 60).toFixed(1),
          Number(r.late_minutes ?? 0),
          String(r.status ?? ''),
        ]
      })
      const csv = toCSV(header, csvRows)
      const folderId = await ensureFolder(accessToken, row.folder_id)
      await uploadCSV(accessToken, folderId, `nexotime-asistencia-${dateStr}.csv`, csv)

      await admin
        .from('integrations_google_drive')
        .update({
          access_token: accessToken,
          folder_id: folderId,
          last_export_at: new Date().toISOString(),
          last_export_status: 'ok',
          last_export_error: null,
        })
        .eq('company_id', row.company_id)

      results.push({ companyId: row.company_id, ok: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error desconocido'
      await admin
        .from('integrations_google_drive')
        .update({ last_export_at: new Date().toISOString(), last_export_status: 'error', last_export_error: message })
        .eq('company_id', row.company_id)
      results.push({ companyId: row.company_id, ok: false, error: message })
    }
  }

  return new Response(JSON.stringify({ date: dateStr, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
