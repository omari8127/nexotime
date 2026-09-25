/**
 * Every network call this app makes to the real backend lives here. Nothing
 * outside `src/services/live` and `src/store/dataStore.ts` should import
 * `@/lib/supabaseClient` directly — that keeps the swap-in seam narrow.
 */
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { clearSnapshot, saveSnapshot } from '@/services/live/snapshot'
import type {
  AttendanceRecord,
  AuditLog,
  Branch,
  Company,
  CorrectionRequest,
  Device,
  Employee,
  Incidencia,
  RoleKey,
  Schedule,
  User,
} from '@/types'
import {
  attendanceFromRow,
  attendanceToRow,
  auditFromRow,
  auditToRow,
  branchFromRow,
  branchToRow,
  companyFromRow,
  companyToRow,
  correctionFromRow,
  correctionToRow,
  deviceFromRow,
  deviceToRow,
  employeeFromRow,
  employeeToRow,
  incidenciaFromRow,
  incidenciaToRow,
  profileFromRow,
  profileToPatch,
  scheduleFromRow,
  scheduleToRow,
} from '@/services/live/mappers'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  return supabase
}

/** Throws with a readable message if a Supabase call returned an error. */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

/* ---------------------------------------------------------------------------
 * Auth + tenant bootstrap
 * ------------------------------------------------------------------------- */

export interface LiveBundle {
  company: Company
  branches: Branch[]
  schedules: Schedule[]
  users: User[]
  employees: Employee[]
  devices: Device[]
  attendance: AttendanceRecord[]
  audit: AuditLog[]
  incidencias: Incidencia[]
  corrections: CorrectionRequest[]
  currentUser: User
}

export async function signUpCompany(input: {
  companyName: string
  ownerName: string
  email: string
  password: string
}) {
  const db = client()
  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
  })
  if (error) throw new Error(error.message)
  if (!data.session) {
    throw new Error(
      'Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión (o desactiva "Confirm email" en Supabase → Authentication → Providers para pruebas).',
    )
  }

  const { data: companyId, error: rpcError } = await db.rpc('create_company_and_owner', {
    company_name: input.companyName,
    owner_name: input.ownerName,
    owner_email: input.email,
  })
  if (rpcError) throw new Error(rpcError.message)

  return cacheBundle(await fetchLiveBundle(companyId as string))
}

export async function signIn(email: string, password: string): Promise<LiveBundle> {
  const db = client()
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)

  const profileRow = check(
    await db.from('profiles').select('*').eq('id', data.user.id).single(),
  )
  await db
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id)

  return cacheBundle(await fetchLiveBundle(profileRow.company_id as string))
}

/** Returns null only when there is no stored session. A failed profile fetch
 *  (e.g. no internet) throws, so the caller can fall back to the offline cache
 *  instead of treating a tablet with a dropped connection as logged out. */
export async function restoreSession(): Promise<LiveBundle | null> {
  const db = client()
  const { data } = await db.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return null

  const { data: profileRow, error } = await db.from('profiles').select('*').eq('id', userId).single()
  if (error) throw new Error(error.message)
  if (!profileRow) return null

  return cacheBundle(await fetchLiveBundle(profileRow.company_id as string))
}

function cacheBundle(bundle: LiveBundle): LiveBundle {
  saveSnapshot(bundle)
  return bundle
}

export async function signOutLive() {
  const db = client()
  clearSnapshot()
  await db.auth.signOut()
}

async function fetchLiveBundle(companyId: string): Promise<LiveBundle> {
  const db = client()
  const { data: authData } = await db.auth.getUser()

  const [companyRes, branchesRes, schedulesRes, profilesRes, employeesRes, devicesRes, attendanceRes, auditRes, incidenciasRes, correctionsRes] =
    await Promise.all([
      db.from('companies').select('*').eq('id', companyId).single(),
      db.from('branches').select('*').eq('company_id', companyId).order('name'),
      db.from('schedules').select('*').eq('company_id', companyId).order('name'),
      db.from('profiles').select('*').eq('company_id', companyId),
      db.from('employees').select('*').eq('company_id', companyId).order('employee_number'),
      db.from('devices').select('*').eq('company_id', companyId),
      db.from('attendance_records').select('*').eq('company_id', companyId).order('date', { ascending: false }).limit(5000),
      db.from('audit_log').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
      db.from('incidencias').select('*').eq('company_id', companyId).order('from_date', { ascending: false }),
      // Tabla nueva: si la migración aún no se corrió, la lista simplemente llega vacía.
      db.from('correction_requests').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    ])

  if (companyRes.error) throw new Error(companyRes.error.message)

  const users = (profilesRes.data ?? []).map(profileFromRow)
  const currentUser = users.find((u) => u.id === authData.user?.id) ?? users[0]
  if (!currentUser) throw new Error('No se encontró un perfil para este usuario.')

  return {
    company: companyFromRow(companyRes.data),
    branches: (branchesRes.data ?? []).map(branchFromRow),
    schedules: (schedulesRes.data ?? []).map(scheduleFromRow),
    users,
    employees: (employeesRes.data ?? []).map(employeeFromRow),
    devices: (devicesRes.data ?? []).map(deviceFromRow),
    attendance: (attendanceRes.data ?? []).map(attendanceFromRow),
    audit: (auditRes.data ?? []).map(auditFromRow),
    incidencias: (incidenciasRes.data ?? []).map(incidenciaFromRow),
    corrections: (correctionsRes.data ?? []).map(correctionFromRow),
    currentUser,
  }
}

/* ---------------------------------------------------------------------------
 * Writes — one function per mutation, mirroring dataStore's action names.
 * ------------------------------------------------------------------------- */

export async function liveUpdateCompany(companyId: string, patch: Partial<Company>) {
  const db = client()
  const row = companyToRow(patch)
  if (Object.keys(row).length === 0) return
  const { error } = await db.from('companies').update(row).eq('id', companyId)
  if (error) throw new Error(error.message)
}

export async function liveInsertBranch(branch: Branch) {
  const db = client()
  const { error } = await db.from('branches').insert(branchToRow(branch))
  if (error) throw new Error(error.message)
}

export async function liveInsertSchedule(schedule: Schedule) {
  const db = client()
  const { error } = await db.from('schedules').insert(scheduleToRow(schedule))
  if (error) throw new Error(error.message)
}

export async function liveUpdateSchedule(id: string, patch: Partial<Schedule>) {
  const db = client()
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description
  if (patch.days !== undefined) row.days = patch.days
  if (patch.weeklyTargetHours !== undefined) row.weekly_target_hours = patch.weeklyTargetHours
  if (patch.color !== undefined) row.color = patch.color
  const { error } = await db.from('schedules').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function liveInsertEmployee(employee: Employee) {
  const db = client()
  const { error } = await db.from('employees').insert(employeeToRow(employee))
  if (error) throw new Error(error.message)
}

export async function liveUpdateEmployee(id: string, patch: Partial<Employee>) {
  const db = client()
  const row: Record<string, unknown> = {}
  if (patch.branchId !== undefined) row.branch_id = patch.branchId
  if (patch.employeeNumber !== undefined) row.employee_number = patch.employeeNumber
  if (patch.firstName !== undefined) row.first_name = patch.firstName
  if (patch.lastNamePaternal !== undefined) row.last_name_paternal = patch.lastNamePaternal
  if (patch.lastNameMaternal !== undefined) row.last_name_maternal = patch.lastNameMaternal
  if (patch.fullName !== undefined) row.full_name = patch.fullName
  if (patch.position !== undefined) row.position = patch.position
  if (patch.department !== undefined) row.department = patch.department
  if (patch.email !== undefined) row.email = patch.email
  if (patch.phone !== undefined) row.phone = patch.phone
  if (patch.status !== undefined) row.status = patch.status
  if (patch.hireDate !== undefined) row.hire_date = patch.hireDate
  if (patch.scheduleId !== undefined) row.schedule_id = patch.scheduleId
  if (patch.identifications !== undefined) row.identifications = patch.identifications
  if (patch.pin !== undefined) row.pin = patch.pin
  if (patch.curp !== undefined) row.curp = patch.curp
  if (patch.address !== undefined) row.address = patch.address
  if (patch.emergencyContact !== undefined) row.emergency_contact = patch.emergencyContact
  const { error } = await db.from('employees').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Insert or update the one attendance row for (employeeId, date). */
export async function liveUpsertAttendance(record: AttendanceRecord) {
  const db = client()
  const { error } = await db
    .from('attendance_records')
    .upsert(
      { id: record.id, ...attendanceToRow(record) },
      { onConflict: 'employee_id,date' },
    )
  if (error) throw new Error(error.message)
}

export async function liveInsertDevice(device: Device) {
  const db = client()
  const { error } = await db.from('devices').insert(deviceToRow(device))
  if (error) throw new Error(error.message)
}

/** Insert-or-update by id, so replaying a queued write is always safe. */
export async function liveUpsertIncidencia(incidencia: Incidencia) {
  const db = client()
  const { error } = await db.from('incidencias').upsert(incidenciaToRow(incidencia), { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function liveUpsertCorrection(request: CorrectionRequest) {
  const db = client()
  const { error } = await db
    .from('correction_requests')
    .upsert(correctionToRow(request), { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function liveDeleteIncidencia(id: string) {
  const db = client()
  const { error } = await db.from('incidencias').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Audit rows are append-only: no update/delete policy exists, so a replayed
 *  write must be a "do nothing on conflict" insert. */
export async function liveInsertAudit(entry: AuditLog) {
  const db = client()
  const { error } = await db
    .from('audit_log')
    .upsert(auditToRow(entry), { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export async function liveUpdateProfile(id: string, patch: Partial<User>) {
  const db = client()
  const row = profileToPatch(patch)
  if (Object.keys(row).length === 0) return
  const { error } = await db.from('profiles').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Creates the sign-in for a new panel user or employee. A throwaway client
 * (no session persistence) is used for `signUp`, so the admin who is doing the
 * inviting stays signed in; the profile row is then created by an RPC that
 * checks the caller is an owner/admin of the same company.
 */
export async function liveCreateUserAccount(input: {
  name: string
  email: string
  password: string
  role: RoleKey
  employeeId?: string
  branchIds: string[]
  departments: string[]
}): Promise<User> {
  const db = client()
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const isolated = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await isolated.auth.signUp({ email: input.email, password: input.password })
  if (error) throw new Error(error.message)
  const userId = data.user?.id
  if (!userId) throw new Error('No se pudo crear el acceso. Intenta con otro correo.')

  const { error: rpcError } = await db.rpc('admin_create_profile', {
    p_user_id: userId,
    p_name: input.name,
    p_email: input.email,
    p_role: input.role,
    p_employee_id: input.employeeId ?? null,
    p_branch_ids: input.branchIds,
    p_departments: input.departments,
  })
  if (rpcError) throw new Error(rpcError.message)

  const { data: row, error: rowError } = await db.from('profiles').select('*').eq('id', userId).single()
  if (rowError) throw new Error(rowError.message)
  return profileFromRow(row)
}
