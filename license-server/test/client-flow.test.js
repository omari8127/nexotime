/**
 * The exact flow requested, driven end to end through the REAL client logic
 * (src/lib/license/token.ts — the same file the app ships) against the real server:
 *   crear licencia → activar → vincular dispositivo → usar → validar → perder Internet →
 *   seguir funcionando → recuperar Internet → validar → suspender → detectar → reactivar → funciona
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { after, before, describe, test } from 'node:test'

process.env.LICENSE_PRIVATE_KEY = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' })

const { openDb } = await import('../src/db.js')
const { createService } = await import('../src/service.js')
const { createHttpServer } = await import('../src/server.js')
const { hashPassword, publicKeySpkiBase64 } = await import('../src/crypto.js')
const { verifyLicenseToken, evaluateLicense } = await import('../../src/lib/license/token.ts')

const DAY = 86_400_000
let now = Date.parse('2026-09-24T14:00:00Z')
const db = openDb(':memory:')
const service = createService(db, { clock: () => new Date(now) })
const PUB = publicKeySpkiBase64()
let server, base

const call = async (path, { token, body, method = 'POST' } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  return { status: res.status, ...(await res.json()) }
}

/** Mirrors src/lib/license/store.ts: keep the signed token, derive the verdict from it and the clock. */
class Client {
  constructor(deviceId) {
    this.deviceId = deviceId
    this.stored = null
    this.online = true
  }
  async accept(token) {
    const payload = await verifyLicenseToken(token, PUB)
    if (!payload || payload.dev !== this.deviceId) return false
    this.stored = { token, lastSeen: Math.max(now, Date.parse(payload.iat)) }
    return true
  }
  async activate(code, companyName) {
    const r = await call('/v1/activate', { body: { code, companyName, deviceId: this.deviceId, appVersion: '1.0.0', platform: 'windows', deviceName: 'Windows · Chrome', envHash: 'env-1' } })
    if (r.ok) await this.accept(r.token)
    return r
  }
  async validate() {
    if (!this.online) throw new Error('offline') // the app catches this and keeps the last license
    const p = await verifyLicenseToken(this.stored.token, PUB)
    const r = await call('/v1/validate', { body: { licenseId: p.lid, deviceId: this.deviceId, token: this.stored.token, appVersion: '1.0.0', envHash: 'env-1' } })
    if (r.ok) await this.accept(r.token)
    return r
  }
  async verdict() {
    const p = await verifyLicenseToken(this.stored.token, PUB)
    if (!p) return { ok: false, reason: 'invalid' }
    return evaluateLicense(p, { now, deviceId: this.deviceId, lastSeen: this.stored.lastSeen })
  }
  /** what the app does on every tick: remember the latest time seen */
  touch() {
    if (now > this.stored.lastSeen) this.stored.lastSeen = now
  }
}

let owner, code, lic
const DEVICE = '7D92-83AF-21BC-0011-2233-4455-6677-8899'

before(async () => {
  const { salt, hash } = hashPassword('clave-segura-123')
  db.prepare("INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES ('o@x.com','Owner','owner',?,?,?)").run(salt, hash, new Date(now).toISOString())
  server = createHttpServer(service, { clock: () => now })
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
  owner = (await call('/admin/api/login', { body: { email: 'o@x.com', password: 'clave-segura-123' } })).token
})
after(() => server.close())

describe('flujo de punta a punta con el cliente real', () => {
  const c = new Client(DEVICE)
  const relog = async () => (owner = (await call('/admin/api/login', { body: { email: 'o@x.com', password: 'clave-segura-123' } })).token)

  test('1-3 crear licencia → activar → vincular dispositivo', async () => {
    const co = await call('/admin/api/companies', { token: owner, body: { name: 'Empresa ABC' } })
    const created = await call('/admin/api/licenses', { token: owner, body: { companyId: co.id, plan: 'profesional', maxDevices: 1, termMonths: 12, authorize: true } })
    lic = created.id
    code = created.code
    const r = await c.activate(code, 'Empresa ABC')
    assert.equal(r.status, 200)
    const p = await verifyLicenseToken(c.stored.token, PUB)
    assert.equal(p.lid, lic)
    assert.equal(p.dev, DEVICE)
    assert.equal(p.co, 'Empresa ABC')
    assert.deepEqual(await c.verdict(), { ok: true, offlineDaysLeft: 30, expiresInDays: 365 })
  })

  test('4-5 usar el programa y validar con Internet', async () => {
    now += 2 * DAY
    c.touch()
    const r = await c.validate()
    assert.equal(r.license.status, 'active')
    assert.equal((await c.verdict()).ok, true)
  })

  test('6-7 perder Internet y seguir funcionando dentro de la tolerancia', async () => {
    c.online = false
    await assert.rejects(() => c.validate(), /offline/)
    for (const days of [1, 10, 29]) {
      now += days === 1 ? DAY : days === 10 ? 9 * DAY : 19 * DAY // cumulative: +1, +10, +29 days offline
      c.touch()
      const v = await c.verdict()
      assert.equal(v.ok, true, `día ${days} sin Internet debe funcionar`)
    }
    // Past the tolerance the program asks for a validation before continuing.
    now += 2 * DAY
    assert.deepEqual(await c.verdict(), { ok: false, reason: 'validation_required' })
  })

  test('8-9 recuperar Internet y volver a validar', async () => {
    c.online = true
    await relog()
    const r = await c.validate()
    assert.equal(r.status, 200)
    const v = await c.verdict()
    assert.equal(v.ok, true)
    assert.equal(v.offlineDaysLeft, 30)
  })

  test('el archivo local no se puede editar: ACTIVA↔VENCIDA, fechas, plan, dispositivo', async () => {
    const [body, sig] = c.stored.token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    const forge = (patch) => `${Buffer.from(JSON.stringify({ ...payload, ...patch })).toString('base64url')}.${sig}`
    for (const patch of [{ st: 'expired' }, { exp: '2099-01-01T00:00:00.000Z' }, { plan: 'empresa' }, { vu: '2099-01-01T00:00:00.000Z' }, { dev: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' }]) {
      assert.equal(await verifyLicenseToken(forge(patch), PUB), null, JSON.stringify(patch))
    }
    // A token signed by anyone else (another key) is rejected too.
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const { verifyLicenseToken: verify2 } = await import('../../src/lib/license/token.ts')
    const spkiOther = other.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    assert.equal(await verify2(c.stored.token, spkiOther), null)
  })

  test('reloj atrasado: detectado', async () => {
    const saved = now
    c.touch()
    now -= 3 * DAY
    assert.deepEqual(await c.verdict(), { ok: false, reason: 'clock_tampered' })
    now = saved
    assert.equal((await c.verdict()).ok, true)
  })

  test('10-12 suspender → el cliente lo detecta → bloqueado', async () => {
    await relog()
    assert.equal((await call(`/admin/api/licenses/${lic}/suspend`, { token: owner, body: { reason: 'Falta de pago' } })).status, 200)
    // Until it talks to the server the last valid license keeps working (a hiccup must not stop the clock)…
    assert.equal((await c.verdict()).ok, true)
    // …and the next communication picks the suspension up and blocks the main functions.
    await c.validate()
    assert.deepEqual(await c.verdict(), { ok: false, reason: 'suspended' })
    // Offline restart stays blocked: the suspended license is signed too.
    c.online = false
    assert.deepEqual(await c.verdict(), { ok: false, reason: 'suspended' })
    c.online = true
  })

  test('13-14 reactivar → vuelve a funcionar', async () => {
    assert.equal((await call(`/admin/api/licenses/${lic}/reactivate`, { token: owner })).status, 200)
    await c.validate()
    assert.equal((await c.verdict()).ok, true)
  })

  test('copiar la instalación a otro equipo: no autorizado', async () => {
    // Same token, other machine → the token belongs to the first device.
    const copy = new Client('BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB')
    copy.stored = { ...c.stored }
    assert.deepEqual(await copy.verdict(), { ok: false, reason: 'wrong_device' })
    // A fresh install of the second machine cannot activate with the same code (1 device).
    const second = new Client('CCCC-CCCC-CCCC-CCCC-CCCC-CCCC-CCCC-CCCC')
    const r = await second.activate(code, 'Empresa ABC')
    assert.equal(r.code, 'device_limit')
    assert.match(r.message, /vinculada a otro dispositivo/)
  })

  test('vencimiento: bloquea aunque no haya Internet', async () => {
    c.online = false
    now = Date.parse('2027-09-25T00:00:00Z') // after the 12-month term
    assert.deepEqual(await c.verdict(), { ok: false, reason: 'expired' })
  })
})
