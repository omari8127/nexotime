/**
 * One-time setup commands, run on the server machine — there is deliberately no
 * "master account" that could be created from the customer program.
 *   node src/cli.js keygen                       → creates data/private.pem and prints the public key
 *   node src/cli.js create-owner <email> <name>  → asks for a password (or reads OWNER_PASSWORD)
 */
import { generateKeyPairSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { config } from './config.js'
import { openDb } from './db.js'
import { hashPassword } from './crypto.js'

const [cmd, ...args] = process.argv.slice(2)

if (cmd === 'keygen') {
  if (existsSync(config.privateKeyFile) && !args.includes('--force')) {
    console.error(`Ya existe una llave en ${config.privateKeyFile}. Si la reemplazas, TODAS las licencias emitidas dejarán de ser válidas para los clientes.\nUsa --force solo si sabes lo que haces.`)
    process.exit(1)
  }
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  mkdirSync(dirname(config.privateKeyFile), { recursive: true })
  writeFileSync(config.privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  try { chmodSync(config.privateKeyFile, 0o600) } catch {}
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  console.log(`Llave privada guardada en ${config.privateKeyFile} (NO la compartas ni la subas a git).`)
  console.log('\nLlave PÚBLICA para el programa cliente (.env.local):\n')
  console.log(`VITE_LICENSE_PUBLIC_KEY=${spki}`)
} else if (cmd === 'create-owner') {
  const [email, ...nameParts] = args
  if (!email) {
    console.error('Uso: npm run create-owner -- correo@dominio.com "Tu nombre"')
    process.exit(1)
  }
  let password = process.env.OWNER_PASSWORD
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    password = await rl.question('Contraseña (mínimo 10 caracteres): ')
    rl.close()
  }
  if (password.length < 10) {
    console.error('La contraseña debe tener al menos 10 caracteres.')
    process.exit(1)
  }
  const db = openDb()
  const { salt, hash } = hashPassword(password)
  try {
    db.prepare("INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES (?,?,'owner',?,?,?)").run(
      email.toLowerCase(), nameParts.join(' ') || email, salt, hash, new Date().toISOString(),
    )
    console.log(`Propietario creado: ${email.toLowerCase()}`)
  } catch (e) {
    console.error(String(e.message).includes('UNIQUE') ? 'Ese correo ya existe.' : e.message)
    process.exit(1)
  }
} else {
  console.log('Comandos: keygen | create-owner <correo> [nombre]')
}
