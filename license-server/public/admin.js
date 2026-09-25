/* Panel del propietario del producto. Separado por completo del panel de administración de las empresas. */
const $ = (s, r = document) => r.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-MX') : '—')
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const dateInput = (iso) => (iso ? iso.slice(0, 10) : '')

const STATUS = { pending: 'PENDIENTE', active: 'ACTIVA', suspended: 'SUSPENDIDA', expired: 'VENCIDA', cancelled: 'CANCELADA' }
const ROLE = { owner: 'Propietario', admin: 'Administrador', vendedor: 'Vendedor' }
const ACTIONS = {
  'license.created': 'Creó licencia', 'license.requested': 'Solicitó licencia', 'license.approved': 'Autorizó licencia',
  'license.code_issued': 'Emitió código de activación', 'license.suspended': 'Suspendió licencia', 'license.reactivated': 'Reactivó licencia',
  'license.cancelled': 'Canceló licencia', 'license.renewed': 'Renovó licencia', 'license.updated': 'Modificó licencia',
  'company.created': 'Creó empresa', 'company.updated': 'Modificó empresa', 'device.activated': 'Dispositivo activado',
  'device.reactivated': 'Dispositivo reactivado', 'device.unlinked': 'Desvinculó dispositivo', 'device.env_changed': 'Cambio de entorno del equipo',
  'device.flag_cleared': 'Aceptó cambio de entorno', 'activation.attempt': 'Intento de activación fallido',
  'activation.unauthorized_device': 'Activación desde dispositivo no autorizado', 'validation.ok': 'Validación', 'validation.unauthorized_device': 'Validación de dispositivo no autorizado',
  'validation.blocked_env': 'Validación bloqueada por cambio de entorno', 'auth.login': 'Inicio de sesión', 'user.created': 'Creó usuario', 'user.updated': 'Modificó usuario',
  'settings.updated': 'Cambió ajustes',
}
const NAV = {
  owner: ['dashboard', 'licenses', 'companies', 'devices', 'audit', 'users', 'settings'],
  admin: ['dashboard', 'licenses', 'companies', 'devices', 'audit'],
  vendedor: ['licenses', 'companies'],
}
const TITLES = { dashboard: 'Panel', licenses: 'Licencias', companies: 'Empresas', devices: 'Dispositivos', audit: 'Auditoría', users: 'Usuarios', settings: 'Ajustes' }

const state = { token: sessionStorage.getItem('nxt.t'), user: null, plans: [], view: 'dashboard', filter: '', q: '' }
const badge = (st) => `<span class="badge b-${esc(st)}">${esc(STATUS[st] ?? st)}</span>`
const planLabel = (k) => state.plans.find((p) => p.key === k)?.label ?? k

/* ------------------------------------------------------------------ api */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/admin/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== 'login') {
    signOut()
    throw new Error('Tu sesión expiró. Inicia sesión de nuevo.')
  }
  if (!res.ok) throw new Error(data.message || 'No se pudo completar la acción.')
  return data
}
function toast(msg) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toast.id)
  toast.id = setTimeout(() => t.classList.remove('show'), 3200)
}
const dlg = $('#dlg')
const openDlg = (html) => {
  dlg.innerHTML = html
  if (!dlg.open) dlg.showModal()
}
const closeDlg = () => dlg.open && dlg.close()
const fail = (e) => toast(e.message || 'Ocurrió un error.')
const dataOf = (form) => Object.fromEntries(new FormData(form))

/* --------------------------------------------------------------- session */
function signOut() {
  state.token = null
  state.user = null
  sessionStorage.removeItem('nxt.t')
  renderLogin()
}

function renderLogin() {
  closeDlg()
  $('#app').innerHTML = `
    <form class="card login" id="login" autocomplete="on">
      <h1>NEXOTIME</h1>
      <p class="muted" style="margin:0 0 16px">Panel de licencias · acceso del propietario</p>
      <div class="field"><label for="e">Correo</label><input id="e" name="email" type="email" autocomplete="username" required /></div>
      <div class="field"><label for="p">Contraseña</label><input id="p" name="password" type="password" autocomplete="current-password" required /></div>
      <div class="err" id="err"></div>
      <button class="btn primary" style="width:100%;justify-content:center">Entrar</button>
    </form>`
  $('#login').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    try {
      const r = await api('login', { method: 'POST', body: dataOf(ev.target) })
      state.token = r.token
      sessionStorage.setItem('nxt.t', r.token)
      await boot()
    } catch (e) {
      $('#err').textContent = e.message
    }
  })
}

async function boot() {
  if (!state.token) return renderLogin()
  try {
    const me = await api('me')
    state.user = me.user
    state.plans = me.plans
    state.view = NAV[me.user.role][0]
    renderShell()
  } catch {
    renderLogin()
  }
}

function renderShell() {
  const nav = NAV[state.user.role]
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand">NEXOTIME<small>Licencias</small></div>
      <nav>${nav.map((v) => `<button data-act="nav" data-id="${v}" class="${v === state.view ? 'on' : ''}">${TITLES[v]}</button>`).join('')}</nav>
      <div class="row muted"><span>${esc(state.user.name)} · ${ROLE[state.user.role]}</span><button class="btn sm" data-act="logout">Salir</button></div>
    </header>
    <main id="main"></main>`
  show(state.view)
}

async function show(view) {
  state.view = view
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.id === view))
  const main = $('#main')
  main.innerHTML = '<p class="muted">Cargando…</p>'
  try {
    main.innerHTML = await views[view]()
  } catch (e) {
    main.innerHTML = `<div class="card empty">${esc(e.message)}</div>`
  }
}
const refresh = () => show(state.view)

/* ----------------------------------------------------------------- views */
const head = (title, actions = '') => `<div class="head"><h2>${title}</h2><div class="row">${actions}</div></div>`
const stat = (label, n, cls = '') => `<div class="card stat"><span>${label}</span><b class="${cls}">${n}</b></div>`
const table = (cols, rows, empty) =>
  rows.length
    ? `<div class="card scroll" style="padding:4px 8px"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<div class="card empty">${empty}</div>`

const views = {
  async dashboard() {
    const d = await api('dashboard')
    const l = d.licenses
    return `${head('Panel')}
      <div class="grid">
        ${stat('Empresas con licencia activa', d.companiesWithActiveLicense)}
        ${stat('Licencias activas', l.active)}
        ${stat('Por vencer (30 días)', d.expiringSoon.length, d.expiringSoon.length ? 'warn-line' : '')}
        ${stat('Vencidas', l.expired)}
        ${stat('Suspendidas', l.suspended)}
        ${stat('Pendientes de autorizar', d.pendingApproval)}
        ${stat('Dispositivos activos', d.activeDevices)}
        ${stat('Equipos con cambio de entorno', d.flaggedDevices)}
      </div>
      <h3 class="sub">Licencias por vencer</h3>
      ${table(['Licencia', 'Empresa', 'Vence', 'Días'], d.expiringSoon.map((x) => `<tr class="click" data-act="license" data-id="${esc(x.id)}"><td class="mono">${esc(x.id)}</td><td>${esc(x.company)}</td><td>${fmtDate(x.expiresAt)}</td><td>${x.days}</td></tr>`), 'Ninguna licencia vence en los próximos 30 días.')}
      <h3 class="sub">Últimas validaciones</h3>
      ${table(['Fecha', 'Empresa', 'Licencia', 'Dispositivo', 'Versión'], d.lastValidations.map((x) => `<tr><td>${fmtDT(x.last_validated_at)}</td><td>${esc(x.company)}</td><td class="mono">${esc(x.license_id)}</td><td class="mono">${esc(x.device_id.slice(0, 14))}…</td><td>${esc(x.app_version ?? '—')}</td></tr>`), 'Todavía no hay validaciones.')}`
  },

  async licenses() {
    const all = await api('licenses')
    const f = state.filter
    const q = state.q.toLowerCase()
    const list = all.filter((l) => (!f || l.status === f) && (!q || `${l.id} ${l.company}`.toLowerCase().includes(q)))
    const filters = ['', 'active', 'pending', 'suspended', 'expired', 'cancelled']
    return `${head('Licencias', `<button class="btn primary" data-act="new-license">${state.user.role === 'vendedor' ? 'Solicitar licencia' : 'Nueva licencia'}</button>`)}
      <div class="row" style="margin-bottom:12px">
        <input id="q" placeholder="Buscar por licencia o empresa" value="${esc(state.q)}" style="max-width:280px" />
        <select id="f" style="max-width:200px">${filters.map((s) => `<option value="${s}" ${s === f ? 'selected' : ''}>${s ? STATUS[s] : 'Todos los estados'}</option>`).join('')}</select>
      </div>
      ${table(['Licencia', 'Empresa', 'Plan', 'Estado', 'Dispositivos', 'Activación', 'Vencimiento', 'Última validación'],
        list.map((l) => `<tr class="click" data-act="license" data-id="${esc(l.id)}"><td class="mono">${esc(l.id)}</td><td>${esc(l.company)}${l.requestedByVendor && l.status === 'pending' ? ' <span class="badge b-warn">SOLICITUD</span>' : ''}</td><td>${esc(l.planLabel)}</td><td>${badge(l.status)}</td><td>${l.deviceCount} / ${l.maxDevices}</td><td>${fmtDate(l.activatedAt)}</td><td>${fmtDate(l.expiresAt)}</td><td>${fmtDT(l.lastValidatedAt)}</td></tr>`),
        'No hay licencias con esos filtros.')}`
  },

  async companies() {
    const rows = await api('companies')
    state.companies = rows
    return `${head('Empresas', '<button class="btn primary" data-act="new-company">Nueva empresa</button>')}
      ${table(['Empresa', 'Contacto', 'Teléfono', 'Correo', 'Vendedor', 'Licencias'],
        rows.map((c) => `<tr class="click" data-act="company" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.contact ?? '—')}</td><td>${esc(c.phone ?? '—')}</td><td>${esc(c.email ?? '—')}</td><td>${esc(c.vendorName ?? '—')}</td><td>${c.licenses.map((l) => `<span class="mono">${esc(l.id)}</span> ${badge(l.status)}`).join('<br>') || '—'}</td></tr>`),
        'Todavía no hay empresas.')}`
  },

  async devices() {
    const rows = await api('devices')
    return `${head('Dispositivos')}
      ${table(['Empresa', 'Licencia', 'Device ID', 'Nombre', 'Activación', 'Última conexión', 'Última validación', 'Versión', 'Estado'],
        rows.map((d) => `<tr><td>${esc(d.company)}</td><td class="mono">${esc(d.licenseId)}</td><td class="mono">${esc(d.deviceId)}</td><td>${esc(d.name ?? '—')} <span class="muted">${esc(d.platform ?? '')}</span></td><td>${fmtDate(d.activatedAt)}</td><td>${fmtDT(d.lastSeenAt)}</td><td>${fmtDT(d.lastValidatedAt)}</td><td>${esc(d.appVersion ?? '—')}</td><td>${d.status === 'unlinked' ? '<span class="badge b-expired">DESVINCULADO</span>' : d.envFlag ? '<span class="badge b-warn">REVISAR ENTORNO</span>' : '<span class="badge b-ok">ACTIVO</span>'}</td></tr>`),
        'Todavía no hay dispositivos activados.')}`
  },

  async audit() {
    const rows = await api(`audit?limit=300${state.q ? `&q=${encodeURIComponent(state.q)}` : ''}`)
    return `${head('Auditoría')}
      <div class="row" style="margin-bottom:12px"><input id="q" placeholder="Buscar usuario, licencia, empresa, dispositivo…" value="${esc(state.q)}" style="max-width:360px" /></div>
      ${table(['Fecha', 'Usuario', 'Acción', 'Licencia', 'Empresa', 'Dispositivo', 'IP', 'Resultado', 'Detalle'],
        rows.map((a) => `<tr><td>${fmtDT(a.ts)}</td><td>${esc(a.actor)}${a.actor_role ? ` <span class="muted">(${ROLE[a.actor_role] ?? ''})</span>` : ''}</td><td>${esc(ACTIONS[a.action] ?? a.action)}</td><td class="mono">${esc(a.license_id ?? '—')}</td><td>${esc(a.company_name ?? '—')}</td><td class="mono">${esc(a.device_id ? a.device_id.slice(0, 9) + '…' : '—')}</td><td class="mono">${esc(a.ip ?? '—')}</td><td><span class="badge b-${a.result === 'ok' ? 'ok' : a.result === 'warn' ? 'warn' : 'fail'}">${esc(a.result.toUpperCase())}</span></td><td>${esc(a.detail ?? '')}</td></tr>`),
        'Sin registros.')}`
  },

  async users() {
    const rows = await api('users')
    return `${head('Usuarios del panel', '<button class="btn primary" data-act="new-user">Nuevo usuario</button>')}
      ${table(['Nombre', 'Correo', 'Rol', 'Estado', ''],
        rows.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${ROLE[u.role]}</td><td>${u.active ? '<span class="badge b-ok">ACTIVO</span>' : '<span class="badge b-expired">INACTIVO</span>'}</td><td><button class="btn sm" data-act="edit-user" data-id="${u.id}" data-json='${esc(JSON.stringify(u))}'>Editar</button></td></tr>`),
        'Sin usuarios.')}
      <p class="muted" style="margin-top:14px">Propietario: control total. Administrador: opera licencias sin gestionar usuarios ni ajustes. Vendedor: ve solo sus empresas y solicita licencias que tú autorizas.</p>`
  },

  async settings() {
    const s = await api('settings')
    return `${head('Ajustes')}
      <form class="card" id="settings" style="max-width:560px">
        <div class="field"><label>Días de tolerancia sin Internet</label>
          <input name="default_tolerance_days" type="number" min="0" max="365" value="${esc(s.default_tolerance_days)}" />
          <p class="muted" style="margin:6px 0 0">Cuánto tiempo puede seguir funcionando un equipo sin validar con este servidor. Cada licencia puede tener su propio valor. Se aplica a las validaciones siguientes.</p></div>
        <div class="field"><label><input type="checkbox" name="block_on_env_change" style="width:auto" ${s.block_on_env_change === 'true' ? 'checked' : ''}/> Bloquear equipos cuyo entorno cambió mucho</label>
          <p class="muted" style="margin:6px 0 0">Desactivado (recomendado): solo se avisa en el panel. Actívalo si detectas copias.</p></div>
        <button class="btn primary">Guardar</button>
      </form>`
  },
}

/* ------------------------------------------------------------ dialogs */
const planOptions = (sel) => state.plans.map((p) => `<option value="${p.key}" ${p.key === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('')
const showCode = (code, id) =>
  openDlg(`<h3>Código de activación · ${esc(id)}</h3>
    <div class="code" id="code">${esc(code)}</div>
    <p class="warn-line">Cópialo y entrégalo al cliente ahora: por seguridad solo se muestra una vez. Si se pierde, genera uno nuevo.</p>
    <div class="actions"><button class="btn" data-act="copy" data-id="${esc(code)}">Copiar</button><button class="btn primary" data-act="close">Listo</button></div>`)

const dialogs = {
  async 'new-license'() {
    const companies = await api('companies')
    if (!companies.length) return toast('Primero crea una empresa.')
    const vend = state.user.role === 'vendedor'
    openDlg(`<h3>${vend ? 'Solicitar licencia' : 'Nueva licencia'}</h3>
      <form id="f-license">
        <div class="field"><label>Empresa</label><select name="companyId">${companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="two"><div class="field"><label>Plan</label><select name="plan">${planOptions('profesional')}</select></div>
        <div class="field"><label>Dispositivos${vend ? ' solicitados' : ''}</label><input name="maxDevices" type="number" min="1" max="500" value="1" /></div></div>
        <div class="two"><div class="field"><label>Vigencia (meses)</label><input name="termMonths" type="number" min="1" max="120" value="12" /></div>
        ${vend ? '' : '<div class="field"><label>Tolerancia sin Internet (días, vacío = ajuste general)</label><input name="toleranceDays" type="number" min="0" max="365" /></div>'}</div>
        <div class="field"><label>Notas administrativas</label><textarea name="notes" rows="2"></textarea></div>
        ${vend ? '<p class="muted">Quedará como solicitud. Solo el propietario o un administrador puede autorizarla y generar el código.</p>' : '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="authorize" checked style="width:auto"/> Autorizar ahora y generar el código de activación</label>'}
        <div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary">${vend ? 'Enviar solicitud' : 'Crear'}</button></div>
      </form>`)
    $('#f-license').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const d = dataOf(ev.target)
      try {
        const r = await api('licenses', { method: 'POST', body: { ...d, companyId: Number(d.companyId), authorize: !!d.authorize } })
        r.code ? showCode(r.code, r.id) : closeDlg()
        toast(r.code ? 'Licencia creada' : 'Solicitud enviada')
        refresh()
      } catch (e) { fail(e) }
    })
  },

  async license(id) {
    const l = await api(`licenses/${id}`)
    const role = state.user.role
    const manage = role !== 'vendedor'
    const st = l.status
    const btn = (act, label, cls = '') => `<button class="btn sm ${cls}" data-act="lic-${act}" data-id="${esc(l.id)}">${label}</button>`
    openDlg(`<h3>${esc(l.id)} ${badge(st)}</h3>
      <dl class="kv">
        <dt>Empresa</dt><dd>${esc(l.company)}</dd>
        <dt>Plan</dt><dd>${esc(l.planLabel)}</dd>
        <dt>Dispositivos</dt><dd>${l.deviceCount} / ${l.maxDevices}</dd>
        <dt>Fecha de activación</dt><dd>${fmtDate(l.activatedAt)}</dd>
        <dt>Vencimiento</dt><dd>${fmtDate(l.expiresAt)}${l.termMonths ? ` <span class="muted">(vigencia ${l.termMonths} meses)</span>` : ''}</dd>
        <dt>Última validación</dt><dd>${fmtDT(l.lastValidatedAt)}</dd>
        <dt>Versión instalada</dt><dd>${esc(l.appVersion ?? '—')}</dd>
        <dt>Código</dt><dd class="mono">${l.codeHint ? `NXT-····-····-${esc(l.codeHint)}` : 'Sin código (pendiente)'}</dd>
        <dt>Tolerancia offline</dt><dd>${l.toleranceDays == null ? 'Ajuste general' : `${l.toleranceDays} días`}</dd>
        <dt>Creada</dt><dd>${fmtDT(l.createdAt)} · ${esc(l.createdBy ?? '')}</dd>
        <dt>Notas</dt><dd>${esc(l.notes ?? '—')}</dd>
      </dl>
      ${manage ? `<div class="row">
        ${st === 'pending' ? btn('approve', 'Autorizar y generar código', 'primary') : ''}
        ${st === 'active' ? btn('suspend', 'Suspender') : ''}
        ${st === 'suspended' || st === 'cancelled' ? btn('reactivate', 'Reactivar') : ''}
        ${st !== 'pending' ? btn('renew', 'Renovar') : ''}
        ${st !== 'pending' ? btn('code', 'Nuevo código') : ''}
        ${st !== 'cancelled' ? btn('cancel', 'Cancelar licencia', 'danger') : ''}
      </div>
      <h3 class="sub">Modificar</h3>
      <form id="f-edit">
        <div class="two"><div class="field"><label>Plan</label><select name="plan">${planOptions(l.plan)}</select></div>
        <div class="field"><label>Máximo de dispositivos</label><input name="maxDevices" type="number" min="1" max="500" value="${l.maxDevices}" /></div></div>
        <div class="two"><div class="field"><label>Vencimiento</label><input name="expiresAt" type="date" value="${dateInput(l.expiresAt)}" /></div>
        <div class="field"><label>Tolerancia sin Internet (días)</label><input name="toleranceDays" type="number" min="0" max="365" value="${l.toleranceDays ?? ''}" placeholder="Ajuste general" /></div></div>
        <div class="field"><label>Notas administrativas</label><textarea name="notes" rows="2">${esc(l.notes ?? '')}</textarea></div>
        <button class="btn primary sm">Guardar cambios</button>
      </form>` : ''}
      <h3 class="sub">Dispositivos vinculados</h3>
      ${l.devices.length ? `<div class="scroll"><table><thead><tr><th>Device ID</th><th>Nombre</th><th>Activación</th><th>Última validación</th><th>Versión</th><th>Estado</th><th></th></tr></thead><tbody>
        ${l.devices.map((d) => `<tr><td class="mono">${esc(d.deviceId)}</td><td>${esc(d.name ?? '—')}</td><td>${fmtDate(d.activatedAt)}</td><td>${fmtDT(d.lastValidatedAt)}</td><td>${esc(d.appVersion ?? '—')}</td>
          <td>${d.status === 'unlinked' ? '<span class="badge b-expired">DESVINCULADO</span>' : d.envFlag ? '<span class="badge b-warn">ENTORNO CAMBIÓ</span>' : '<span class="badge b-ok">ACTIVO</span>'}</td>
          <td>${manage && d.status === 'active' ? `<button class="btn sm danger" data-act="unlink" data-id="${esc(l.id)}" data-dev="${esc(d.deviceId)}">Desvincular</button>${d.envFlag ? ` <button class="btn sm" data-act="clear-flag" data-id="${esc(l.id)}" data-dev="${esc(d.deviceId)}">Aceptar cambio</button>` : ''}` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Ningún dispositivo ha activado esta licencia.</p>'}
      ${l.history.length ? `<h3 class="sub">Historial reciente</h3><div class="scroll"><table><tbody>${l.history.slice(0, 12).map((a) => `<tr><td>${fmtDT(a.ts)}</td><td>${esc(a.actor)}</td><td>${esc(ACTIONS[a.action] ?? a.action)}</td><td class="muted">${esc(a.detail ?? '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="actions"><button class="btn" data-act="close">Cerrar</button></div>`)
    const edit = $('#f-edit')
    edit?.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const d = dataOf(ev.target)
      try {
        await api(`licenses/${id}`, { method: 'PUT', body: { plan: d.plan, maxDevices: Number(d.maxDevices), expiresAt: d.expiresAt || null, toleranceDays: d.toleranceDays === '' ? null : Number(d.toleranceDays), notes: d.notes } })
        toast('Licencia actualizada')
        dialogs.license(id)
        refresh()
      } catch (e) { fail(e) }
    })
  },

  'new-company'(company) {
    const c = company ?? {}
    openDlg(`<h3>${c.id ? 'Editar empresa' : 'Nueva empresa'}</h3>
      <form id="f-company">
        <div class="field"><label>Nombre de la empresa *</label><input name="name" required value="${esc(c.name)}" /></div>
        <div class="two"><div class="field"><label>Contacto</label><input name="contact" value="${esc(c.contact)}" /></div>
        <div class="field"><label>Teléfono</label><input name="phone" value="${esc(c.phone)}" /></div></div>
        <div class="field"><label>Correo</label><input name="email" type="email" value="${esc(c.email)}" /></div>
        <div class="field"><label>Dirección</label><input name="address" value="${esc(c.address)}" /></div>
        <div class="field"><label>Notas</label><textarea name="notes" rows="2">${esc(c.notes)}</textarea></div>
        ${c.licenses?.length ? `<p class="muted">Licencias: ${c.licenses.map((l) => `${esc(l.id)} (${STATUS[l.status]})`).join(', ')}</p>` : ''}
        <div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary">Guardar</button></div>
      </form>`)
    $('#f-company').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      try {
        await api(c.id ? `companies/${c.id}` : 'companies', { method: c.id ? 'PUT' : 'POST', body: dataOf(ev.target) })
        closeDlg()
        toast('Empresa guardada')
        refresh()
      } catch (e) { fail(e) }
    })
  },

  'new-user'(u) {
    const e = u ?? {}
    openDlg(`<h3>${e.id ? 'Editar usuario' : 'Nuevo usuario'}</h3>
      <form id="f-user">
        <div class="field"><label>Nombre</label><input name="name" required value="${esc(e.name)}" /></div>
        <div class="field"><label>Correo</label><input name="email" type="email" required value="${esc(e.email)}" ${e.id ? 'disabled' : ''} /></div>
        <div class="two"><div class="field"><label>Rol</label><select name="role">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${k === e.role ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>${e.id ? 'Nueva contraseña (opcional)' : 'Contraseña (mín. 10)'}</label><input name="password" type="password" minlength="10" ${e.id ? '' : 'required'} autocomplete="new-password" /></div></div>
        ${e.id ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${e.active ? 'checked' : ''} style="width:auto"/> Usuario activo</label>` : ''}
        <div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary">Guardar</button></div>
      </form>`)
    $('#f-user').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const d = dataOf(ev.target)
      try {
        if (e.id) await api(`users/${e.id}`, { method: 'PUT', body: { name: d.name, role: d.role, active: !!d.active, password: d.password || undefined } })
        else await api('users', { method: 'POST', body: d })
        closeDlg()
        toast('Usuario guardado')
        refresh()
      } catch (err) { fail(err) }
    })
  },

  renew(id) {
    openDlg(`<h3>Renovar ${esc(id)}</h3>
      <form id="f-renew"><div class="field"><label>Meses a agregar</label><input name="months" type="number" min="1" max="120" value="12" /></div>
      <p class="muted">Se suman al vencimiento actual (o a hoy, si ya venció).</p>
      <div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary">Renovar</button></div></form>`)
    $('#f-renew').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      try {
        const r = await api(`licenses/${id}/renew`, { method: 'POST', body: { months: Number(dataOf(ev.target).months) } })
        toast(`Nuevo vencimiento: ${fmtDate(r.expiresAt)}`)
        dialogs.license(id)
        refresh()
      } catch (e) { fail(e) }
    })
  },
}

async function confirmAndRun(message, fn) {
  if (!window.confirm(message)) return
  try { await fn() } catch (e) { fail(e) }
}

/* --------------------------------------------------------------- events */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]')
  if (!el) return
  const { act, id, dev } = el.dataset
  try {
    if (act === 'nav') return show(id)
    if (act === 'logout') { await api('logout', { method: 'POST' }).catch(() => {}); return signOut() }
    if (act === 'close') return closeDlg()
    if (act === 'copy') { await navigator.clipboard?.writeText(id); return toast('Copiado') }
    if (act === 'new-license') return dialogs['new-license']()
    if (act === 'license') return dialogs.license(id)
    if (act === 'new-company') return dialogs['new-company']()
    if (act === 'company') return dialogs['new-company'](state.companies.find((c) => String(c.id) === id))
    if (act === 'new-user') return dialogs['new-user']()
    if (act === 'edit-user') return dialogs['new-user'](JSON.parse(el.dataset.json))
    if (act === 'lic-approve') { const r = await api(`licenses/${id}/approve`, { method: 'POST' }); showCode(r.code, id); return refresh() }
    if (act === 'lic-code') return confirmAndRun('Se generará un código nuevo y el anterior dejará de servir para activar equipos nuevos. ¿Continuar?', async () => { const r = await api(`licenses/${id}/regenerate-code`, { method: 'POST' }); showCode(r.code, id) })
    if (act === 'lic-suspend') return confirmAndRun('El programa del cliente se bloqueará la próxima vez que valide con el servidor. ¿Suspender?', async () => { await api(`licenses/${id}/suspend`, { method: 'POST', body: {} }); toast('Licencia suspendida'); dialogs.license(id); refresh() })
    if (act === 'lic-reactivate') return confirmAndRun('¿Reactivar esta licencia?', async () => { await api(`licenses/${id}/reactivate`, { method: 'POST' }); toast('Licencia reactivada'); dialogs.license(id); refresh() })
    if (act === 'lic-cancel') return confirmAndRun('Cancelar deja la licencia inutilizable. ¿Continuar?', async () => { await api(`licenses/${id}/cancel`, { method: 'POST', body: {} }); toast('Licencia cancelada'); dialogs.license(id); refresh() })
    if (act === 'lic-renew') return dialogs.renew(id)
    if (act === 'unlink') return confirmAndRun('El equipo dejará de estar autorizado y liberará un lugar. ¿Desvincular?', async () => { await api(`licenses/${id}/devices/${dev}/unlink`, { method: 'POST' }); toast('Dispositivo desvinculado'); dialogs.license(id); refresh() })
    if (act === 'clear-flag') { await api(`licenses/${id}/devices/${dev}/clear-flag`, { method: 'POST' }); toast('Cambio de entorno aceptado'); dialogs.license(id); return refresh() }
  } catch (e) { fail(e) }
})

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') {
    state.q = ev.target.value
    clearTimeout(input.t)
    input.t = setTimeout(async () => {
      const caret = ev.target.selectionStart
      await show(state.view)
      const q = $('#q')
      q?.focus()
      q?.setSelectionRange(caret, caret)
    }, 250)
  }
})
const input = {}
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'f') { state.filter = ev.target.value; refresh() }
})
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'settings') return
  ev.preventDefault()
  const d = dataOf(ev.target)
  try {
    await api('settings', { method: 'PUT', body: { default_tolerance_days: Number(d.default_tolerance_days), block_on_env_change: !!d.block_on_env_change } })
    toast('Ajustes guardados')
  } catch (e) { fail(e) }
})

boot()
