/**
 * Central data store for NEXOTIME.
 *
 * Two backends share this exact same interface:
 *  - "demo": everything lives in memory, seeded once from `buildMockDatabase()`.
 *    No network, no login — used for sales demos anywhere, anytime.
 *  - "live": backed by Supabase (Postgres + Auth + RLS). Every mutation still
 *    updates local state immediately (optimistic UI) and then persists to the
 *    database in the background; a failed write surfaces a toast instead of
 *    silently losing the change.
 *
 * Components never know which backend is active — they call the same actions
 * either way. That seam is what let the whole panel + reloj checador ship
 * before the database existed, and now connects without rewriting a single page.
 */
import { resolveKiosk } from '@/lib/kiosk'
import { create } from 'zustand'
import type {
  AttendanceRecord,
  AuditAction,
  AuditChange,
  AuditLog,
  Branch,
  Company,
  CorrectionRequest,
  Device,
  Employee,
  Incidencia,
  IncidenciaStatus,
  IncidenciaType,
  Payment,
  Permission,
  Punch,
  PunchLocation,
  PunchType,
  RoleKey,
  Schedule,
  User,
} from '@/types'
import {
  PUNCH_TYPE_LABEL,
  canRegisterPunch,
  recomputeRecord,
  validatePunchSequence,
  weekdayFromISO,
} from '@/lib/attendance'
import { formatTime12 } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { INCIDENCIA_META } from '@/data/incidencias'
import { buildMockDatabase } from '@/data/mock'
import { can } from '@/data/roles'
import { canAccessEmployee } from '@/lib/scope'
import { generateBarcodeValue, generateQrValue, takenBarcodes } from '@/lib/credentials'
import { getToday, nowISO } from '@/lib/today'
import type { LiveBundle } from '@/services/live/liveApi'
import {
  liveCreateUserAccount,
  liveInsertAudit,
  liveInsertBranch,
  liveInsertDevice,
  liveInsertEmployee,
  liveDeleteIncidencia,
  liveUpdateCompany,
  liveUpdateEmployee,
  liveUpdateProfile,
  liveInsertSchedule,
  liveUpdateSchedule,
  liveUpsertAttendance,
  liveUpsertCorrection,
  liveUpsertIncidencia,
} from '@/services/live/liveApi'
import { enqueue, isNetworkError, type NewQueueItem } from '@/services/live/syncQueue'

export type BackendMode = 'demo' | 'live'

/** A punch that would leave the day's records inconsistent (double entry, etc.). */
export class PunchError extends Error {}
/** The current user's role lacks the permission an action requires. */
export class PermissionError extends Error {
  constructor(message = 'No tienes permiso para realizar esta acción.') {
    super(message)
  }
}

interface AuditInput {
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel: string
  reason?: string
  changes: AuditChange[]
}

export interface NewEmployeeInput {
  branchId: string
  employeeNumber: string
  firstName: string
  lastNamePaternal: string
  lastNameMaternal?: string
  position: string
  department: string
  email?: string
  phone?: string
  hireDate: string
  status: Employee['status']
  scheduleId: string
  identifications: Employee['identifications']
  pin?: string
  curp?: string
  address?: string
  emergencyContact?: Employee['emergencyContact']
}

export interface PunchInput {
  employeeId: string
  type: PunchType
  time: string
  method: Punch['method']
  deviceId?: string
  date?: string
  location?: PunchLocation
}

export interface CorrectionInput {
  recordId: string
  type: PunchType
  time: string
  reason: string
  actor: User
}

export interface CorrectionRequestInput {
  employeeId: string
  date: string
  type: PunchType
  time: string
  reason: string
}

export interface NewUserInput {
  name: string
  email: string
  /** Solo en modo real: contraseña inicial del acceso. */
  password?: string
  role: RoleKey
  employeeId?: string
  branchIds: string[]
  departments: string[]
}

export interface IncidenciaInput {
  employeeId: string
  type: IncidenciaType
  from: string
  to: string
  reason?: string
}

interface DataState {
  mode: BackendMode
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
  /** Read-only: only a service-role process ever inserts a row (see 004_suscripciones.sql). */
  payments: Payment[]

  currentUser: User
  setCurrentUser: (userId: string) => void

  hydrateLive: (bundle: LiveBundle) => void
  switchToDemo: () => void

  addEmployee: (input: NewEmployeeInput, actor: User) => Employee
  /** Bulk alta from an imported spreadsheet. One summary audit entry for the whole batch. */
  importEmployees: (inputs: NewEmployeeInput[], actor: User) => Employee[]
  updateEmployee: (id: string, patch: Partial<Employee>, actor: User) => void
  toggleEmployeeStatus: (id: string, actor: User) => void
  /** New QR + barcode values (lost badge). The previous codes stop working immediately. */
  regenerateCredentials: (id: string, actor: User) => void
  /** Saves the face samples captured at enrollment (descriptors only, no photos). */
  enrollFace: (id: string, descriptors: number[][], actor: User) => void
  removeFace: (id: string, actor: User) => void

  addBranch: (branch: Omit<Branch, 'id' | 'companyId'>, actor: User) => Branch

  addSchedule: (schedule: Omit<Schedule, 'id' | 'companyId'>, actor: User) => Schedule
  updateSchedule: (id: string, patch: Partial<Schedule>, actor: User) => void

  registerPunch: (input: PunchInput) => { record: AttendanceRecord; punch: Punch }
  /** Applies a correction directly (RH/admin). Returns an error message, or null when applied. */
  applyCorrection: (input: CorrectionInput) => string | null
  /** Bulk corrections from an imported spreadsheet. Skips rows with an error, applies the rest. */
  importAttendanceCorrections: (
    changes: Array<{ employeeId: string; date: string; type: PunchType; time: string; reason: string }>,
    actor: User,
  ) => { applied: number; failed: Array<{ index: number; message: string }> }
  /** Employee/supervisor asks for a correction; nothing changes until it is approved. */
  submitCorrection: (input: CorrectionRequestInput, actor: User) => string | null
  reviewCorrection: (
    id: string,
    decision: 'approved' | 'rejected',
    note: string,
    actor: User,
  ) => string | null

  addIncidencia: (input: IncidenciaInput, actor: User) => Incidencia
  reviewIncidencia: (
    id: string,
    status: Exclude<IncidenciaStatus, 'pending'>,
    note: string,
    actor: User,
  ) => void
  cancelIncidencia: (id: string, actor: User) => void

  addUser: (input: NewUserInput, actor: User) => Promise<User>
  updateUserAccess: (
    id: string,
    patch: Partial<Pick<User, 'role' | 'branchIds' | 'departments' | 'employeeId' | 'active'>>,
    actor: User,
  ) => string | null

  addDevice: (device: Omit<Device, 'id' | 'companyId'>, actor: User) => void
  updateSettings: (patch: Partial<Company['attendanceSettings']>, actor: User) => void
  updateCompany: (patch: Partial<Company>, actor: User) => void

  logAudit: (input: AuditInput, actor: User) => void
  reset: () => void
}

/** Real UUIDs everywhere — so a locally-created row's id is already valid to
 *  insert into Postgres in live mode, with no id-swap once the write lands. */
function nextId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function scheduleOf(schedules: Schedule[], id: string): Schedule {
  return schedules.find((s) => s.id === id) ?? schedules[0]
}

const CURRENT_USER_KEY = 'nexotime.currentUser'

function loadCurrentUserId(): string | null {
  try {
    return localStorage.getItem(CURRENT_USER_KEY)
  } catch {
    return null
  }
}

function saveCurrentUserId(id: string) {
  try {
    localStorage.setItem(CURRENT_USER_KEY, id)
  } catch {
    /* ignore */
  }
}

/** Fire a live-mode write in the background; surface failures without
 *  reverting the optimistic local update (keeps the demo feel snappy).
 *  When `queueItem` is given, a write that fails because the device is offline
 *  is parked in the local sync queue and replayed on reconnection instead of
 *  being lost — the reloj checador must survive an internet outage. */
function persist(mode: BackendMode, fn: () => Promise<unknown>, queueItem?: NewQueueItem) {
  if (mode !== 'live') return
  if (queueItem && typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue(queueItem)
    return
  }
  fn().catch((err: unknown) => {
    if (queueItem && isNetworkError(err)) {
      enqueue(queueItem)
      return
    }
    toast.error(
      'No se pudo guardar en el servidor',
      err instanceof Error ? err.message : 'Reintenta en unos segundos.',
    )
  })
}

export const useDataStore = create<DataState>((set, get) => {
  const seed = buildMockDatabase()
  const savedUserId = loadCurrentUserId()
  const initialUser = seed.users.find((u) => u.id === savedUserId) ?? seed.users[0]

  const writeAudit = (input: AuditInput, actor: User) => {
    const entry: AuditLog = {
      id: nextId(),
      companyId: get().company.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      reason: input.reason,
      changes: input.changes,
      createdAt: nowISO(),
    }
    set((s) => ({ audit: [entry, ...s.audit] }))
    persist(get().mode, () => liveInsertAudit(entry), { kind: 'audit', payload: entry })
  }

  /** Server-side-style guard inside the store: whoever is signed in must hold
   *  the permission, regardless of which button (or console call) got here. */
  const requirePermission = (permission: Permission) => {
    if (!can(get().currentUser.role, permission)) throw new PermissionError()
  }

  /** Same, but for one specific employee's data (branch / department scope). */
  const requireEmployeeScope = (employee: Employee | undefined) => {
    if (!employee || !canAccessEmployee(get().currentUser, employee)) throw new PermissionError()
  }

  /**
   * Sets one punch on an employee's day (creating the day if needed), then
   * recomputes hours/status. Shared by direct corrections and approved
   * correction requests so both follow identical rules. Returns the previous
   * time of that punch, or an error message when the result would be inconsistent.
   */
  const editPunch = (
    employeeId: string,
    date: string,
    type: PunchType,
    time: string,
    reason: string,
  ): { previous: string | null; recordId: string } | { error: string } => {
    const state = get()
    const employee = state.employees.find((e) => e.id === employeeId)
    if (!employee) return { error: 'Empleado no encontrado.' }
    const schedule = scheduleOf(state.schedules, employee.scheduleId)
    const existing = state.attendance.find((r) => r.employeeId === employeeId && r.date === date)
    const previous = existing?.punches.find((p) => p.type === type)?.time ?? null

    const punches = [
      ...(existing?.punches.filter((p) => p.type !== type) ?? []),
      { type, time, method: 'manual' as const, edited: true },
    ].sort((a, b) => a.time.localeCompare(b.time))

    const invalid = validatePunchSequence(punches)
    if (invalid) return { error: invalid }

    const base: AttendanceRecord = existing ?? {
      id: nextId(),
      companyId: state.company.id,
      branchId: employee.branchId,
      employeeId,
      date,
      scheduleId: schedule.id,
      punches: [],
      status: 'present',
      workedMinutes: 0,
      scheduledMinutes: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
      missingMinutes: 0,
    }
    const updated = recomputeRecord(
      { ...base, punches, note: reason },
      schedule,
      state.company.attendanceSettings,
      getToday(state.mode),
    )
    set((s) => ({
      attendance: existing
        ? s.attendance.map((r) => (r.id === updated.id ? updated : r))
        : [updated, ...s.attendance],
    }))
    persist(get().mode, () => liveUpsertAttendance(updated), { kind: 'attendance', payload: updated })
    return { previous, recordId: updated.id }
  }

  /** Shared by a single manual alta and a bulk import, so both produce identical records. */
  const buildEmployeeFromInput = (input: NewEmployeeInput): Employee => ({
    id: nextId(),
    companyId: get().company.id,
    branchId: input.branchId,
    employeeNumber: input.employeeNumber,
    firstName: input.firstName,
    lastNamePaternal: input.lastNamePaternal,
    lastNameMaternal: input.lastNameMaternal || undefined,
    fullName: [input.firstName, input.lastNamePaternal, input.lastNameMaternal].filter(Boolean).join(' '),
    position: input.position,
    department: input.department,
    email: input.email || undefined,
    phone: input.phone || undefined,
    status: input.status,
    hireDate: input.hireDate,
    scheduleId: input.scheduleId,
    identifications: input.identifications,
    pin: input.pin || undefined,
    curp: input.curp || undefined,
    address: input.address || undefined,
    emergencyContact: input.emergencyContact,
  })

  return {
    mode: 'demo',
    ...seed,
    currentUser: initialUser,

    setCurrentUser: (userId) =>
      set((s) => {
        if (s.mode === 'live') return s // no impersonation once connected to a real account
        const next = s.users.find((u) => u.id === userId) ?? s.currentUser
        saveCurrentUserId(next.id)
        return { currentUser: next }
      }),

    hydrateLive: (bundle) =>
      set({
        mode: 'live',
        company: bundle.company,
        branches: bundle.branches,
        schedules: bundle.schedules,
        users: bundle.users,
        employees: bundle.employees,
        devices: bundle.devices,
        attendance: bundle.attendance,
        audit: bundle.audit,
        incidencias: bundle.incidencias,
        corrections: bundle.corrections,
        payments: bundle.payments,
        currentUser: bundle.currentUser,
      }),

    switchToDemo: () => {
      const fresh = buildMockDatabase()
      set({ mode: 'demo', ...fresh, currentUser: fresh.users[0] })
    },

    logAudit: writeAudit,

    addEmployee: (input, actor) => {
      requirePermission('employees.create')
      const employee = buildEmployeeFromInput(input)
      set((s) => ({ employees: [employee, ...s.employees] }))
      persist(get().mode, () => liveInsertEmployee(employee))
      writeAudit(
        {
          action: 'employee.create',
          entityType: 'Employee',
          entityId: employee.id,
          entityLabel: employee.fullName,
          changes: [
            { field: 'Empleado', before: null, after: `Alta de ${employee.employeeNumber}` },
          ],
        },
        actor,
      )
      return employee
    },

    importEmployees: (inputs, actor) => {
      requirePermission('employees.create')
      if (inputs.length === 0) return []
      const created = inputs.map(buildEmployeeFromInput)
      set((s) => ({ employees: [...created, ...s.employees] }))
      for (const employee of created) persist(get().mode, () => liveInsertEmployee(employee))
      writeAudit(
        {
          action: 'employee.create',
          entityType: 'Employee',
          entityId: 'bulk',
          entityLabel: `Importación de ${created.length} ${created.length === 1 ? 'empleado' : 'empleados'}`,
          changes: [{ field: 'Empleados', before: null, after: created.map((e) => e.employeeNumber).join(', ') }],
        },
        actor,
      )
      return created
    },

    updateEmployee: (id, patch, actor) => {
      requirePermission('employees.edit')
      const before = get().employees.find((e) => e.id === id)
      if (!before) return
      const merged: Employee = { ...before, ...patch }
      merged.fullName = [merged.firstName, merged.lastNamePaternal, merged.lastNameMaternal]
        .filter(Boolean)
        .join(' ')
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? merged : e)) }))
      persist(get().mode, () => liveUpdateEmployee(id, { ...patch, fullName: merged.fullName }))

      const changes: AuditChange[] = Object.keys(patch)
        .filter((k) => k in before && (before as unknown as Record<string, unknown>)[k] !== (merged as unknown as Record<string, unknown>)[k])
        .filter((k) => typeof (merged as unknown as Record<string, unknown>)[k] !== 'object')
        .map((k) => ({
          field: k,
          before: String((before as unknown as Record<string, unknown>)[k] ?? '—'),
          after: String((merged as unknown as Record<string, unknown>)[k] ?? '—'),
        }))
      if (changes.length) {
        writeAudit(
          {
            action: 'employee.edit',
            entityType: 'Employee',
            entityId: id,
            entityLabel: merged.fullName,
            changes,
          },
          actor,
        )
      }
    },

    toggleEmployeeStatus: (id, actor) => {
      requirePermission('employees.edit')
      const emp = get().employees.find((e) => e.id === id)
      if (!emp) return
      const next = emp.status === 'active' ? 'inactive' : 'active'
      set((s) => ({
        employees: s.employees.map((e) => (e.id === id ? { ...e, status: next } : e)),
      }))
      persist(get().mode, () => liveUpdateEmployee(id, { status: next }))
      writeAudit(
        {
          action: next === 'inactive' ? 'employee.deactivate' : 'employee.edit',
          entityType: 'Employee',
          entityId: id,
          entityLabel: emp.fullName,
          changes: [{ field: 'Estado', before: emp.status, after: next }],
        },
        actor,
      )
    },

    regenerateCredentials: (id, actor) => {
      requirePermission('employees.edit')
      const emp = get().employees.find((e) => e.id === id)
      if (!emp) return
      requireEmployeeScope(emp)
      const taken = takenBarcodes(get().employees)
      const enabledOf = (m: 'qr' | 'barcode') =>
        emp.identifications.find((i) => i.method === m)?.enabled ?? true
      const identifications = [
        ...emp.identifications.filter((i) => i.method !== 'qr' && i.method !== 'barcode'),
        { method: 'qr' as const, enabled: enabledOf('qr'), value: generateQrValue() },
        { method: 'barcode' as const, enabled: enabledOf('barcode'), value: generateBarcodeValue(taken) },
      ]
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, identifications } : e)) }))
      persist(get().mode, () => liveUpdateEmployee(id, { identifications }))
      writeAudit(
        {
          action: 'employee.edit',
          entityType: 'Employee',
          entityId: id,
          entityLabel: emp.fullName,
          changes: [
            { field: 'Credencial (QR y código de barras)', before: 'Códigos anteriores', after: 'Regenerados' },
          ],
        },
        actor,
      )
    },

    enrollFace: (id, descriptors, actor) => {
      requirePermission('biometrics.manage')
      const emp = get().employees.find((e) => e.id === id)
      if (!emp || descriptors.length === 0) return
      requireEmployeeScope(emp)
      const identifications = [
        ...emp.identifications.filter((i) => i.method !== 'face'),
        {
          method: 'face' as const,
          enabled: true,
          // 4 decimals is plenty for matching and keeps each employee row small.
          descriptors: descriptors.map((d) => d.map((v) => Math.round(v * 10000) / 10000)),
          enrolledAt: nowISO(),
        },
      ]
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, identifications } : e)) }))
      persist(get().mode, () => liveUpdateEmployee(id, { identifications }))
      const had = emp.identifications.some((i) => i.method === 'face' && i.descriptors?.length)
      writeAudit(
        {
          action: 'employee.edit',
          entityType: 'Employee',
          entityId: id,
          entityLabel: emp.fullName,
          changes: [
            {
              field: 'Reconocimiento facial',
              before: had ? 'Rostro registrado' : 'Sin rostro',
              after: `Rostro ${had ? 'actualizado' : 'registrado'} (${descriptors.length} muestras)`,
            },
          ],
        },
        actor,
      )
    },

    removeFace: (id, actor) => {
      requirePermission('biometrics.manage')
      const emp = get().employees.find((e) => e.id === id)
      if (!emp) return
      requireEmployeeScope(emp)
      const identifications = emp.identifications.map((i) =>
        i.method === 'face' ? { method: 'face' as const, enabled: false } : i,
      )
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, identifications } : e)) }))
      persist(get().mode, () => liveUpdateEmployee(id, { identifications }))
      writeAudit(
        {
          action: 'employee.edit',
          entityType: 'Employee',
          entityId: id,
          entityLabel: emp.fullName,
          changes: [{ field: 'Reconocimiento facial', before: 'Rostro registrado', after: 'Eliminado' }],
        },
        actor,
      )
    },

    addBranch: (branch, actor) => {
      requirePermission('branches.manage')
      const created: Branch = { ...branch, id: nextId(), companyId: get().company.id }
      set((s) => ({ branches: [...s.branches, created] }))
      persist(get().mode, () => liveInsertBranch(created))
      writeAudit(
        {
          action: 'branch.create',
          entityType: 'Branch',
          entityId: created.id,
          entityLabel: created.name,
          changes: [{ field: 'Sucursal', before: null, after: created.name }],
        },
        actor,
      )
      return created
    },

    addSchedule: (schedule, actor) => {
      requirePermission('schedules.manage')
      const created: Schedule = { ...schedule, id: nextId(), companyId: get().company.id }
      set((s) => ({ schedules: [...s.schedules, created] }))
      persist(get().mode, () => liveInsertSchedule(created))
      writeAudit(
        {
          action: 'schedule.create',
          entityType: 'Schedule',
          entityId: created.id,
          entityLabel: created.name,
          changes: [{ field: 'Horario', before: null, after: created.name }],
        },
        actor,
      )
      return created
    },

    updateSchedule: (id, patch, actor) => {
      requirePermission('schedules.manage')
      const before = get().schedules.find((s) => s.id === id)
      if (!before) return
      const merged = { ...before, ...patch }
      set((s) => ({ schedules: s.schedules.map((sc) => (sc.id === id ? merged : sc)) }))
      persist(get().mode, () => liveUpdateSchedule(id, patch))
      // recompute attendance that uses this schedule
      let recomputed: AttendanceRecord[] = []
      set((s) => {
        recomputed = s.attendance
          .filter((r) => r.scheduleId === id)
          .map((r) => recomputeRecord(r, merged, get().company.attendanceSettings, getToday(get().mode)))
        const byId = new Map(recomputed.map((r) => [r.id, r]))
        return { attendance: s.attendance.map((r) => byId.get(r.id) ?? r) }
      })
      if (recomputed.length) {
        persist(get().mode, () => Promise.all(recomputed.map((r) => liveUpsertAttendance(r))))
      }
      writeAudit(
        {
          action: 'schedule.edit',
          entityType: 'Schedule',
          entityId: id,
          entityLabel: merged.name,
          changes: [{ field: 'Horario', before: 'Configuración anterior', after: 'Actualizado' }],
        },
        actor,
      )
    },

    registerPunch: (input) => {
      const date = input.date ?? getToday(get().mode)
      const state = get()
      const employee = state.employees.find((e) => e.id === input.employeeId)
      if (!employee) throw new PunchError('Empleado no encontrado.')
      if (employee.status !== 'active') {
        throw new PunchError('Este empleado está inactivo y no puede registrar asistencia.')
      }

      let record = state.attendance.find(
        (r) => r.employeeId === input.employeeId && r.date === date,
      )
      const schedule = scheduleOf(state.schedules, employee.scheduleId)

      // Never create an impossible day: entrada→entrada, regreso sin comida,
      // salida sin entrada, doble registro accidental…
      const blocked = canRegisterPunch(
        record?.punches ?? [],
        input.type,
        state.company.attendanceSettings,
        { minutes: resolveKiosk(state.company.attendanceSettings).minGapMinutes, now: input.time },
      )
      if (blocked) throw new PunchError(blocked)

      const punch: Punch = {
        type: input.type,
        time: input.time,
        method: input.method,
        deviceId: input.deviceId,
        location: input.location,
      }

      const nextPunches = [...(record?.punches.filter((p) => p.type !== input.type) ?? []), punch].sort(
        (a, b) => a.time.localeCompare(b.time),
      )
      const inconsistent = validatePunchSequence(nextPunches)
      if (inconsistent) throw new PunchError(inconsistent)

      if (!record) {
        const base: AttendanceRecord = {
          id: nextId(),
          companyId: state.company.id,
          branchId: employee.branchId,
          employeeId: employee.id,
          date,
          scheduleId: schedule.id,
          punches: [punch],
          status: 'present',
          workedMinutes: 0,
          scheduledMinutes: 0,
          lateMinutes: 0,
          overtimeMinutes: 0,
          missingMinutes: 0,
        }
        record = recomputeRecord(base, schedule, state.company.attendanceSettings, getToday(state.mode))
        set((s) => ({ attendance: [record as AttendanceRecord, ...s.attendance] }))
      } else {
        const updated = recomputeRecord(
          { ...record, punches: nextPunches },
          schedule,
          state.company.attendanceSettings,
          getToday(state.mode),
        )
        record = updated
        set((s) => ({
          attendance: s.attendance.map((r) => (r.id === updated.id ? updated : r)),
        }))
      }

      const saved = record as AttendanceRecord
      persist(get().mode, () => liveUpsertAttendance(saved), { kind: 'attendance', payload: saved })
      return { record: saved, punch }
    },

    applyCorrection: ({ recordId, type, time, reason }) => {
      requirePermission('attendance.edit')
      const record = get().attendance.find((r) => r.id === recordId)
      if (!record) return 'No se encontró el registro.'
      const employee = get().employees.find((e) => e.id === record.employeeId)
      requireEmployeeScope(employee)

      const result = editPunch(record.employeeId, record.date, type, time, reason)
      if ('error' in result) return result.error

      writeAudit(
        {
          action: 'attendance.edit',
          entityType: 'AttendanceRecord',
          entityId: recordId,
          entityLabel: `${employee?.fullName ?? 'Empleado'} · ${record.date}`,
          reason,
          changes: [
            {
              field: PUNCH_TYPE_LABEL[type],
              before: result.previous ? formatTime12(result.previous) : 'Sin registro',
              after: formatTime12(time),
            },
          ],
        },
        get().currentUser,
      )
      return null
    },

    importAttendanceCorrections: (changes, actor) => {
      requirePermission('attendance.edit')
      const failed: Array<{ index: number; message: string }> = []
      const summaries: string[] = []
      let applied = 0
      changes.forEach((c, index) => {
        const employee = get().employees.find((e) => e.id === c.employeeId)
        if (!employee || !canAccessEmployee(get().currentUser, employee)) {
          failed.push({ index, message: 'Sin permiso sobre este empleado.' })
          return
        }
        const result = editPunch(c.employeeId, c.date, c.type, c.time, c.reason)
        if ('error' in result) {
          failed.push({ index, message: result.error })
          return
        }
        applied += 1
        summaries.push(
          `${employee.fullName} · ${c.date} · ${PUNCH_TYPE_LABEL[c.type]}: ${result.previous ? formatTime12(result.previous) : 'Sin registro'} → ${formatTime12(c.time)}`,
        )
      })
      if (applied > 0) {
        writeAudit(
          {
            action: 'attendance.edit',
            entityType: 'AttendanceRecord',
            entityId: 'bulk',
            entityLabel: `Importación de correcciones (${applied})`,
            reason: 'Corrección por importación',
            changes: summaries.slice(0, 50).map((s) => ({ field: 'Corrección', before: null, after: s })),
          },
          actor,
        )
      }
      return { applied, failed }
    },

    submitCorrection: (input, actor) => {
      const state = get()
      const requester = state.currentUser
      const employee = state.employees.find((e) => e.id === input.employeeId)
      if (!employee) return 'Empleado no encontrado.'
      // An employee may only ask about their own day; staff need the matching permission.
      if (requester.role === 'employee') {
        if (requester.employeeId !== employee.id) throw new PermissionError()
      } else {
        requirePermission('attendance.request_correction')
        requireEmployeeScope(employee)
      }
      if (!input.reason.trim()) return 'Escribe el motivo de la corrección.'
      if (input.date > getToday(state.mode)) return 'No puedes corregir un día futuro.'

      const existing = state.attendance.find(
        (r) => r.employeeId === employee.id && r.date === input.date,
      )
      const previous = existing?.punches.find((p) => p.type === input.type)?.time ?? null
      if (previous === input.time) return 'La hora solicitada es igual a la registrada.'
      if (
        state.corrections.some(
          (c) =>
            c.status === 'pending' &&
            c.employeeId === employee.id &&
            c.date === input.date &&
            c.punchType === input.type,
        )
      ) {
        return 'Ya existe una solicitud pendiente para ese movimiento.'
      }

      // Reject requests that could never be applied (e.g. salida before entrada).
      const proposed = [
        ...(existing?.punches.filter((p) => p.type !== input.type) ?? []),
        { type: input.type, time: input.time, method: 'manual' as const },
      ]
      const invalid = validatePunchSequence(proposed)
      if (invalid) return invalid

      const created: CorrectionRequest = {
        id: nextId(),
        companyId: state.company.id,
        employeeId: employee.id,
        date: input.date,
        punchType: input.type,
        previousTime: previous,
        requestedTime: input.time,
        reason: input.reason.trim(),
        status: 'pending',
        requestedById: actor.id,
        requestedByName: actor.name,
        createdAt: nowISO(),
      }
      set((s) => ({ corrections: [created, ...s.corrections] }))
      persist(get().mode, () => liveUpsertCorrection(created), { kind: 'correction', payload: created })
      writeAudit(
        {
          action: 'attendance.correction_requested',
          entityType: 'CorrectionRequest',
          entityId: created.id,
          entityLabel: `${employee.fullName} · ${input.date}`,
          reason: created.reason,
          changes: [
            {
              field: PUNCH_TYPE_LABEL[input.type],
              before: previous ? formatTime12(previous) : 'Sin registro',
              after: `${formatTime12(input.time)} (solicitado)`,
            },
          ],
        },
        actor,
      )
      return null
    },

    reviewCorrection: (id, decision, note, actor) => {
      requirePermission('corrections.review')
      const request = get().corrections.find((c) => c.id === id)
      if (!request) return 'Solicitud no encontrada.'
      if (request.status !== 'pending') return 'Esta solicitud ya fue resuelta.'
      const employee = get().employees.find((e) => e.id === request.employeeId)
      requireEmployeeScope(employee)
      const reviewer = get().currentUser
      if (reviewer.role === 'supervisor' && request.requestedById === reviewer.id) {
        return 'No puedes resolver una solicitud que tú mismo creaste.'
      }
      if (decision === 'rejected' && !note.trim()) return 'Escribe el motivo del rechazo.'
      // A supervisor may fill in a missing punch, but changing a time that is
      // already recorded needs RH / admin (the database enforces the same rule).
      if (decision === 'approved' && reviewer.role === 'supervisor') {
        const current = get().attendance.find(
          (r) => r.employeeId === request.employeeId && r.date === request.date,
        )
        if (current?.punches.some((p) => p.type === request.punchType)) {
          return 'Solo RH o un administrador puede aprobar cambios sobre una hora ya registrada.'
        }
      }

      let previous: string | null = request.previousTime
      if (decision === 'approved') {
        const result = editPunch(
          request.employeeId,
          request.date,
          request.punchType,
          request.requestedTime,
          `Corrección aprobada: ${request.reason}`,
        )
        if ('error' in result) return result.error
        previous = result.previous
      }

      const updated: CorrectionRequest = {
        ...request,
        status: decision,
        reviewedById: reviewer.id,
        reviewedByName: reviewer.name,
        reviewedAt: nowISO(),
        reviewNote: note.trim() || undefined,
      }
      set((s) => ({ corrections: s.corrections.map((c) => (c.id === id ? updated : c)) }))
      persist(get().mode, () => liveUpsertCorrection(updated), { kind: 'correction', payload: updated })
      writeAudit(
        {
          action: decision === 'approved' ? 'correction.approve' : 'correction.reject',
          entityType: 'CorrectionRequest',
          entityId: id,
          entityLabel: `${employee?.fullName ?? 'Empleado'} · ${request.date}`,
          reason: note.trim() || request.reason,
          changes: [
            {
              field: PUNCH_TYPE_LABEL[request.punchType],
              before: previous ? formatTime12(previous) : 'Sin registro',
              after:
                decision === 'approved'
                  ? formatTime12(request.requestedTime)
                  : `${previous ? formatTime12(previous) : 'Sin registro'} (rechazada)`,
            },
          ],
        },
        actor,
      )
      return null
    },

    addIncidencia: (input, actor) => {
      requirePermission('incidencias.view')
      const employee = get().employees.find((e) => e.id === input.employeeId)
      requireEmployeeScope(employee)
      // RH / admin / propietario registran incidencias ya aprobadas; las de un
      // supervisor quedan pendientes hasta que alguien más las revise.
      const status: IncidenciaStatus = ['owner', 'admin', 'hr'].includes(get().currentUser.role)
        ? 'approved'
        : 'pending'
      const created: Incidencia = {
        id: nextId(),
        companyId: get().company.id,
        employeeId: input.employeeId,
        type: input.type,
        from: input.from,
        to: input.to,
        reason: input.reason,
        status,
        requestedById: actor.id,
        createdAt: nowISO(),
      }
      set((s) => ({ incidencias: [created, ...s.incidencias] }))
      persist(get().mode, () => liveUpsertIncidencia(created), { kind: 'incidencia', payload: created })
      writeAudit(
        {
          action: 'incidencia.create',
          entityType: 'Incidencia',
          entityId: created.id,
          entityLabel: `${employee?.fullName ?? 'Empleado'} · ${INCIDENCIA_META[input.type].label}`,
          reason: input.reason,
          changes: [
            {
              field: INCIDENCIA_META[input.type].label,
              before: null,
              after: input.from === input.to ? input.from : `${input.from} a ${input.to}`,
            },
          ],
        },
        actor,
      )
      return created
    },

    reviewIncidencia: (id, status, note, actor) => {
      requirePermission('incidencias.review')
      const inc = get().incidencias.find((i) => i.id === id)
      if (!inc) return
      const employee = get().employees.find((e) => e.id === inc.employeeId)
      requireEmployeeScope(employee)
      const reviewer = get().currentUser
      if (reviewer.role === 'supervisor' && inc.requestedById === reviewer.id) {
        throw new PermissionError('No puedes resolver una incidencia que tú mismo creaste.')
      }
      const updated: Incidencia = {
        ...inc,
        status,
        updatedAt: nowISO(),
        reviewedById: reviewer.id,
        reviewedByName: reviewer.name,
        reviewNote: note.trim() || undefined,
      }
      set((s) => ({ incidencias: s.incidencias.map((i) => (i.id === id ? updated : i)) }))
      persist(get().mode, () => liveUpsertIncidencia(updated), { kind: 'incidencia', payload: updated })
      const action: AuditAction =
        status === 'approved'
          ? 'incidencia.approve'
          : status === 'rejected'
            ? 'incidencia.reject'
            : 'incidencia.correct'
      writeAudit(
        {
          action,
          entityType: 'Incidencia',
          entityId: id,
          entityLabel: `${employee?.fullName ?? 'Empleado'} · ${INCIDENCIA_META[inc.type].label}`,
          reason: note.trim() || undefined,
          changes: [{ field: 'Estado', before: inc.status, after: status }],
        },
        actor,
      )
    },

    cancelIncidencia: (id, actor) => {
      requirePermission('incidencias.review')
      const inc = get().incidencias.find((i) => i.id === id)
      if (!inc) return
      const employee = get().employees.find((e) => e.id === inc.employeeId)
      requireEmployeeScope(employee)
      set((s) => ({ incidencias: s.incidencias.filter((i) => i.id !== id) }))
      persist(get().mode, () => liveDeleteIncidencia(id))
      writeAudit(
        {
          action: 'incidencia.cancel',
          entityType: 'Incidencia',
          entityId: id,
          entityLabel: `${employee?.fullName ?? 'Empleado'} · ${INCIDENCIA_META[inc.type].label}`,
          changes: [
            {
              field: INCIDENCIA_META[inc.type].label,
              before: inc.from === inc.to ? inc.from : `${inc.from} a ${inc.to}`,
              after: 'Cancelada',
            },
          ],
        },
        actor,
      )
    },

    addUser: async (input, actor) => {
      requirePermission('users.manage')
      if (input.role === 'owner' && get().currentUser.role !== 'owner') {
        throw new PermissionError('Solo el propietario puede crear otro propietario.')
      }
      if (input.role === 'employee' && !input.employeeId) {
        throw new Error('Selecciona a qué empleado pertenece este acceso.')
      }
      let created: User
      if (get().mode === 'live') {
        if (!input.password || input.password.length < 8) {
          throw new Error('La contraseña debe tener al menos 8 caracteres.')
        }
        created = await liveCreateUserAccount({
          name: input.name,
          email: input.email,
          password: input.password,
          role: input.role,
          employeeId: input.employeeId,
          branchIds: input.branchIds,
          departments: input.departments,
        })
      } else {
        created = {
          id: nextId(),
          companyId: get().company.id,
          name: input.name,
          email: input.email,
          role: input.role,
          branchIds: input.branchIds,
          departments: input.departments,
          employeeId: input.employeeId,
          active: true,
        }
      }
      set((s) => ({ users: [...s.users, created] }))
      writeAudit(
        {
          action: 'user.create',
          entityType: 'User',
          entityId: created.id,
          entityLabel: created.name,
          changes: [{ field: 'Usuario', before: null, after: `${created.email} (${input.role})` }],
        },
        actor,
      )
      return created
    },

    updateUserAccess: (id, patch, actor) => {
      requirePermission('users.manage')
      const state = get()
      const target = state.users.find((u) => u.id === id)
      if (!target) return 'Usuario no encontrado.'
      const me = state.currentUser
      if (id === me.id && (patch.role !== undefined || patch.active === false)) {
        return 'No puedes cambiar tu propio rol ni desactivarte.'
      }
      if (
        (patch.role === 'owner' || target.role === 'owner') &&
        me.role !== 'owner' &&
        patch.role !== target.role
      ) {
        return 'Solo el propietario puede asignar o quitar el rol de propietario.'
      }
      if (patch.role === 'employee' && !(patch.employeeId ?? target.employeeId)) {
        return 'Un acceso de empleado debe estar ligado a un empleado.'
      }
      const merged: User = { ...target, ...patch }
      set((s) => ({ users: s.users.map((u) => (u.id === id ? merged : u)) }))
      persist(get().mode, () => liveUpdateProfile(id, patch))

      const changes: AuditChange[] = []
      if (patch.role !== undefined && patch.role !== target.role) {
        changes.push({ field: 'Rol', before: target.role, after: patch.role })
      }
      if (patch.active !== undefined && patch.active !== target.active) {
        changes.push({ field: 'Activo', before: String(target.active), after: String(patch.active) })
      }
      if (patch.branchIds !== undefined && patch.branchIds.join() !== target.branchIds.join()) {
        changes.push({
          field: 'Sucursales',
          before: target.branchIds.length ? String(target.branchIds.length) : 'Todas',
          after: patch.branchIds.length ? String(patch.branchIds.length) : 'Todas',
        })
      }
      if (
        patch.departments !== undefined &&
        patch.departments.join() !== (target.departments ?? []).join()
      ) {
        changes.push({
          field: 'Departamentos',
          before: (target.departments ?? []).join(', ') || 'Todos',
          after: patch.departments.join(', ') || 'Todos',
        })
      }
      if (changes.length) {
        writeAudit(
          {
            action: 'user.role_change',
            entityType: 'User',
            entityId: id,
            entityLabel: target.name,
            changes,
          },
          actor,
        )
      }
      return null
    },

    addDevice: (device, actor) => {
      requirePermission('devices.manage')
      const created: Device = { ...device, id: nextId(), companyId: get().company.id }
      set((s) => ({ devices: [...s.devices, created] }))
      persist(get().mode, () => liveInsertDevice(created))
      writeAudit(
        {
          action: 'device.register',
          entityType: 'Device',
          entityId: created.id,
          entityLabel: created.name,
          changes: [{ field: 'Dispositivo', before: null, after: created.name }],
        },
        actor,
      )
    },

    updateSettings: (patch, actor) => {
      requirePermission('settings.manage')
      const before = get().company.attendanceSettings
      const merged = { ...before, ...patch }
      set((s) => ({ company: { ...s.company, attendanceSettings: merged } }))
      persist(get().mode, () => liveUpdateCompany(get().company.id, { attendanceSettings: merged }))
      // recompute everything
      let recomputed: AttendanceRecord[] = []
      set((s) => {
        recomputed = s.attendance.map((r) =>
          recomputeRecord(r, scheduleOf(s.schedules, r.scheduleId), merged, getToday(s.mode)),
        )
        return { attendance: recomputed }
      })
      if (get().mode === 'live' && recomputed.length) {
        persist('live', () => Promise.all(recomputed.map((r) => liveUpsertAttendance(r))))
      }
      const flat = (o: unknown): Record<string, string> => {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
          if (v && typeof v === 'object') {
            for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out[`${k}.${k2}`] = String(v2)
          } else out[k] = String(v)
        }
        return out
      }
      const bf = flat(before)
      const af = flat(merged)
      const changed = Object.keys(flat(patch)).length ? Object.keys(af).filter((k) => bf[k] !== af[k]) : []
      const changes: AuditChange[] = changed.map((k) => ({
        field: k,
        before: bf[k] ?? '—',
        after: af[k] ?? '—',
      }))
      writeAudit(
        {
          action: 'settings.update',
          entityType: 'AttendanceSettings',
          entityId: get().company.id,
          entityLabel: 'Configuración de asistencia',
          changes,
        },
        actor,
      )
    },

    updateCompany: (patch, actor) => {
      requirePermission('settings.manage')
      const before = get().company
      set((s) => ({ company: { ...s.company, ...patch } }))
      persist(get().mode, () => liveUpdateCompany(before.id, patch))
      const changes: AuditChange[] = Object.keys(patch)
        .filter((k) => typeof (patch as unknown as Record<string, unknown>)[k] !== 'object')
        .map((k) => ({
          field: k,
          before: String((before as unknown as Record<string, unknown>)[k] ?? '—'),
          after: String((patch as unknown as Record<string, unknown>)[k] ?? '—'),
        }))
      writeAudit(
        {
          action: 'settings.update',
          entityType: 'Company',
          entityId: before.id,
          entityLabel: 'Datos de la empresa',
          changes,
        },
        actor,
      )
    },

    reset: () => {
      if (get().mode === 'live') return // nunca borres los datos reales de un cliente
      const fresh = buildMockDatabase()
      saveCurrentUserId(fresh.users[0].id)
      set({ mode: 'demo', ...fresh, currentUser: fresh.users[0] })
    },
  }
})

export { weekdayFromISO }
