/**
 * Everything the employee portal (/empleado) talks to.
 *
 * An employee has no Supabase account: they enter with company code + employee number + PIN and
 * from then on every call carries the session key the server handed out (see
 * supabase/migrations/008_portal_empleado.sql). The server only ever answers with that employee's
 * own data.
 *
 * Without a configured database the same interface runs on the in-memory demo company, so the
 * portal can be shown in a sales demo next to the panel.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { putLocalPhoto } from '@/services/evidence/localPhotos'
import {
  attendanceFromRow,
  attendanceToRow,
  branchFromRow,
  employeeFromRow,
  incidenciaFromRow,
  scheduleFromRow,
} from '@/services/live/mappers'
import { useDataStore } from '@/store/dataStore'
import { getToday, nowISO } from '@/lib/today'
import { checkPortalZone, portalPunchLocation, portalZoneProblem, resolvePortalZone } from '@/lib/portalZone'
import type { PhotoCapture } from '@/lib/photoEvidence'
import type { AttendanceRecord, AttendanceSettings, Branch, Employee, Incidencia, Schedule } from '@/types'

export interface PortalState {
  /** The server's clock when this was read: the portal's time runs from it, not from the phone's. */
  serverNow: string
  /** Today in the company's time zone. */
  today: string
  company: { id: string; name: string; timezone: string; attendanceSettings: AttendanceSettings }
  employee: Employee
  branch?: Branch
  schedule: Schedule
  attendance: AttendanceRecord[]
  incidencias: Incidencia[]
}

/** The session is over (expired, signed out, portal switched off): back to the entry screen. */
export class PortalSessionError extends Error {}
/** The phone's picture of the day is out of date (or its clock is off): reload and try again. */
export class PortalStaleError extends Error {}

export interface PortalApi {
  /** True when running on the in-memory demo company. */
  demo: boolean
  login(companyCode: string, employeeNumber: string, pin: string): Promise<string>
  state(token: string): Promise<PortalState>
  punch(token: string, record: AttendanceRecord, photo: PhotoCapture): Promise<AttendanceRecord>
  requestVacation(token: string, from: string, to: string, reason: string): Promise<Incidencia>
  cancelVacation(token: string, id: string): Promise<void>
  logout(token: string): Promise<void>
}

/* ----------------------------------------------------------------------------
 * Live: Supabase RPCs, always as the anonymous role
 * -------------------------------------------------------------------------- */

let anon: SupabaseClient | null = null

/** A client of its own with no stored session: the portal must never ride on a panel sign-in that
 *  happens to exist in this browser (it would act with that person's role). */
function db(): SupabaseClient {
  anon ??= createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'nexotime.portal' } },
  )
  return anon
}

type Row = Record<string, unknown>

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let result
  try {
    result = await db().rpc(fn, args)
  } catch {
    throw new Error('Sin conexión. Revisa tu Internet e inténtalo de nuevo.')
  }
  const { data, error } = result
  if (!error) return data as T
  if (error.code === 'NX401') throw new PortalSessionError(error.message)
  if (error.code === 'NX409') throw new PortalStaleError(error.message)
  if (error.code === 'PGRST202' || error.code === '42883') {
    throw new Error('El portal de empleados todavía no está activado en este sistema. Avisa a tu empresa.')
  }
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(error.message)) {
    throw new Error('Sin conexión. Revisa tu Internet e inténtalo de nuevo.')
  }
  throw new Error(error.message)
}

const live: PortalApi = {
  demo: false,

  async login(companyCode, employeeNumber, pin) {
    const result = await rpc<{ ok: boolean; error?: string; token?: string }>('employee_portal_login', {
      p_company_code: companyCode,
      p_employee_number: employeeNumber,
      p_pin: pin,
    })
    if (!result?.ok || !result.token) throw new Error(result?.error ?? 'No se pudo entrar.')
    return result.token
  },

  async state(token) {
    const raw = await rpc<Row>('employee_portal_state', { p_token: token })
    const company = raw.company as Row
    if (!raw.schedule) throw new Error('Tu ficha no tiene un horario asignado. Avisa a Recursos Humanos.')
    return {
      serverNow: raw.serverNow as string,
      today: raw.today as string,
      company: {
        id: company.id as string,
        name: company.name as string,
        timezone: (company.timezone as string) ?? 'America/Mexico_City',
        attendanceSettings: company.attendance_settings as AttendanceSettings,
      },
      employee: employeeFromRow(raw.employee as Row),
      branch: raw.branch ? branchFromRow(raw.branch as Row) : undefined,
      schedule: scheduleFromRow(raw.schedule as Row),
      attendance: ((raw.attendance as Row[]) ?? []).map(attendanceFromRow),
      incidencias: ((raw.incidencias as Row[]) ?? []).map(incidenciaFromRow),
    }
  },

  async punch(token, record, photo) {
    const row = await rpc<Row>('employee_portal_punch', {
      p_token: token,
      p_record: { id: record.id, ...attendanceToRow(record) },
      p_photo: photo,
    })
    return attendanceFromRow(row)
  },

  async requestVacation(token, from, to, reason) {
    return incidenciaFromRow(
      await rpc<Row>('employee_portal_request_vacation', { p_token: token, p_from: from, p_to: to, p_reason: reason }),
    )
  },

  async cancelVacation(token, id) {
    await rpc('employee_portal_cancel_vacation', { p_token: token, p_id: id })
  },

  async logout(token) {
    await rpc('employee_portal_logout', { p_token: token }).catch(() => undefined)
  },
}

/* ----------------------------------------------------------------------------
 * Demo: the in-memory sample company (same rules, nothing leaves the browser)
 * -------------------------------------------------------------------------- */

const DEMO_PREFIX = 'demo:'

function demoEmployee(token: string): Employee {
  const id = token.startsWith(DEMO_PREFIX) ? token.slice(DEMO_PREFIX.length) : ''
  const employee = useDataStore.getState().employees.find((e) => e.id === id && e.status === 'active')
  if (!employee) throw new PortalSessionError('Tu sesión terminó. Vuelve a entrar.')
  return employee
}

/** Someone the demo can be tried with (the entry screen shows their number and PIN). */
export function demoPortalAccess(): { code: string; number: string; pin: string } | null {
  const { company, employees, mode } = useDataStore.getState()
  if (isSupabaseConfigured || mode !== 'demo') return null
  const employee = employees.find((e) => e.status === 'active' && e.pin)
  return employee?.pin ? { code: company.portalCode ?? 'DEMO2026', number: employee.employeeNumber, pin: employee.pin } : null
}

const demo: PortalApi = {
  demo: true,

  async login(companyCode, employeeNumber, pin) {
    const { company, employees } = useDataStore.getState()
    const fail = new Error('Código de empresa, número de empleado o PIN incorrectos.')
    if (companyCode.trim().toUpperCase() !== (company.portalCode ?? 'DEMO2026')) throw fail
    const key = employeeNumber.trim().toLowerCase()
    const digits = key.replace(/\D/g, '')
    const active = employees.filter((e) => e.status === 'active')
    const exact = active.filter((e) => e.employeeNumber.toLowerCase() === key)
    const matches = exact.length
      ? exact
      : active.filter((e) => digits !== '' && Number(e.employeeNumber.replace(/\D/g, '')) === Number(digits))
    if (matches.length !== 1 || !matches[0].pin || matches[0].pin !== pin) throw fail
    return DEMO_PREFIX + matches[0].id
  },

  async state(token) {
    const employee = demoEmployee(token)
    const s = useDataStore.getState()
    const schedule = s.schedules.find((x) => x.id === employee.scheduleId) ?? s.schedules[0]
    return {
      serverNow: nowISO(),
      today: getToday('demo'),
      company: { id: s.company.id, name: s.company.name, timezone: s.company.timezone, attendanceSettings: s.company.attendanceSettings },
      employee,
      branch: s.branches.find((b) => b.id === employee.branchId),
      schedule,
      attendance: s.attendance.filter((r) => r.employeeId === employee.id),
      incidencias: s.incidencias.filter((i) => i.employeeId === employee.id),
    }
  },

  async punch(token, record, photo) {
    const employee = demoEmployee(token)
    const punch = record.punches.find((p) => p.photoEvidence?.id === photo.id)
    if (!punch) throw new Error('La foto no corresponde a este movimiento.')
    // Same location rules as the database (migration 013).
    const s = useDataStore.getState()
    const branch = s.branches.find((b) => b.id === employee.branchId)
    const point = branch?.lat != null && branch?.lng != null ? { lat: branch.lat, lng: branch.lng } : undefined
    const zone = checkPortalZone(punch.location, point, resolvePortalZone(s.company.attendanceSettings), !!employee.remotePunch)
    const problem = portalZoneProblem(zone, branch?.name)
    if (problem || !punch.location) throw new Error(problem ?? 'Activa la ubicación de tu celular.')
    await putLocalPhoto({ ...photo, companyId: record.companyId, employeeId: employee.id, date: record.date })
    return useDataStore.getState().registerPunch({
      employeeId: employee.id,
      type: punch.type,
      time: punch.time,
      method: 'app',
      date: record.date,
      location: portalPunchLocation(punch.location, zone),
      photoEvidence: punch.photoEvidence,
    }).record
  },

  async requestVacation(token, from, to, reason) {
    const employee = demoEmployee(token)
    const { incidencias, company } = useDataStore.getState()
    if (to < from) throw new Error('Revisa las fechas: el regreso no puede ser antes de la salida.')
    if (from < getToday('demo')) throw new Error('Las vacaciones deben empezar hoy o después.')
    const overlaps = incidencias.some(
      (i) =>
        i.employeeId === employee.id &&
        i.type === 'vacaciones' &&
        (i.status === 'pending' || i.status === 'approved') &&
        i.from <= to &&
        i.to >= from,
    )
    if (overlaps) throw new Error('Ya tienes vacaciones solicitadas o aprobadas en esas fechas.')
    const created: Incidencia = {
      id: crypto.randomUUID(),
      companyId: company.id,
      employeeId: employee.id,
      type: 'vacaciones',
      from,
      to,
      reason: reason.trim() || undefined,
      status: 'pending',
      requestedById: '',
      createdAt: nowISO(),
    }
    useDataStore.setState((s) => ({ incidencias: [created, ...s.incidencias] }))
    return created
  },

  async cancelVacation(token, id) {
    const employee = demoEmployee(token)
    const target = useDataStore
      .getState()
      .incidencias.find((i) => i.id === id && i.employeeId === employee.id && i.type === 'vacaciones' && i.status === 'pending')
    if (!target) throw new Error('Esa solicitud ya fue revisada o no existe.')
    useDataStore.setState((s) => ({ incidencias: s.incidencias.filter((i) => i.id !== id) }))
  },

  async logout() {
    /* nothing to forget on a server */
  },
}

export const portalApi: PortalApi = isSupabaseConfigured ? live : demo
