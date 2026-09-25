/**
 * Respaldo consistente de la base de licencias y de la llave de firma.
 *   npm run backup                 → data/backups/AAAA-MM-DD_HHMMSS/
 *   npm run backup -- /ruta/destino
 * Conserva los 14 respaldos más recientes. Programa este comando (cron / Programador
 * de tareas) al menos una vez al día y copia la carpeta a otro lugar (nube, disco externo).
 *
 * Sin la llave privada NO se pueden validar las licencias ya emitidas: respáldala también,
 * y guárdala en un lugar más protegido que la base.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

const KEEP = 14
const target = resolve(process.argv[2] ?? join(dirname(config.dbPath), 'backups'))
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
const dir = join(target, stamp)
mkdirSync(dir, { recursive: true })

// VACUUM INTO produces a consistent snapshot even while the server is writing.
const db = new DatabaseSync(config.dbPath)
db.exec(`VACUUM INTO '${join(dir, 'licenses.db').replace(/'/g, "''")}'`)
db.close()
if (existsSync(config.privateKeyFile)) copyFileSync(config.privateKeyFile, join(dir, 'private.pem'))

const all = readdirSync(target).filter((n) => statSync(join(target, n)).isDirectory()).sort()
for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(target, old), { recursive: true, force: true })

console.log(`Respaldo creado en ${dir}`)
console.log(existsSync(join(dir, 'private.pem')) ? 'Incluye la llave privada: guárdalo en un lugar seguro.' : 'La llave privada viene de una variable de entorno: respáldala aparte.')
