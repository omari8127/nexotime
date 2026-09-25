import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { after, before, describe, test } from 'node:test'

// A throw-away signing key, set before the server modules read the environment.
process.env.LICENSE_PRIVATE_KEY = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' })

const { openDb } = await import('../src/db.js')
const { createService } = await import('../src/service.js')
const { createHttpServer } = await import('../src/server.js')
const { hashPassword, verifyToken } = await import('../src/crypto.js')

const DAY = 86_400_000
let clockMs = Date.parse('2026-09-24T12:00:00Z')
const clock = () => new Date(clockMs)

let server, base
const db = openDb(':memory:')
const service = createService(db, { clock })

async function call(path, { method = 'POST', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const json = await res.json()
  return Array.isArray(json) ? Object.assign(json, { status: res.status }) : { status: res.status, ...json }
}

function addUser(email, role, password = 'clave-segura-123') {
  const { salt, hash } = hashPassword(password)
  db.prepare('INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES (?,?,?,?,?,?)').run(email, email, role, salt, hash, clock().toISOString())
}
const login = async (email) => (await call('/admin/api/login', { body: { email, password: 'clave-segura-123' } })).token

const DEV_A = '7D92-83AF-21BC-0011-2233-4455-6677-8899'
const DEV_B = 'AAAA-BBBB-CCCC-0011-2233-4455-6677-8899'

before(async () => {
  addUser('owner@x.com', 'owner')
  addUser('admin@x.com', 'admin')
  addUser('vende@x.com', 'vendedor')
  server = createHttpServer(service, { clock: () => clockMs })
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

describe('flujo completo de licencias', () => {
  let owner, admin, vendor, lic, code, token
  // Admin sessions last 12 h: after the simulated clock jumps, sign in again.
  const relog = async () => {
    owner = await login('owner@x.com')
    admin = await login('admin@x.com')
  }

  test('roles: el vendedor solo solicita, el propietario autoriza', async () => {
    owner = await login('owner@x.com')
    admin = await login('admin@x.com')
    vendor = await login('vende@x.com')
    assert.ok(owner && admin && vendor)

    const own = await call('/admin/api/companies', { token: owner, body: { name: 'Otra Empresa SA' } })
    assert.equal(own.status, 200)
    const mine = await call('/admin/api/companies', { token: vendor, body: { name: 'Empresa ABC', contact: 'Ana' } })
    const req = await call('/admin/api/licenses', { token: vendor, body: { companyId: mine.id, plan: 'profesional', maxDevices: 99, authorize: true } })
    assert.equal(req.status, 200)
    assert.equal(req.code, null, 'el vendedor no obtiene un código')
    const list = await call('/admin/api/licenses', { method: 'GET', token: vendor })
    assert.equal(list.length, 1)
    assert.equal(list[0].status, 'pending')
    assert.equal(list[0].requestedByVendor, true)

    // Cannot touch other companies, approve, renew, suspend, list users/settings/audit.
    const foreign = await call('/admin/api/licenses', { token: vendor, body: { companyId: own.id } })
    assert.equal(foreign.status, 404)
    for (const [p, b] of [[`/admin/api/licenses/${req.id}/approve`, {}], [`/admin/api/licenses/${req.id}/renew`, { months: 12 }], [`/admin/api/licenses/${req.id}/suspend`, {}]]) {
      assert.equal((await call(p, { token: vendor, body: b })).status, 403, p)
    }
    for (const p of ['users', 'settings', 'audit', 'devices', 'dashboard']) {
      assert.equal((await call(`/admin/api/${p}`, { method: 'GET', token: vendor })).status, 403, p)
    }
    assert.equal((await call('/admin/api/licenses', { method: 'GET' })).status, 401)
    // Admin cannot manage users; owner can.
    assert.equal((await call('/admin/api/users', { method: 'GET', token: admin })).status, 403)
    assert.equal((await call('/admin/api/users', { method: 'GET', token: owner })).status, 200)

    // A pending license cannot be activated (it has no code yet).
    assert.equal((await call('/v1/activate', { body: { code: 'NXT-AAAA-BBBB-CCCC', companyName: 'Empresa ABC', deviceId: DEV_A } })).code, 'invalid_code')

    // The owner approves → a code appears exactly once.
    const ok = await call(`/admin/api/licenses/${req.id}/approve`, { token: owner })
    assert.match(ok.code, /^NXT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    lic = req.id
    code = ok.code
    assert.match(lic, /^LIC-2026-\d{5}$/)
  })

  test('activación: código, empresa y dispositivo', async () => {
    const bad = await call('/v1/activate', { body: { code: 'NXT-ZZZZ-ZZZZ-ZZZZ', companyName: 'Empresa ABC', deviceId: DEV_A } })
    assert.equal(bad.status, 404)
    assert.equal(bad.code, 'invalid_code')
    const wrongCompany = await call('/v1/activate', { body: { code, companyName: 'Otra', deviceId: DEV_A } })
    assert.equal(wrongCompany.code, 'invalid_code', 'no revela si el código existe')

    // Lowercase, spaces and accents in the company name are tolerated.
    const a = await call('/v1/activate', { body: { code: code.toLowerCase().replaceAll('-', ' '), companyName: '  empresa  abc ', deviceId: DEV_A, deviceName: 'Recepción', platform: 'windows', appVersion: '1.0.0' } })
    assert.equal(a.status, 200)
    assert.equal(a.license.status, 'active')
    assert.equal(a.license.devices, 1)
    assert.equal(a.license.maxDevices, 1)
    token = a.token
    const p = verifyToken(token)
    assert.equal(p.lid, lic)
    assert.equal(p.dev, DEV_A)
    assert.equal(p.tol, 30)
    assert.ok(p.feat.includes('face') && p.feat.includes('reports'))
    assert.equal(p.exp.slice(0, 10), '2027-09-24', 'vence un año después de la activación')

    // A tampered token fails verification.
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...p, st: 'active', exp: '2099-01-01T00:00:00.000Z' })).toString('base64url')
    assert.equal(verifyToken(`${forged}.${sig}`), null)
    assert.ok(body)

    // The same device re-activating (reinstall) is fine; a second device is refused.
    assert.equal((await call('/v1/activate', { body: { code, companyName: 'Empresa ABC', deviceId: DEV_A } })).status, 200)
    const b = await call('/v1/activate', { body: { code, companyName: 'Empresa ABC', deviceId: DEV_B } })
    assert.equal(b.status, 403)
    assert.equal(b.code, 'device_limit')
    assert.match(b.message, /vinculada a otro dispositivo/)
  })

  test('validación, tolerancia offline y hora del servidor', async () => {
    clockMs += 3 * DAY
    await relog()
    const v = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token, appVersion: '1.0.1' } })
    assert.equal(v.status, 200)
    assert.equal(v.license.status, 'active')
    token = v.token
    const p = verifyToken(token)
    assert.equal(Date.parse(p.vu) - Date.parse(p.iat), 30 * DAY)

    // Wrong device / wrong token → refused without details.
    assert.equal((await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_B, token } })).code, 'invalid_token')
    assert.equal((await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token: 'x.y' } })).code, 'invalid_token')

    // The tolerance is controlled from the server.
    assert.equal((await call('/admin/api/settings', { token: owner, body: { default_tolerance_days: 7 } })).status, 200)
    const v2 = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token } })
    token = v2.token
    assert.equal(verifyToken(token).tol, 7)
    await call('/admin/api/settings', { token: owner, body: { default_tolerance_days: 30 } })
  })

  test('suspender → detectar → reactivar', async () => {
    await relog()
    assert.equal((await call(`/admin/api/licenses/${lic}/suspend`, { token: admin, body: { reason: 'Falta de pago' } })).status, 200)
    const v = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token } })
    assert.equal(v.status, 200)
    assert.equal(v.license.status, 'suspended')
    assert.equal(verifyToken(v.token).st, 'suspended', 'la suspensión viaja firmada')
    assert.equal((await call('/v1/activate', { body: { code, companyName: 'Empresa ABC', deviceId: DEV_B } })).code, 'suspended')

    assert.equal((await call(`/admin/api/licenses/${lic}/reactivate`, { token: admin })).status, 200)
    const v2 = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token: v.token } })
    assert.equal(v2.license.status, 'active')
    token = v2.token
  })

  test('vencimiento y renovación', async () => {
    clockMs = Date.parse('2027-09-25T00:00:00Z')
    await relog()
    const v = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token } })
    assert.equal(v.license.status, 'expired')
    const r = await call(`/admin/api/licenses/${lic}/renew`, { token: admin, body: { months: 12 } })
    assert.equal(r.expiresAt.slice(0, 10), '2028-09-25')
    const v2 = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token: v.token } })
    assert.equal(v2.license.status, 'active')
    token = v2.token
  })

  test('cambio de plan, dispositivos y vencimiento; desvincular; copia detectada', async () => {
    await relog()
    const up = await call(`/admin/api/licenses/${lic}`, { method: 'PUT', token: admin, body: { plan: 'basico', maxDevices: 2 } })
    assert.equal(up.status, 200)
    const v = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token, envHash: 'ENV-1' } })
    assert.equal(verifyToken(v.token).plan, 'basico')
    assert.ok(!verifyToken(v.token).feat.includes('face'), 'el plan básico no incluye reconocimiento facial')
    token = v.token
    // Device B now fits (2 devices).
    assert.equal((await call('/v1/activate', { body: { code, companyName: 'Empresa ABC', deviceId: DEV_B, envHash: 'ENV-B' } })).status, 200)

    // Environment change on A is flagged but not blocked (default).
    const changed = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token, envHash: 'ENV-2' } })
    assert.equal(changed.status, 200)
    const detail = await call(`/admin/api/licenses/${lic}`, { method: 'GET', token: admin })
    assert.equal(detail.devices.find((d) => d.deviceId === DEV_A).envFlag, true)

    // Unlink A → it is no longer authorised.
    assert.equal((await call(`/admin/api/licenses/${lic}/devices/${DEV_A}/unlink`, { token: admin })).status, 200)
    const gone = await call('/v1/validate', { body: { licenseId: lic, deviceId: DEV_A, token } })
    assert.equal(gone.code, 'device_unauthorized')
    assert.equal(gone.status, 403)
  })

  test('cancelar, auditoría y panel', async () => {
    await relog()
    assert.equal((await call(`/admin/api/licenses/${lic}/cancel`, { token: admin, body: {} })).status, 200)
    assert.equal((await call('/v1/activate', { body: { code, companyName: 'Empresa ABC', deviceId: DEV_A } })).code, 'cancelled')
    // Only the owner can bring a cancelled license back.
    assert.equal((await call(`/admin/api/licenses/${lic}/reactivate`, { token: admin })).status, 403)
    assert.equal((await call(`/admin/api/licenses/${lic}/reactivate`, { token: owner })).status, 200)

    const audit = await call(`/admin/api/audit?license=${lic}`, { method: 'GET', token: owner })
    const actions = audit.map((a) => a.action)
    for (const expected of ['license.approved', 'device.activated', 'validation.ok', 'license.suspended', 'license.reactivated', 'license.renewed', 'device.unlinked', 'device.env_changed', 'activation.attempt', 'license.cancelled']) {
      assert.ok(actions.includes(expected), `falta ${expected} en la auditoría`)
    }
    assert.ok(audit.every((a) => a.ts && a.actor && a.result))

    const dash = await call('/admin/api/dashboard', { method: 'GET', token: admin })
    assert.equal(dash.licenses.active, 1)
    assert.equal(dash.activeDevices, 1)
  })

  test('límite de intentos de activación', async () => {
    let last
    for (let i = 0; i < 12; i++) last = await call('/v1/activate', { body: { code: 'NXT-ZZZZ-ZZZZ-ZZZZ', companyName: 'x', deviceId: DEV_A } })
    assert.equal(last.status, 429)
    assert.equal(last.code, 'rate_limited')
  })
})
