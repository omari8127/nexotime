import { config } from './config.js'
import { openDb } from './db.js'
import { loadKeys } from './crypto.js'
import { createService } from './service.js'
import { createHttpServer } from './server.js'

loadKeys() // fail fast if the signing key is missing
const service = createService(openDb())
const owners = service._db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get().n
if (owners === 0) console.warn('⚠  No hay ningún propietario. Ejecuta: npm run create-owner')

createHttpServer(service).listen(config.port, () => {
  console.log(`NEXOTIME licencias v${config.version} escuchando en http://localhost:${config.port}`)
  console.log(`Panel de administración: http://localhost:${config.port}/admin/`)
})
