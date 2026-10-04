/**
 * Domain model for NEXOTIME.
 *
 * The model is intentionally multi-tenant from day one so the demo can later
 * become a real SaaS product without a data-model rewrite. Every entity that a
 * customer owns carries a `companyId`; branch-scoped entities also carry a
 * `branchId`. Services filter by the active tenant context (see
 * `src/services/tenantContext.ts`).
 */

export type ID = string

export type ISODate = string // "2026-09-10"
export type ISODateTime = string // "2026-09-10T08:57:00"
export type ClockTime = string // "08:57" (24h, local to branch)

/* -------------------------------------------------------------------------- */
/*  Tenancy                                                                    */
/* -------------------------------------------------------------------------- */

export interface Company {
  id: ID
  name: string
  legalName: string
  rfc: string
  industry: string
  timezone: string
  logoUrl?: string
  /** Default weekly target in hours. Configurable — never hard-coded to 46. */
  weeklyTargetHours: number
  attendanceSettings: AttendanceSettings
  createdAt: ISODate
  /** Read-only: only a service-role process (a payment webhook, or you recording
   *  a manual payment) can change this — see supabase/migrations/004_suscripciones.sql. */
  subscription: Subscription
}

/** Same plan names as license-server/src/plans.js, kept during the migration off licenses. */
export type SubscriptionPlan = 'basico' | 'profesional' | 'empresa'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface Subscription {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  trialEndsAt: ISODateTime
  currentPeriodEnd: ISODateTime | null
}

/** Read-only history row: only a service-role process can ever insert one
 *  (see supabase/migrations/004_suscripciones.sql — no insert policy for the
 *  app's own session, on purpose). */
export interface Payment {
  id: ID
  companyId: ID
  amount: number
  currency: string
  method: 'manual' | 'stripe' | 'mercadopago'
  reference: string
  monthsCovered: number
  createdAt: ISODateTime
}

export interface AttendanceSettings {
  /** Grace period in minutes before an entry counts as a late arrival. */
  entryToleranceMinutes: number
  /** Minutes past scheduled entry after which the day is marked as absent. */
  absenceThresholdMinutes: number
  allowEarlyLeave: boolean
  trackLunch: boolean
  /** If false, a second "entrada" the same day is rejected by the clock. */
  allowMultipleEntries: boolean
  /** Minutes worked beyond schedule before overtime accrues. */
  overtimeThresholdMinutes: number
  roundingMinutes: number
  /** Reloj checador. All optional: companies created before these existed use the defaults. */
  kiosk?: KioskSettings
}

export type FaceStrictness = 'strict' | 'balanced' | 'relaxed'

export interface KioskSettings {
  /** After identifying, register the next movement on its own (with a short cancel window). */
  autoRegister?: boolean
  /** Seconds of the cancel window before auto-registering. */
  autoRegisterSeconds?: number
  /** How sure the system must be before accepting a face. */
  faceStrictness?: FaceStrictness
  /** Exact match distance (0.35–0.75, lower = stricter). Overrides the strictness level when set. */
  faceThreshold?: number
  /** Digital zoom on the face camera at the reloj (1–2.5×): for tablets with a wide, basic camera. */
  faceZoom?: number
  /** Minimum minutes between two punches of the same person (avoids double punches). */
  minGapMinutes?: number
  /** Code (4–8 digits) that unlocks leaving the reloj checador back to the admin panel. */
  exitPin?: string
}

export interface Branch {
  id: ID
  companyId: ID
  name: string
  code: string
  address: string
  city: string
  timezone: string
  phone?: string
  active: boolean
  /** Fixed once by an admin (search by address or type by hand) — the reloj
   *  checador uses this instead of the device's own GPS, which is slower
   *  and less reliable for a kiosk that never moves. */
  lat?: number
  lng?: number
}

/* -------------------------------------------------------------------------- */
/*  Identity & access                                                          */
/* -------------------------------------------------------------------------- */

export type RoleKey = 'owner' | 'admin' | 'hr' | 'supervisor' | 'employee'

export interface Role {
  key: RoleKey
  label: string
  description: string
  permissions: Permission[]
}

export type Permission =
  | 'dashboard.view'
  | 'employees.view'
  | 'employees.create'
  | 'employees.edit'
  | 'employees.delete'
  | 'attendance.view'
  | 'attendance.edit'
  | 'attendance.request_correction'
  | 'schedules.view'
  | 'schedules.manage'
  | 'branches.view'
  | 'branches.manage'
  | 'reports.view'
  | 'reports.export'
  | 'devices.view'
  | 'devices.manage'
  | 'users.view'
  | 'users.manage'
  | 'audit.view'
  | 'settings.view'
  | 'settings.manage'
  | 'incidencias.view'
  | 'incidencias.review'
  | 'corrections.view'
  | 'corrections.review'
  /** Portal del empleado ("Mi asistencia"): solo sus propios datos. */
  | 'self.view'
  /** Registrar, actualizar y eliminar datos biométricos (rostro). Solo administración. */
  | 'biometrics.manage'

export interface User {
  id: ID
  companyId: ID
  name: string
  email: string
  role: RoleKey
  /** Branches this user can see. Empty array = all branches in the company. */
  branchIds: ID[]
  /** Supervisores: limita además por departamento. Vacío = todos los de sus sucursales. */
  departments?: string[]
  /** Rol "employee": empleado al que pertenece este acceso. */
  employeeId?: ID
  avatarUrl?: string
  active: boolean
  lastLoginAt?: ISODateTime
}

/* -------------------------------------------------------------------------- */
/*  Employees                                                                  */
/* -------------------------------------------------------------------------- */

export type EmployeeStatus = 'active' | 'inactive'

export type IdentificationMethod = 'face' | 'qr' | 'barcode' | 'employee_number' | 'pin'

export interface EmployeeIdentification {
  method: IdentificationMethod
  enabled: boolean
  /** For QR / barcode: the encoded value. For PIN: masked. */
  value?: string
  /** Face method: 128-number descriptors of the enrolled samples (never photos). */
  descriptors?: number[][]
  enrolledAt?: ISODateTime
}

export interface Employee {
  id: ID
  companyId: ID
  branchId: ID
  employeeNumber: string // "EMP-001"
  firstName: string
  lastNamePaternal: string
  lastNameMaternal?: string
  fullName: string
  position: string
  department: string
  email?: string
  phone?: string
  photoUrl?: string
  status: EmployeeStatus
  hireDate: ISODate
  scheduleId: ID
  identifications: EmployeeIdentification[]
  pin?: string // demo only, never store plaintext in production
  /** Optional HR fields — deliberately not required. */
  curp?: string
  address?: string
  emergencyContact?: {
    name: string
    relationship: string
    phone: string
  }
}

/* -------------------------------------------------------------------------- */
/*  Schedules                                                                  */
/* -------------------------------------------------------------------------- */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface ScheduleDay {
  weekday: Weekday
  enabled: boolean
  entry: ClockTime
  lunchOut?: ClockTime
  lunchIn?: ClockTime
  exit: ClockTime
}

export interface Schedule {
  id: ID
  companyId: ID
  name: string
  description?: string
  days: ScheduleDay[]
  /** Target hours per week for employees on this schedule. Configurable. */
  weeklyTargetHours: number
  color: string
}

/* -------------------------------------------------------------------------- */
/*  Attendance                                                                 */
/* -------------------------------------------------------------------------- */

export type PunchType = 'entry' | 'lunch_out' | 'lunch_in' | 'exit'

export type CaptureMethod = 'face' | 'qr' | 'barcode' | 'employee_number' | 'pin' | 'manual' | 'app'

export interface Punch {
  type: PunchType
  time: ClockTime
  method: CaptureMethod
  deviceId?: ID
  /** True when an admin added or edited this punch. */
  edited?: boolean
  /** Where the device sat when it registered this punch (browser geolocation). */
  location?: PunchLocation
}

export interface PunchLocation {
  lat: number
  lng: number
  /** Meters, as reported by the browser — smaller is more precise. */
  accuracy?: number
}

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'incomplete'
  | 'overtime'
  | 'rest'

export interface AttendanceRecord {
  id: ID
  companyId: ID
  branchId: ID
  employeeId: ID
  date: ISODate
  scheduleId: ID
  punches: Punch[]
  status: AttendanceStatus
  /** Derived metrics, recomputed by `src/lib/attendance.ts`. */
  workedMinutes: number
  scheduledMinutes: number
  lateMinutes: number
  overtimeMinutes: number
  missingMinutes: number
  note?: string
}

/* -------------------------------------------------------------------------- */
/*  Incidencias (ausencias justificadas)                                       */
/* -------------------------------------------------------------------------- */

export type IncidenciaType =
  | 'vacaciones'
  | 'permiso_con_goce'
  | 'permiso_sin_goce'
  | 'incapacidad'
  | 'retardo'
  | 'falta'
  | 'salida_anticipada'
  | 'entrada_olvidada'
  | 'salida_olvidada'
  | 'comida_excedida'
  | 'hora_extra'
  | 'otra'

export type IncidenciaStatus = 'pending' | 'approved' | 'rejected' | 'corrected'

export interface Incidencia {
  id: ID
  companyId: ID
  employeeId: ID
  type: IncidenciaType
  from: ISODate
  to: ISODate
  /** Descripción / motivo. */
  reason?: string
  status: IncidenciaStatus
  /** Quién la creó. */
  requestedById: ID
  createdAt: ISODateTime
  /** Última modificación (revisión) y quién la hizo. */
  updatedAt?: ISODateTime
  reviewedById?: ID
  reviewedByName?: string
  reviewNote?: string
}

/* -------------------------------------------------------------------------- */
/*  Solicitudes de corrección de asistencia                                    */
/* -------------------------------------------------------------------------- */

export type CorrectionStatus = 'pending' | 'approved' | 'rejected'

export interface CorrectionRequest {
  id: ID
  companyId: ID
  employeeId: ID
  /** Día de asistencia que se quiere corregir. */
  date: ISODate
  punchType: PunchType
  /** Hora registrada actualmente (null si no existe). */
  previousTime: ClockTime | null
  requestedTime: ClockTime
  reason: string
  status: CorrectionStatus
  requestedById: ID
  requestedByName: string
  createdAt: ISODateTime
  reviewedById?: ID
  reviewedByName?: string
  reviewedAt?: ISODateTime
  reviewNote?: string
}

/* -------------------------------------------------------------------------- */
/*  Devices                                                                    */
/* -------------------------------------------------------------------------- */

export type DeviceType = 'tablet' | 'pc' | 'terminal' | 'mobile'
export type DeviceStatus = 'online' | 'offline' | 'inactive'

export interface Device {
  id: ID
  companyId: ID
  branchId: ID
  name: string
  type: DeviceType
  platform: string
  status: DeviceStatus
  lastSeenAt: ISODateTime
  pairingCode: string
  enabledMethods: IdentificationMethod[]
}

/* -------------------------------------------------------------------------- */
/*  Audit                                                                      */
/* -------------------------------------------------------------------------- */

export type AuditAction =
  | 'attendance.edit'
  | 'attendance.create'
  | 'attendance.correction_requested'
  | 'employee.create'
  | 'employee.edit'
  | 'employee.deactivate'
  | 'schedule.create'
  | 'schedule.edit'
  | 'device.register'
  | 'user.create'
  | 'settings.update'
  | 'incidencia.create'
  | 'incidencia.cancel'
  | 'incidencia.approve'
  | 'incidencia.reject'
  | 'incidencia.correct'
  | 'correction.approve'
  | 'correction.reject'
  | 'branch.create'
  | 'branch.edit'
  | 'integration.connect'
  | 'integration.disconnect'
  | 'user.role_change'
  | 'face.rejected'

export interface AuditChange {
  field: string
  before: string | null
  after: string | null
}

export interface AuditLog {
  id: ID
  companyId: ID
  actorId: ID
  actorName: string
  actorRole: RoleKey
  action: AuditAction
  entityType: string
  entityId: ID
  entityLabel: string
  reason?: string
  changes: AuditChange[]
  createdAt: ISODateTime
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                    */
/* -------------------------------------------------------------------------- */

export type ReportType =
  | 'attendance_general'
  | 'worked_hours'
  | 'late_arrivals'
  | 'absences'
  | 'overtime'
  | 'employee_summary'
  | 'branch_summary'
  | 'legal_evidence'
  | 'incidencias'

export interface ReportRow {
  employeeName: string
  employeeNumber: string
  date: string
  entry: string
  lunchOut: string
  lunchIn: string
  exit: string
  workedHours: string
  scheduledHours: string
  overtime: string
  status: string
}
