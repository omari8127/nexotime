import { createServer as httpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { config } from './config.js'
import { publicKeySpkiBase64 } from './crypto.js'
import { ApiError, CLIENT_MESSAGES } from './service.js'

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }

/** Fixed-window counter per key. In memory: enough for one server; use a proxy limiter if you scale out. */
function limiter() {
  const hits = new Map()
  return (key, max, windowMs, now = Date.now()) => {
    const h = hits.get(key)
    if (!h || now - h.start > windowMs) {
      hits.set(key, { start: now, n: 1 })
      return true
    }
    h.n += 1
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k)
    return h.n <= max
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

export function createHttpServer(service, { clock = () => Date.now() } = {}) {
  const hit = limiter()
  const admin = service.admin

  const clientIp = (req) => {
    if (config.trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
      if (fwd) return fwd
    }
    return req.socket.remoteAddress ?? ''
  }

  async function readJson(req) {
    const chunks = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > 32_768) throw new ApiError(413, 'bad_request')
      chunks.push(c)
    }
    if (size === 0) return {}
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw 0
      return body
    } catch {
      throw new ApiError(400, 'bad_request')
    }
  }

  function send(res, status, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra })
    res.end(JSON.stringify(body))
  }

  function corsFor(req) {
    const origin = req.headers.origin
    if (!origin) return {}
    const allowed = config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)
    return allowed
      ? { 'Access-Control-Allow-Origin': config.allowedOrigins.includes('*') ? '*' : origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' }
      : {}
  }

  async function serveStatic(pathname, res) {
    const rel = pathname === '/admin' || pathname === '/admin/' ? 'index.html' : pathname.replace(/^\/admin\//, '')
    const file = normalize(join(config.root, 'public', rel))
    if (!file.startsWith(join(config.root, 'public'))) return send(res, 404, { ok: false })
    try {
      const data = await readFile(file)
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        ...SECURITY_HEADERS,
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      })
      res.end(data)
    } catch {
      send(res, 404, { ok: false, code: 'not_found' })
    }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname
    const ip = clientIp(req)
    try {
      if (req.method === 'GET' && (path === '/admin' || path.startsWith('/admin/')) && !path.startsWith('/admin/api/')) {
        return await serveStatic(path, res)
      }
      if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, version: config.version })

      /* ---------------------------- public API ---------------------------- */
      if (path.startsWith('/v1/')) {
        const cors = corsFor(req)
        if (req.method === 'OPTIONS') return (res.writeHead(204, { ...cors, ...SECURITY_HEADERS }), res.end())
        if (req.method === 'GET' && path === '/v1/public-key') return send(res, 200, { ok: true, alg: 'ES256', spki: publicKeySpkiBase64() }, cors)
        if (req.method !== 'POST') throw new ApiError(404, 'not_found')
        const body = await readJson(req)
        if (path === '/v1/activate') {
          if (!hit(`act:${ip}`, 10, 15 * 60_000, clock())) throw new ApiError(429, 'rate_limited')
          return send(res, 200, service.activate({ ...body, ip }), cors)
        }
        if (path === '/v1/validate') {
          if (!hit(`val:${ip}`, 240, 3600_000, clock())) throw new ApiError(429, 'rate_limited')
          return send(res, 200, service.validate({ ...body, ip }), cors)
        }
        if (path === '/v1/status') {
          if (!hit(`sta:${ip}`, 240, 3600_000, clock())) throw new ApiError(429, 'rate_limited')
          return send(res, 200, service.status({ ...body, ip }), cors)
        }
        throw new ApiError(404, 'not_found')
      }

      /* ---------------------------- admin API ----------------------------- */
      if (path.startsWith('/admin/api/')) {
        const route = path.slice('/admin/api/'.length)
        if (req.method === 'POST' && route === 'login') {
          if (!hit(`login:${ip}`, 8, 15 * 60_000, clock())) throw new ApiError(429, 'rate_limited')
          const b = await readJson(req)
          return send(res, 200, admin.login(b.email, b.password, ip))
        }
        const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
        const user = admin.authenticate(token)
        if (!user) throw new ApiError(401, 'unauthorized')
        const body = req.method === 'GET' ? {} : await readJson(req)
        const m = (re) => route.match(re)
        let r

        if (req.method === 'POST' && route === 'logout') (admin.logout(token), (r = { ok: true }))
        else if (route === 'me') r = { user, plans: admin.plans() }
        else if (route === 'dashboard') r = admin.dashboard(user)
        else if (route === 'companies' && req.method === 'GET') r = admin.listCompanies(user)
        else if (route === 'companies') r = admin.createCompany(user, body)
        else if ((r = m(/^companies\/(\d+)$/)) && req.method === 'PUT') r = admin.updateCompany(user, Number(r[1]), body)
        else if (route === 'licenses' && req.method === 'GET') r = admin.listLicenses(user)
        else if (route === 'licenses') r = admin.createLicense(user, body)
        else if ((r = m(/^licenses\/([A-Z0-9-]+)$/)) && req.method === 'GET') r = admin.getLicense(user, r[1])
        else if ((r = m(/^licenses\/([A-Z0-9-]+)$/)) && req.method === 'PUT') r = admin.updateLicense(user, r[1], body)
        else if ((r = m(/^licenses\/([A-Z0-9-]+)\/(approve|regenerate-code|suspend|reactivate|cancel|renew)$/)) && req.method === 'POST') {
          const [, id, action] = r
          r =
            action === 'approve' ? admin.approveLicense(user, id)
            : action === 'regenerate-code' ? admin.regenerateCode(user, id)
            : action === 'suspend' ? admin.suspend(user, id, body.reason)
            : action === 'reactivate' ? admin.reactivate(user, id)
            : action === 'cancel' ? admin.cancel(user, id, body.reason)
            : admin.renew(user, id, body.months)
        } else if ((r = m(/^licenses\/([A-Z0-9-]+)\/devices\/([A-Za-z0-9-]+)\/(unlink|clear-flag)$/)) && req.method === 'POST') {
          r = r[3] === 'unlink' ? admin.unlinkDevice(user, r[1], r[2]) : admin.clearFlag(user, r[1], r[2])
        } else if (route === 'devices') r = admin.listDevices(user)
        else if (route === 'audit') r = admin.listAudit(user, { license: url.searchParams.get('license'), q: url.searchParams.get('q'), limit: url.searchParams.get('limit') })
        else if (route === 'users' && req.method === 'GET') r = admin.listUsers(user)
        else if (route === 'users') r = admin.createUser(user, body)
        else if ((r = m(/^users\/(\d+)$/)) && req.method === 'PUT') r = admin.updateUser(user, Number(r[1]), body)
        else if (route === 'settings' && req.method === 'GET') r = admin.getSettings(user)
        else if (route === 'settings') r = admin.putSettings(user, body)
        else throw new ApiError(404, 'not_found')
        return send(res, 200, r)
      }

      throw new ApiError(404, 'not_found')
    } catch (err) {
      if (err instanceof ApiError) {
        return send(res, err.status, { ok: false, code: err.code, message: err.message }, path.startsWith('/v1/') ? corsFor(req) : {})
      }
      // Never leak internals to the caller; the operator sees them in the server log.
      console.error('[error]', err)
      send(res, 500, { ok: false, code: 'server_error', message: CLIENT_MESSAGES.server_error })
    }
  }

  return httpServer(handler)
}
