import { checkPassword, hashPassword, newActivationCode, normalizeCode, randomToken, sha256, signToken, verifyToken } from './crypto.js'
import { PLANS, featuresOf, isPlan } from './plans.js'

/* -------------------------------------------------------------------------- */
/*  Errors: what the customer sees is always plain language                    */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message ?? CLIENT_MESSAGES[code] ?? 'Error.')
    this.status = status
    this.code = code
  }
}

export const CLIENT_MESSAGES = {
  invalid_code: 'El código de activación no es válido. Revisa que esté completo y que el nombre de la empresa sea el registrado.',
  pending: 'Esta licencia todavía está pendiente de autorización. Contacta a tu proveedor.',
  suspended: 'Esta licencia está suspendida. Contacta a tu proveedor para reactivarla.',
  expired: 'La licencia venció. Solicita la renovación a tu proveedor.',
  cancelled: 'Esta licencia fue cancelada. Contacta a tu proveedor.',
  device_limit: 'Esta licencia ya está vinculada a otro dispositivo. Contacte al administrador para autorizar este equipo.',
  device_unauthorized: 'Esta licencia ya está vinculada a otro dispositivo. Contacte al administrador para autorizar este equipo.',
  invalid_token: 'La activación de este equipo ya no es válida. Vuelve a activar el producto.',
  rate_limited: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  bad_request: 'Los datos enviados no son válidos.',
  server_error: 'Error temporal del servidor. Inténtalo de nuevo en unos minutos.',
  unauthorized: 'Inicia sesión para continuar.',
  forbidden: 'No tienes permiso para esta acción.',
  not_found: 'No se encontró el registro.',
  conflict: 'La acción no se puede realizar en el estado actual.',
}

/* -------------------------------------------------------------------------- */
/*  Roles                                                                      */
/* -------------------------------------------------------------------------- */

/** owner: everything · admin: day-to-day operation · vendedor: own customers, can only *request* a licence. */
const CAN = {
  owner: new Set(['*']),
  admin: new Set([
    'dashboard', 'companies.read', 'companies.write', 'licenses.read', 'licenses.create', 'licenses.approve',
    'licenses.manage', 'devices.read', 'devices.unlink', 'audit.read', 'errors.read',
  ]),
  vendedor: new Set(['companies.read', 'companies.write', 'licenses.read', 'licenses.request']),
}
export const can = (role, action) => CAN[role]?.has('*') || CAN[role]?.has(action) || false

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DAY = 86_400_000
const nameKey = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function addMonths(date, months) {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  if (d.getUTCDate() < day) d.setUTCDate(0) // 31 Jan + 1 month → end of Feb
  return d
}

const str = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null)
const int = (v, min, max, fallback) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/

export function createService(db, { clock = () => new Date() } = {}) {
  const nowDate = () => clock()
  const now = () => nowDate().toISOString()
  const get = (sql, ...p) => db.prepare(sql).get(...p)
  const all = (sql, ...p) => db.prepare(sql).all(...p)
  const run = (sql, ...p) => db.prepare(sql).run(...p)
  const setting = (key) => get('SELECT value FROM settings WHERE key = ?', key)?.value

  /* ------------------------------- audit -------------------------------- */
  function audit(actor, action, { license, company, device, ip, result = 'ok', detail, role } = {}) {
    const lic = license ? get('SELECT l.id, c.id AS cid, c.name FROM licenses l JOIN companies c ON c.id = l.company_id WHERE l.id = ?', license) : null
    const comp = company ? get('SELECT id, name FROM companies WHERE id = ?', company) : null
    run(
      'INSERT INTO audit (ts, actor, actor_role, action, license_id, company_id, company_name, device_id, ip, result, detail) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      now(), actor, role ?? null, action, lic?.id ?? null, lic?.cid ?? comp?.id ?? null, lic?.name ?? comp?.name ?? null,
      device ?? null, ip ?? null, result, detail ? String(detail).slice(0, 500) : null,
    )
  }

  /* --------------------------- license state ---------------------------- */
  function effectiveStatus(l) {
    if (l.status === 'active' && l.expires_at && nowDate().getTime() > Date.parse(l.expires_at)) return 'expired'
    return l.status
  }

  const toleranceDays = (l) => l.tolerance_days ?? int(setting('default_tolerance_days'), 0, 365, 30)

  function licenseRow(id) {
    return get(
      'SELECT l.*, c.name AS company_name, c.vendor_id AS vendor_id FROM licenses l JOIN companies c ON c.id = l.company_id WHERE l.id = ?',
      id,
    )
  }

  /** What a customer's program may learn about its own license — nothing more. */
  function clientView(l) {
    const st = effectiveStatus(l)
    return {
      id: l.id,
      company: l.company_name,
      plan: l.plan,
      planLabel: PLANS[l.plan]?.label ?? l.plan,
      status: st,
      expiresAt: l.expires_at,
      activatedAt: l.activated_at,
      maxDevices: l.max_devices,
      devices: get("SELECT COUNT(*) AS n FROM devices WHERE license_id = ? AND status = 'active'", l.id).n,
      features: featuresOf(l.plan),
    }
  }

  function issueToken(l, device) {
    const iat = nowDate()
    const tol = toleranceDays(l)
    const payload = {
      v: 1,
      lid: l.id,
      cid: l.company_id,
      co: l.company_name,
      dev: device.device_id,
      st: effectiveStatus(l),
      plan: l.plan,
      feat: featuresOf(l.plan),
      max: l.max_devices,
      exp: l.expires_at,
      iat: iat.toISOString(),
      vu: new Date(iat.getTime() + tol * DAY).toISOString(),
      tol,
    }
    return signToken(payload)
  }

  /* ====================================================================== */
  /*  Public (client) API — Windows today, Android tomorrow                  */
  /* ====================================================================== */

  function activate(input) {
    const ip = input.ip
    const code = normalizeCode(input.code)
    const deviceId = str(input.deviceId, 64)
    if (!code || !deviceId || !DEVICE_RE.test(deviceId) || !str(input.companyName)) throw new ApiError(400, 'invalid_code')

    const l = get(
      'SELECT l.*, c.name AS company_name, c.vendor_id AS vendor_id FROM licenses l JOIN companies c ON c.id = l.company_id WHERE l.code_hash = ?',
      sha256(code),
    )
    if (!l) {
      audit('cliente', 'activation.attempt', { device: deviceId, ip, result: 'fail', detail: 'Código desconocido' })
      throw new ApiError(404, 'invalid_code')
    }
    if (nameKey(l.company_name) !== nameKey(input.companyName)) {
      audit('cliente', 'activation.attempt', { license: l.id, device: deviceId, ip, result: 'fail', detail: 'El nombre de la empresa no coincide' })
      throw new ApiError(404, 'invalid_code')
    }
    const st = effectiveStatus(l)
    if (st !== 'active') {
      audit('cliente', 'activation.attempt', { license: l.id, device: deviceId, ip, result: 'fail', detail: `Licencia ${st}` })
      throw new ApiError(403, st)
    }

    let device = get('SELECT * FROM devices WHERE license_id = ? AND device_id = ?', l.id, deviceId)
    if (device && device.status === 'unlinked') {
      // The same machine coming back after you unlinked it counts as a new slot.
      device = null
      run('DELETE FROM devices WHERE license_id = ? AND device_id = ?', l.id, deviceId)
    }
    if (!device) {
      const used = get("SELECT COUNT(*) AS n FROM devices WHERE license_id = ? AND status = 'active'", l.id).n
      if (used >= l.max_devices) {
        audit('cliente', 'activation.unauthorized_device', {
          license: l.id, device: deviceId, ip, result: 'fail', detail: `Límite de ${l.max_devices} dispositivo(s) alcanzado`,
        })
        throw new ApiError(403, 'device_limit')
      }
      run(
        'INSERT INTO devices (license_id, device_id, name, platform, env_hash, activated_at, last_seen_at, last_validated_at, app_version, ip) VALUES (?,?,?,?,?,?,?,?,?,?)',
        l.id, deviceId, str(input.deviceName, 80), str(input.platform, 30), str(input.envHash, 80), now(), now(), now(), str(input.appVersion, 30), ip ?? null,
      )
      audit('cliente', 'device.activated', { license: l.id, device: deviceId, ip, detail: str(input.deviceName, 80) })
    } else {
      audit('cliente', 'device.reactivated', { license: l.id, device: deviceId, ip })
    }

    if (!l.activated_at) {
      const expires = l.expires_at ?? addMonths(nowDate(), l.term_months).toISOString()
      run('UPDATE licenses SET activated_at = ?, expires_at = ? WHERE id = ?', now(), expires, l.id)
    }
    run('UPDATE licenses SET last_validated_at = ?, app_version = ? WHERE id = ?', now(), str(input.appVersion, 30), l.id)

    const fresh = licenseRow(l.id)
    return { ok: true, token: issueToken(fresh, { device_id: deviceId }), license: clientView(fresh) }
  }

  /** Verifies the token the device already holds: proof it was activated here. */
  function proof(input) {
    const p = verifyToken(input.token)
    if (!p || p.lid !== input.licenseId || p.dev !== input.deviceId) throw new ApiError(401, 'invalid_token')
    return p
  }

  function validate(input) {
    proof(input)
    const ip = input.ip
    const l = licenseRow(input.licenseId)
    const device = l && get('SELECT * FROM devices WHERE license_id = ? AND device_id = ?', l.id, input.deviceId)
    if (!l || !device || device.status !== 'active') {
      audit('cliente', 'validation.unauthorized_device', { license: l?.id, device: input.deviceId, ip, result: 'fail', detail: 'Dispositivo desvinculado o desconocido' })
      throw new ApiError(403, 'device_unauthorized')
    }

    // Soft environment check: log it, and only refuse if you turned that option on.
    const envHash = str(input.envHash, 80)
    let flagged = device.env_flag === 1
    if (!device.env_hash && envHash) {
      run('UPDATE devices SET env_hash = ? WHERE id = ?', envHash, device.id)
      device.env_hash = envHash
    }
    if (device.env_hash && envHash && device.env_hash !== envHash && !flagged) {
      flagged = true
      run('UPDATE devices SET env_flag = 1 WHERE id = ?', device.id)
      audit('sistema', 'device.env_changed', { license: l.id, device: device.device_id, ip, result: 'warn', detail: 'El entorno del equipo cambió: posible copia de la instalación' })
    }
    if (flagged && setting('block_on_env_change') === 'true') {
      audit('cliente', 'validation.blocked_env', { license: l.id, device: device.device_id, ip, result: 'fail' })
      throw new ApiError(403, 'device_unauthorized')
    }

    run(
      'UPDATE devices SET last_seen_at = ?, last_validated_at = ?, app_version = ?, ip = ? WHERE id = ?',
      now(), now(), str(input.appVersion, 30), ip ?? null, device.id,
    )
    run('UPDATE licenses SET last_validated_at = ?, app_version = ? WHERE id = ?', now(), str(input.appVersion, 30), l.id)
    const st = effectiveStatus(l)
    audit('cliente', 'validation.ok', { license: l.id, device: device.device_id, ip, result: st === 'active' ? 'ok' : 'warn', detail: st === 'active' ? null : `Estado: ${st}` })
    return { ok: true, token: issueToken(l, device), license: clientView(l) }
  }

  /** Light status check: no token issued, nothing recorded. */
  function status(input) {
    proof(input)
    const l = licenseRow(input.licenseId)
    const device = l && get('SELECT status FROM devices WHERE license_id = ? AND device_id = ?', l.id, input.deviceId)
    if (!l || device?.status !== 'active') throw new ApiError(403, 'device_unauthorized')
    return { ok: true, license: clientView(l), serverTime: now() }
  }


  /**
   * Error reports from the installed programs (technical only: message, stack, screen).
   * Grouped per device by fingerprint so a loop of the same bug is one row with a counter.
   */
  function report(input) {
    proof(input)
    const l = licenseRow(input.licenseId)
    const device = l && get('SELECT status FROM devices WHERE license_id = ? AND device_id = ?', l.id, input.deviceId)
    if (!l || device?.status !== 'active') throw new ApiError(403, 'device_unauthorized')
    const items = Array.isArray(input.errors) ? input.errors.slice(0, 20) : []
    let saved = 0
    for (const e of items) {
      const message = str(e?.message, 300)
      if (!message) continue
      const fingerprint = sha256(`${message}|${str(e?.stack, 200) ?? ''}`).slice(0, 16)
      const times = int(e?.count, 1, 1000, 1)
      const at = Number.isNaN(Date.parse(e?.at)) ? now() : new Date(e.at).toISOString()
      run(
        `INSERT INTO error_reports (license_id, device_id, fingerprint, message, stack, path, app_version, count, first_at, last_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT (license_id, device_id, fingerprint) DO UPDATE SET count = count + excluded.count, last_at = excluded.last_at, app_version = excluded.app_version`,
        l.id, input.deviceId, fingerprint, message, str(e?.stack, 1500), str(e?.path, 120), str(input.appVersion, 30), times, at, now(),
      )
      saved += 1
    }
    // Keep the table small: the 200 most recent per license.
    run(
      'DELETE FROM error_reports WHERE license_id = ?1 AND id NOT IN (SELECT id FROM error_reports WHERE license_id = ?1 ORDER BY last_at DESC LIMIT 200)',
      l.id,
    )
    return { ok: true, saved }
  }

  /* ====================================================================== */
  /*  Admin API                                                              */
  /* ====================================================================== */

  const need = (user, action) => {
    if (!can(user.role, action)) throw new ApiError(403, 'forbidden')
  }
  const actorOf = (u) => u.email
  const vendorScope = (user) => (user.role === 'vendedor' ? user.id : null)

  function view(l) {
    const devices = all("SELECT status FROM devices WHERE license_id = ?", l.id).filter((d) => d.status === 'active').length
    return {
      id: l.id, companyId: l.company_id, company: l.company_name, plan: l.plan, planLabel: PLANS[l.plan]?.label ?? l.plan,
      maxDevices: l.max_devices, deviceCount: devices, status: effectiveStatus(l), storedStatus: l.status,
      termMonths: l.term_months, expiresAt: l.expires_at, activatedAt: l.activated_at, codeHint: l.code_hint,
      toleranceDays: l.tolerance_days, notes: l.notes, requestedByVendor: !!l.requested_by_vendor,
      approvedAt: l.approved_at, approvedBy: l.approved_by, lastValidatedAt: l.last_validated_at,
      appVersion: l.app_version, createdAt: l.created_at, createdBy: l.created_by,
    }
  }

  /** A vendor only ever touches licenses of companies assigned to them. */
  function ownLicense(user, id) {
    const l = licenseRow(id)
    if (!l) throw new ApiError(404, 'not_found')
    if (user.role === 'vendedor' && l.vendor_id !== user.id) throw new ApiError(404, 'not_found')
    return l
  }

  function issueCode(l, user) {
    const code = newActivationCode()
    run('UPDATE licenses SET code_hash = ?, code_hint = ? WHERE id = ?', sha256(code), code.slice(-4), l.id)
    audit(actorOf(user), 'license.code_issued', { license: l.id, role: user.role })
    return code
  }

  const nextLicenseId = () => {
    const seq = (get('SELECT COALESCE(MAX(seq), 0) AS n FROM licenses').n ?? 0) + 1
    return { seq, id: `LIC-${nowDate().getUTCFullYear()}-${String(seq).padStart(5, '0')}` }
  }

  const admin = {
    /* ------------------------------ session ------------------------------ */
    login(email, password, ip) {
      const u = get('SELECT * FROM users WHERE email = ? AND active = 1', String(email ?? '').trim().toLowerCase())
      // Same work whether or not the user exists, so response time leaks nothing.
      const ok = u ? checkPassword(String(password ?? ''), u.salt, u.password_hash) : (hashPassword('x'), false)
      if (!u || !ok) {
        audit(String(email ?? '').slice(0, 80), 'auth.login', { ip, result: 'fail' })
        throw new ApiError(401, 'unauthorized', 'Correo o contraseña incorrectos.')
      }
      const token = randomToken()
      run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha256(token), u.id, new Date(nowDate().getTime() + 12 * 3600_000).toISOString())
      audit(u.email, 'auth.login', { ip, role: u.role })
      return { token, user: { id: u.id, email: u.email, name: u.name, role: u.role } }
    },
    logout(token) {
      run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
    },
    authenticate(token) {
      if (!token) return null
      const row = get(
        'SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1',
        sha256(token),
      )
      if (!row || Date.parse(row.expires_at) < nowDate().getTime()) return null
      return { id: row.id, email: row.email, name: row.name, role: row.role }
    },

    /* ----------------------------- dashboard ----------------------------- */
    dashboard(user) {
      need(user, 'dashboard')
      const rows = all('SELECT l.*, c.name AS company_name FROM licenses l JOIN companies c ON c.id = l.company_id')
      const by = { pending: 0, active: 0, suspended: 0, expired: 0, cancelled: 0 }
      const soon = []
      for (const l of rows) {
        const st = effectiveStatus(l)
        by[st] += 1
        if (st === 'active' && l.expires_at) {
          const days = Math.ceil((Date.parse(l.expires_at) - nowDate().getTime()) / DAY)
          if (days <= 30) soon.push({ id: l.id, company: l.company_name, expiresAt: l.expires_at, days })
        }
      }
      return {
        companiesWithActiveLicense: new Set(rows.filter((l) => effectiveStatus(l) === 'active').map((l) => l.company_id)).size,
        companies: get('SELECT COUNT(*) AS n FROM companies').n,
        licenses: by,
        expiringSoon: soon.sort((a, b) => a.days - b.days),
        activeDevices: get("SELECT COUNT(*) AS n FROM devices WHERE status = 'active'").n,
        flaggedDevices: get("SELECT COUNT(*) AS n FROM devices WHERE status = 'active' AND env_flag = 1").n,
        errors24h: get('SELECT COUNT(*) AS n FROM error_reports WHERE last_at > ?', new Date(nowDate().getTime() - DAY).toISOString()).n,
        pendingApproval: rows.filter((l) => l.status === 'pending').length,
        lastValidations: all(
          `SELECT d.device_id, d.last_validated_at, d.app_version, l.id AS license_id, c.name AS company
           FROM devices d JOIN licenses l ON l.id = d.license_id JOIN companies c ON c.id = l.company_id
           WHERE d.last_validated_at IS NOT NULL ORDER BY d.last_validated_at DESC LIMIT 8`,
        ),
      }
    },

    /* ----------------------------- companies ----------------------------- */
    listCompanies(user) {
      need(user, 'companies.read')
      const v = vendorScope(user)
      const rows = v ? all('SELECT * FROM companies WHERE vendor_id = ? ORDER BY name', v) : all('SELECT * FROM companies ORDER BY name')
      return rows.map((c) => ({
        ...c,
        vendorName: c.vendor_id ? get('SELECT name FROM users WHERE id = ?', c.vendor_id)?.name : null,
        licenses: all('SELECT id, plan, status, expires_at FROM licenses WHERE company_id = ?', c.id).map((l) => ({
          id: l.id, plan: l.plan, status: effectiveStatus(l), expiresAt: l.expires_at,
        })),
      }))
    },
    createCompany(user, d) {
      need(user, 'companies.write')
      const name = str(d.name, 120)
      if (!name) throw new ApiError(400, 'bad_request', 'Escribe el nombre de la empresa.')
      const vendorId = user.role === 'vendedor' ? user.id : int(d.vendorId, 1, 1e9, null)
      const r = run(
        'INSERT INTO companies (name, contact, phone, email, address, notes, vendor_id, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
        name, str(d.contact), str(d.phone, 40), str(d.email), str(d.address, 300), str(d.notes, 1000), vendorId, now(), actorOf(user),
      )
      audit(actorOf(user), 'company.created', { company: Number(r.lastInsertRowid), role: user.role, detail: name })
      return { id: Number(r.lastInsertRowid) }
    },
    updateCompany(user, id, d) {
      need(user, 'companies.write')
      const c = get('SELECT * FROM companies WHERE id = ?', id)
      if (!c || (user.role === 'vendedor' && c.vendor_id !== user.id)) throw new ApiError(404, 'not_found')
      const vendorId = user.role === 'vendedor' ? c.vendor_id : d.vendorId === undefined ? c.vendor_id : int(d.vendorId, 1, 1e9, null)
      run(
        'UPDATE companies SET name=?, contact=?, phone=?, email=?, address=?, notes=?, vendor_id=? WHERE id=?',
        str(d.name, 120) ?? c.name, str(d.contact), str(d.phone, 40), str(d.email), str(d.address, 300), str(d.notes, 1000), vendorId, id,
      )
      audit(actorOf(user), 'company.updated', { company: id, role: user.role })
      return { ok: true }
    },

    /* ----------------------------- licenses ------------------------------ */
    listLicenses(user) {
      need(user, 'licenses.read')
      const v = vendorScope(user)
      const base = 'SELECT l.*, c.name AS company_name, c.vendor_id AS vendor_id FROM licenses l JOIN companies c ON c.id = l.company_id'
      const rows = v ? all(`${base} WHERE c.vendor_id = ? ORDER BY l.seq DESC`, v) : all(`${base} ORDER BY l.seq DESC`)
      return rows.map(view)
    },
    getLicense(user, id) {
      need(user, 'licenses.read')
      const l = ownLicense(user, id)
      return {
        ...view(l),
        devices: all('SELECT * FROM devices WHERE license_id = ? ORDER BY activated_at DESC', id).map(deviceView),
        history: user.role === 'vendedor' ? [] : all('SELECT * FROM audit WHERE license_id = ? ORDER BY id DESC LIMIT 30', id),
      }
    },
    createLicense(user, d) {
      const vendor = user.role === 'vendedor'
      need(user, vendor ? 'licenses.request' : 'licenses.create')
      const company = get('SELECT * FROM companies WHERE id = ?', int(d.companyId, 1, 1e9, 0))
      if (!company || (vendor && company.vendor_id !== user.id)) throw new ApiError(404, 'not_found')
      const plan = isPlan(d.plan) ? d.plan : 'basico'
      const { seq, id } = nextLicenseId()
      // A vendor's numbers are only a wish: the license gets the plan defaults and the
      // request is written in the notes for you to weigh when you approve it.
      const maxDevices = vendor ? PLANS[plan].defaultDevices : int(d.maxDevices, 1, 500, PLANS[plan].defaultDevices)
      const term = vendor ? 12 : int(d.termMonths, 1, 120, 12)
      const wish = vendor ? [int(d.maxDevices, 1, 500, null) && `${d.maxDevices} dispositivo(s)`, int(d.termMonths, 1, 120, null) && `${d.termMonths} mes(es)`].filter(Boolean).join(', ') : ''
      // A vendor can only ask: the license is born pending and has no activation code.
      const authorize = !vendor && d.authorize === true
      run(
        `INSERT INTO licenses (id, seq, company_id, plan, max_devices, status, term_months, tolerance_days, notes, requested_by_vendor, approved_at, approved_by, created_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, seq, company.id, plan, maxDevices, authorize ? 'active' : 'pending', term,
        vendor ? null : d.toleranceDays === '' || d.toleranceDays == null ? null : int(d.toleranceDays, 0, 365, null),
        str([d.notes, wish && `Solicitado por el vendedor: ${wish}.`].filter(Boolean).join(' '), 1000), vendor ? 1 : 0, authorize ? now() : null, authorize ? actorOf(user) : null, now(), actorOf(user),
      )
      audit(actorOf(user), vendor ? 'license.requested' : 'license.created', { license: id, role: user.role, detail: `${PLANS[plan].label}, ${maxDevices} dispositivo(s)` })
      const code = authorize ? issueCode(licenseRow(id), user) : null
      return { id, code }
    },
    /** Owner/admin approval of a pending license: the moment it becomes usable. */
    approveLicense(user, id) {
      need(user, 'licenses.approve')
      const l = ownLicense(user, id)
      if (l.status !== 'pending') throw new ApiError(409, 'conflict', 'Solo una licencia pendiente se puede autorizar.')
      run("UPDATE licenses SET status = 'active', approved_at = ?, approved_by = ? WHERE id = ?", now(), actorOf(user), id)
      audit(actorOf(user), 'license.approved', { license: id, role: user.role })
      return { code: issueCode(licenseRow(id), user) }
    },
    regenerateCode(user, id) {
      need(user, 'licenses.manage')
      const l = ownLicense(user, id)
      if (l.status === 'pending') throw new ApiError(409, 'conflict', 'Autoriza la licencia primero.')
      return { code: issueCode(l, user) }
    },
    suspend(user, id, reason) {
      need(user, 'licenses.manage')
      const l = ownLicense(user, id)
      if (l.status !== 'active') throw new ApiError(409, 'conflict', 'Solo una licencia activa se puede suspender.')
      run("UPDATE licenses SET status = 'suspended' WHERE id = ?", id)
      audit(actorOf(user), 'license.suspended', { license: id, role: user.role, detail: str(reason, 200) })
      return { ok: true }
    },
    reactivate(user, id) {
      need(user, 'licenses.manage')
      const l = ownLicense(user, id)
      if (!['suspended', 'cancelled'].includes(l.status)) throw new ApiError(409, 'conflict', 'La licencia no está suspendida ni cancelada.')
      if (l.status === 'cancelled' && user.role !== 'owner') throw new ApiError(403, 'forbidden', 'Solo el propietario puede reactivar una licencia cancelada.')
      run("UPDATE licenses SET status = 'active' WHERE id = ?", id)
      audit(actorOf(user), 'license.reactivated', { license: id, role: user.role })
      return { ok: true }
    },
    cancel(user, id, reason) {
      need(user, 'licenses.manage')
      const l = ownLicense(user, id)
      if (l.status === 'cancelled') throw new ApiError(409, 'conflict')
      run("UPDATE licenses SET status = 'cancelled' WHERE id = ?", id)
      audit(actorOf(user), 'license.cancelled', { license: id, role: user.role, detail: str(reason, 200) })
      return { ok: true }
    },
    renew(user, id, months) {
      need(user, 'licenses.manage')
      const l = ownLicense(user, id)
      const m = int(months, 1, 120, 0)
      if (!m || l.status === 'pending') throw new ApiError(400, 'bad_request', 'Indica los meses a renovar en una licencia autorizada.')
      const from = l.expires_at && Date.parse(l.expires_at) > nowDate().getTime() ? new Date(l.expires_at) : nowDate()
      const expires = addMonths(from, m).toISOString()
      run('UPDATE licenses SET expires_at = ?, activated_at = COALESCE(activated_at, ?) WHERE id = ?', expires, now(), id)
      audit(actorOf(user), 'license.renewed', { license: id, role: user.role, detail: `+${m} mes(es) → ${expires.slice(0, 10)}` })
      return { expiresAt: expires }
    },
    updateLicense(user, id, d) {
      need(user, 'licenses.manage')
      const l = ownLicense(user, id)
      const plan = d.plan === undefined ? l.plan : isPlan(d.plan) ? d.plan : null
      if (!plan) throw new ApiError(400, 'bad_request', 'Plan desconocido.')
      const changes = []
      const maxDevices = d.maxDevices === undefined ? l.max_devices : int(d.maxDevices, 1, 500, null)
      if (maxDevices == null) throw new ApiError(400, 'bad_request', 'Límite de dispositivos no válido.')
      let expires = l.expires_at
      if (d.expiresAt !== undefined) {
        if (d.expiresAt === null || d.expiresAt === '') expires = null
        else if (Number.isNaN(Date.parse(d.expiresAt))) throw new ApiError(400, 'bad_request', 'Fecha de vencimiento no válida.')
        else expires = new Date(d.expiresAt).toISOString()
      }
      const tol = d.toleranceDays === undefined ? l.tolerance_days : d.toleranceDays === '' || d.toleranceDays === null ? null : int(d.toleranceDays, 0, 365, null)
      if (plan !== l.plan) changes.push(`plan ${l.plan}→${plan}`)
      if (maxDevices !== l.max_devices) changes.push(`dispositivos ${l.max_devices}→${maxDevices}`)
      if (expires !== l.expires_at) changes.push(`vence ${l.expires_at?.slice(0, 10) ?? '—'}→${expires?.slice(0, 10) ?? '—'}`)
      run('UPDATE licenses SET plan=?, max_devices=?, expires_at=?, tolerance_days=?, notes=? WHERE id=?', plan, maxDevices, expires, tol, d.notes === undefined ? l.notes : str(d.notes, 1000), id)
      audit(actorOf(user), 'license.updated', { license: id, role: user.role, detail: changes.join(', ') || 'Notas' })
      return { ok: true }
    },

    /* ------------------------------ devices ------------------------------ */
    listDevices(user) {
      need(user, 'devices.read')
      return all(
        `SELECT d.*, l.plan, c.name AS company FROM devices d JOIN licenses l ON l.id = d.license_id JOIN companies c ON c.id = l.company_id ORDER BY d.last_validated_at DESC`,
      ).map((d) => ({ ...deviceView(d), company: d.company, licenseId: d.license_id }))
    },
    unlinkDevice(user, licenseId, deviceId) {
      need(user, 'devices.unlink')
      ownLicense(user, licenseId)
      const d = get('SELECT * FROM devices WHERE license_id = ? AND device_id = ?', licenseId, deviceId)
      if (!d || d.status !== 'active') throw new ApiError(404, 'not_found')
      run("UPDATE devices SET status = 'unlinked' WHERE id = ?", d.id)
      audit(actorOf(user), 'device.unlinked', { license: licenseId, device: deviceId, role: user.role })
      return { ok: true }
    },
    /** Accept a device whose environment changed (e.g. after new hardware). */
    clearFlag(user, licenseId, deviceId) {
      need(user, 'devices.unlink')
      run('UPDATE devices SET env_flag = 0, env_hash = NULL WHERE license_id = ? AND device_id = ?', licenseId, deviceId)
      audit(actorOf(user), 'device.flag_cleared', { license: licenseId, device: deviceId, role: user.role })
      return { ok: true }
    },

    listErrors(user) {
      need(user, 'errors.read')
      return all(
        `SELECT r.*, c.name AS company FROM error_reports r JOIN licenses l ON l.id = r.license_id JOIN companies c ON c.id = l.company_id
         ORDER BY r.last_at DESC LIMIT 200`,
      )
    },

    /* ------------------------------- audit ------------------------------- */
    listAudit(user, { license, q, limit } = {}) {
      need(user, 'audit.read')
      const lim = int(limit, 1, 500, 200)
      const like = q ? `%${String(q).slice(0, 60)}%` : null
      return all(
        `SELECT * FROM audit WHERE (?1 IS NULL OR license_id = ?1)
           AND (?2 IS NULL OR actor LIKE ?2 OR action LIKE ?2 OR company_name LIKE ?2 OR license_id LIKE ?2 OR detail LIKE ?2 OR device_id LIKE ?2)
         ORDER BY id DESC LIMIT ${lim}`,
        license ?? null, like,
      )
    },

    /* ------------------------------- users ------------------------------- */
    listUsers(user) {
      need(user, '*')
      return all('SELECT id, email, name, role, active, created_at FROM users ORDER BY id')
    },
    createUser(user, d) {
      need(user, '*')
      const email = str(d.email, 120)?.toLowerCase()
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, 'bad_request', 'Correo no válido.')
      if (!['owner', 'admin', 'vendedor'].includes(d.role)) throw new ApiError(400, 'bad_request', 'Rol no válido.')
      if (String(d.password ?? '').length < 10) throw new ApiError(400, 'bad_request', 'La contraseña debe tener al menos 10 caracteres.')
      if (get('SELECT 1 FROM users WHERE email = ?', email)) throw new ApiError(409, 'conflict', 'Ya existe un usuario con ese correo.')
      const { salt, hash } = hashPassword(d.password)
      const r = run('INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES (?,?,?,?,?,?)', email, str(d.name, 80) ?? email, d.role, salt, hash, now())
      audit(actorOf(user), 'user.created', { role: user.role, detail: `${email} (${d.role})` })
      return { id: Number(r.lastInsertRowid) }
    },
    updateUser(user, id, d) {
      need(user, '*')
      const u = get('SELECT * FROM users WHERE id = ?', id)
      if (!u) throw new ApiError(404, 'not_found')
      const role = d.role === undefined ? u.role : d.role
      const active = d.active === undefined ? u.active : d.active ? 1 : 0
      if (!['owner', 'admin', 'vendedor'].includes(role)) throw new ApiError(400, 'bad_request', 'Rol no válido.')
      const owners = get("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1").n
      if (u.role === 'owner' && u.active && (role !== 'owner' || !active) && owners <= 1) {
        throw new ApiError(409, 'conflict', 'Debe existir al menos un propietario activo.')
      }
      let { salt, password_hash: hash } = u
      if (d.password) {
        if (String(d.password).length < 10) throw new ApiError(400, 'bad_request', 'La contraseña debe tener al menos 10 caracteres.')
        ;({ salt, hash } = hashPassword(d.password))
      }
      run('UPDATE users SET name=?, role=?, active=?, salt=?, password_hash=? WHERE id=?', str(d.name, 80) ?? u.name, role, active, salt, hash, id)
      if (!active || d.password) run('DELETE FROM sessions WHERE user_id = ?', id)
      audit(actorOf(user), 'user.updated', { role: user.role, detail: `${u.email}${role !== u.role ? ` rol→${role}` : ''}${active !== u.active ? (active ? ' activado' : ' desactivado') : ''}` })
      return { ok: true }
    },

    /* ------------------------------ settings ----------------------------- */
    getSettings(user) {
      need(user, '*')
      return Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]))
    },
    putSettings(user, d) {
      need(user, '*')
      const days = int(d.default_tolerance_days, 0, 365, null)
      if (days == null) throw new ApiError(400, 'bad_request', 'Los días de tolerancia deben ser de 0 a 365.')
      run("UPDATE settings SET value = ? WHERE key = 'default_tolerance_days'", String(days))
      run("UPDATE settings SET value = ? WHERE key = 'block_on_env_change'", d.block_on_env_change ? 'true' : 'false')
      audit(actorOf(user), 'settings.updated', { role: user.role, detail: `tolerancia ${days} días, bloqueo por entorno ${d.block_on_env_change ? 'sí' : 'no'}` })
      return { ok: true }
    },
    plans: () => Object.entries(PLANS).map(([key, p]) => ({ key, label: p.label, defaultDevices: p.defaultDevices, features: p.features })),
  }

  function deviceView(d) {
    return {
      deviceId: d.device_id, name: d.name, platform: d.platform, status: d.status, envFlag: !!d.env_flag,
      activatedAt: d.activated_at, lastSeenAt: d.last_seen_at, lastValidatedAt: d.last_validated_at, appVersion: d.app_version,
    }
  }

  return { activate, validate, status, report, admin, audit, effectiveStatus, _db: db }
}
