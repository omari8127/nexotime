/**
 * Row (snake_case, straight from Postgres) <-> domain type (camelCase, used
 * everywhere else in the app) conversions. Keeping these in one file means
 * the rest of the app never has to know a real database is involved.
 */
import type {
  AttendanceRecord,
  AttendanceSettings,
  AuditLog,
  Branch,
  Company,
  CorrectionRequest,
  Device,
  Employee,
  EmployeeIdentification,
  Incidencia,
  Payment,
  Punch,
  Schedule,
  ScheduleDay,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  User,
} from '@/types'

/* --------------------------------- company -------------------------------- */

export function companyFromRow(row: Record<string, unknown>): Company {
  return {
    id: row.id as string,
    name: row.name as string,
    legalName: (row.legal_name as string) ?? '',
    rfc: (row.rfc as string) ?? '',
    industry: (row.industry as string) ?? '',
    timezone: (row.timezone as string) ?? 'America/Mexico_City',
    weeklyTargetHours: Number(row.weekly_target_hours ?? 40),
    attendanceSettings: row.attendance_settings as AttendanceSettings,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    subscription: subscriptionFromRow(row),
  }
}

// Defensive fallbacks: a company row from before migration 004 (or read with an
// older cached snapshot) simply won't have these columns yet.
function subscriptionFromRow(row: Record<string, unknown>): Subscription {
  return {
    plan: (row.plan as SubscriptionPlan) ?? 'basico',
    status: (row.subscription_status as SubscriptionStatus) ?? 'trialing',
    trialEndsAt: (row.trial_ends_at as string) ?? new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
  }
}

/* --------------------------------- payments -------------------------------- */

export function paymentFromRow(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    amount: Number(row.amount),
    currency: (row.currency as string) ?? 'MXN',
    method: (row.method as Payment['method']) ?? 'manual',
    reference: (row.reference as string) ?? '',
    monthsCovered: Number(row.months_covered ?? 1),
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  }
}

export function companyToRow(patch: Partial<Company>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.legalName !== undefined) row.legal_name = patch.legalName
  if (patch.rfc !== undefined) row.rfc = patch.rfc
  if (patch.industry !== undefined) row.industry = patch.industry
  if (patch.timezone !== undefined) row.timezone = patch.timezone
  if (patch.weeklyTargetHours !== undefined) row.weekly_target_hours = patch.weeklyTargetHours
  if (patch.attendanceSettings !== undefined) row.attendance_settings = patch.attendanceSettings
  return row
}

/* --------------------------------- profile (User) -------------------------- */

export function profileFromRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as User['role'],
    branchIds: (row.branch_ids as string[]) ?? [],
    departments: (row.departments as string[] | null) ?? [],
    employeeId: (row.employee_id as string | null) ?? undefined,
    active: (row.active as boolean) ?? true,
    lastLoginAt: row.last_login_at as string | undefined,
  }
}

export function profileToPatch(patch: Partial<User>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.role !== undefined) row.role = patch.role
  if (patch.branchIds !== undefined) row.branch_ids = patch.branchIds
  if (patch.departments !== undefined) row.departments = patch.departments
  if (patch.employeeId !== undefined) row.employee_id = patch.employeeId
  if (patch.active !== undefined) row.active = patch.active
  return row
}

/* --------------------------------- branch --------------------------------- */

export function branchFromRow(row: Record<string, unknown>): Branch {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    code: (row.code as string) ?? '',
    address: (row.address as string) ?? '',
    city: (row.city as string) ?? '',
    timezone: (row.timezone as string) ?? 'America/Mexico_City',
    phone: row.phone as string | undefined,
    active: (row.active as boolean) ?? true,
  }
}

export function branchToRow(b: Branch) {
  return {
    id: b.id,
    company_id: b.companyId,
    name: b.name,
    code: b.code,
    address: b.address,
    city: b.city,
    timezone: b.timezone,
    phone: b.phone ?? null,
    active: b.active,
  }
}

/* -------------------------------- schedule --------------------------------- */

export function scheduleFromRow(row: Record<string, unknown>): Schedule {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    days: row.days as ScheduleDay[],
    weeklyTargetHours: Number(row.weekly_target_hours ?? 40),
    color: (row.color as string) ?? '#2554eb',
  }
}

export function scheduleToRow(s: Schedule) {
  return {
    id: s.id,
    company_id: s.companyId,
    name: s.name,
    description: s.description ?? null,
    days: s.days,
    weekly_target_hours: s.weeklyTargetHours,
    color: s.color,
  }
}

/* -------------------------------- employee ---------------------------------- */

export function employeeFromRow(row: Record<string, unknown>): Employee {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    branchId: row.branch_id as string,
    employeeNumber: row.employee_number as string,
    firstName: row.first_name as string,
    lastNamePaternal: row.last_name_paternal as string,
    lastNameMaternal: row.last_name_maternal as string | undefined,
    fullName: row.full_name as string,
    position: (row.position as string) ?? '',
    department: (row.department as string) ?? '',
    email: row.email as string | undefined,
    phone: row.phone as string | undefined,
    photoUrl: row.photo_url as string | undefined,
    status: row.status as Employee['status'],
    hireDate: row.hire_date as string,
    scheduleId: row.schedule_id as string,
    identifications: (row.identifications as EmployeeIdentification[]) ?? [],
    pin: row.pin as string | undefined,
    curp: row.curp as string | undefined,
    address: row.address as string | undefined,
    emergencyContact: row.emergency_contact as Employee['emergencyContact'],
  }
}

export function employeeToRow(e: Employee) {
  return {
    id: e.id,
    company_id: e.companyId,
    branch_id: e.branchId,
    employee_number: e.employeeNumber,
    first_name: e.firstName,
    last_name_paternal: e.lastNamePaternal,
    last_name_maternal: e.lastNameMaternal ?? null,
    full_name: e.fullName,
    position: e.position,
    department: e.department,
    email: e.email ?? null,
    phone: e.phone ?? null,
    photo_url: e.photoUrl ?? null,
    status: e.status,
    hire_date: e.hireDate,
    schedule_id: e.scheduleId,
    identifications: e.identifications,
    pin: e.pin ?? null,
    curp: e.curp ?? null,
    address: e.address ?? null,
    emergency_contact: e.emergencyContact ?? null,
  }
}

/* ----------------------------- attendance record ----------------------------- */

export function attendanceFromRow(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    branchId: row.branch_id as string,
    employeeId: row.employee_id as string,
    date: row.date as string,
    scheduleId: row.schedule_id as string,
    punches: (row.punches as Punch[]) ?? [],
    status: row.status as AttendanceRecord['status'],
    workedMinutes: Number(row.worked_minutes ?? 0),
    scheduledMinutes: Number(row.scheduled_minutes ?? 0),
    lateMinutes: Number(row.late_minutes ?? 0),
    overtimeMinutes: Number(row.overtime_minutes ?? 0),
    missingMinutes: Number(row.missing_minutes ?? 0),
    note: row.note as string | undefined,
  }
}

export function attendanceToRow(r: AttendanceRecord) {
  return {
    company_id: r.companyId,
    branch_id: r.branchId,
    employee_id: r.employeeId,
    date: r.date,
    schedule_id: r.scheduleId,
    punches: r.punches,
    status: r.status,
    worked_minutes: r.workedMinutes,
    scheduled_minutes: r.scheduledMinutes,
    late_minutes: r.lateMinutes,
    overtime_minutes: r.overtimeMinutes,
    missing_minutes: r.missingMinutes,
    note: r.note ?? null,
    updated_at: new Date().toISOString(),
  }
}

/* --------------------------------- device ----------------------------------- */

export function deviceFromRow(row: Record<string, unknown>): Device {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    branchId: row.branch_id as string,
    name: row.name as string,
    type: row.type as Device['type'],
    platform: (row.platform as string) ?? '',
    status: row.status as Device['status'],
    lastSeenAt: row.last_seen_at as string,
    pairingCode: (row.pairing_code as string) ?? '',
    enabledMethods: (row.enabled_methods as Device['enabledMethods']) ?? [],
  }
}

export function deviceToRow(d: Device) {
  return {
    id: d.id,
    company_id: d.companyId,
    branch_id: d.branchId,
    name: d.name,
    type: d.type,
    platform: d.platform,
    status: d.status,
    last_seen_at: d.lastSeenAt,
    pairing_code: d.pairingCode,
    enabled_methods: d.enabledMethods,
  }
}

/* ------------------------------- incidencia ---------------------------------- */

export function incidenciaFromRow(row: Record<string, unknown>): Incidencia {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    employeeId: row.employee_id as string,
    type: row.type as Incidencia['type'],
    from: row.from_date as string,
    to: row.to_date as string,
    reason: (row.reason as string | null) ?? undefined,
    // Filas creadas antes de la migración no tenían estado: ya estaban vigentes.
    status: ((row.status as string | null) ?? 'approved') as Incidencia['status'],
    requestedById: row.requested_by_id as string,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? undefined,
    reviewedById: (row.reviewed_by_id as string | null) ?? undefined,
    reviewedByName: (row.reviewed_by_name as string | null) ?? undefined,
    reviewNote: (row.review_note as string | null) ?? undefined,
  }
}

export function incidenciaToRow(i: Incidencia) {
  return {
    id: i.id,
    company_id: i.companyId,
    employee_id: i.employeeId,
    type: i.type,
    from_date: i.from,
    to_date: i.to,
    reason: i.reason ?? null,
    status: i.status,
    requested_by_id: i.requestedById,
    created_at: i.createdAt,
    updated_at: i.updatedAt ?? null,
    reviewed_by_id: i.reviewedById ?? null,
    reviewed_by_name: i.reviewedByName ?? null,
    review_note: i.reviewNote ?? null,
  }
}

/* ------------------------------ correction request --------------------------- */

export function correctionFromRow(row: Record<string, unknown>): CorrectionRequest {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    employeeId: row.employee_id as string,
    date: row.date as string,
    punchType: row.punch_type as CorrectionRequest['punchType'],
    previousTime: (row.previous_time as string | null) ?? null,
    requestedTime: row.requested_time as string,
    reason: row.reason as string,
    status: row.status as CorrectionRequest['status'],
    requestedById: row.requested_by_id as string,
    requestedByName: row.requested_by_name as string,
    createdAt: row.created_at as string,
    reviewedById: (row.reviewed_by_id as string | null) ?? undefined,
    reviewedByName: (row.reviewed_by_name as string | null) ?? undefined,
    reviewedAt: (row.reviewed_at as string | null) ?? undefined,
    reviewNote: (row.review_note as string | null) ?? undefined,
  }
}

export function correctionToRow(c: CorrectionRequest) {
  return {
    id: c.id,
    company_id: c.companyId,
    employee_id: c.employeeId,
    date: c.date,
    punch_type: c.punchType,
    previous_time: c.previousTime,
    requested_time: c.requestedTime,
    reason: c.reason,
    status: c.status,
    requested_by_id: c.requestedById,
    requested_by_name: c.requestedByName,
    created_at: c.createdAt,
    reviewed_by_id: c.reviewedById ?? null,
    reviewed_by_name: c.reviewedByName ?? null,
    reviewed_at: c.reviewedAt ?? null,
    review_note: c.reviewNote ?? null,
  }
}

/* --------------------------------- audit log ---------------------------------- */

export function auditFromRow(row: Record<string, unknown>): AuditLog {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    actorId: row.actor_id as string,
    actorName: row.actor_name as string,
    actorRole: row.actor_role as AuditLog['actorRole'],
    action: row.action as AuditLog['action'],
    entityType: row.entity_type as string,
    entityId: row.entity_id as string,
    entityLabel: row.entity_label as string,
    reason: row.reason as string | undefined,
    changes: row.changes as AuditLog['changes'],
    createdAt: row.created_at as string,
  }
}

export function auditToRow(a: AuditLog) {
  return {
    id: a.id,
    company_id: a.companyId,
    actor_id: a.actorId,
    actor_name: a.actorName,
    actor_role: a.actorRole,
    action: a.action,
    entity_type: a.entityType,
    entity_id: a.entityId,
    entity_label: a.entityLabel,
    reason: a.reason ?? null,
    changes: a.changes,
    created_at: a.createdAt,
  }
}
