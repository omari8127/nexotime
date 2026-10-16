/**
 * Cierre de periodo de nómina: las cuentas del periodo en números (no texto), las revisiones previas al
 * cierre y la comparación contra lo ya cerrado. Todo es puro: no toca la tienda ni la red.
 *
 * Reglas que se aplican igual que en los reportes:
 *  - falta = día laborable pasado sin checadas y sin incidencia justificante aprobada (`missingDays`);
 *  - las horas extra se reparten por semana (lunes a domingo) en "dobles" y "triples" (Art. 66-68 LFT).
 *    Un periodo que corta una semana (quincena) solo ve la parte de esa semana que cae dentro de él.
 */
import type {
  AttendanceRecord,
  AttendanceSettings,
  CorrectionRequest,
  Employee,
  Incidencia,
  PayrollEmployeeRow,
  PayrollPeriod,
  PayrollTotals,
  Schedule,
} from '@/types'
import { getRecordFlags, scheduleDayFor, splitOvertimeLFT, weekdayFromISO } from '@/lib/attendance'
import { findIncidencia } from '@/data/incidencias'
import { missingDays } from '@/services/reportService'

export interface PeriodRange {
  from: string
  to: string
}

export type PeriodKind = 'weekly' | 'biweekly' | 'monthly'

export const PERIOD_KINDS: Array<{ value: PeriodKind; label: string }> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
]

/** Longest period the database accepts (kept in sync with migration 016). */
export const MAX_PERIOD_DAYS = 62

/* -------------------------------------------------------------------------- */
/*  Fechas (siempre en calendario, sin horas: nada se corre por zona horaria)   */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addDays(date: string, delta: number): string {
  return iso(utc(date) + delta * DAY_MS)
}

export function daysInRange(range: PeriodRange): number {
  return Math.round((utc(range.to) - utc(range.from)) / DAY_MS) + 1
}

export function mondayOf(date: string): string {
  const dow = new Date(utc(date)).getUTCDay() // 0 = domingo
  return addDays(date, -((dow + 6) % 7))
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return iso(Date.UTC(y, m, 0))
}

/** The period of this kind that contains `date`. */
export function periodFor(kind: PeriodKind, date: string): PeriodRange {
  if (kind === 'weekly') {
    const from = mondayOf(date)
    return { from, to: addDays(from, 6) }
  }
  const monthStart = `${date.slice(0, 7)}-01`
  if (kind === 'monthly') return { from: monthStart, to: endOfMonth(date) }
  return Number(date.slice(8, 10)) <= 15
    ? { from: monthStart, to: `${date.slice(0, 7)}-15` }
    : { from: `${date.slice(0, 7)}-16`, to: endOfMonth(date) }
}

export const previousPeriod = (kind: PeriodKind, range: PeriodRange): PeriodRange =>
  periodFor(kind, addDays(range.from, -1))

export const nextPeriod = (kind: PeriodKind, range: PeriodRange): PeriodRange =>
  periodFor(kind, addDays(range.to, 1))

/** The most recent period that is completely over (the one people usually close). */
export const lastFinishedPeriod = (kind: PeriodKind, todayISO: string): PeriodRange =>
  previousPeriod(kind, periodFor(kind, todayISO))

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "1 al 15 de octubre de 2026", "28 de septiembre al 4 de octubre de 2026". */
export function formatPeriod(range: PeriodRange): string {
  const [fy, fm, fd] = range.from.split('-').map(Number)
  const [ty, tm, td] = range.to.split('-').map(Number)
  if (range.from === range.to) return `${fd} de ${MONTHS[fm - 1]} de ${fy}`
  if (fy === ty && fm === tm) return `${fd} al ${td} de ${MONTHS[tm - 1]} de ${ty}`
  if (fy === ty) return `${fd} de ${MONTHS[fm - 1]} al ${td} de ${MONTHS[tm - 1]} de ${ty}`
  return `${fd} de ${MONTHS[fm - 1]} de ${fy} al ${td} de ${MONTHS[tm - 1]} de ${ty}`
}

export const rangesOverlap = (a: PeriodRange, b: PeriodRange): boolean => a.from <= b.to && b.from <= a.to

/* -------------------------------------------------------------------------- */
/*  Cuentas del periodo                                                         */
/* -------------------------------------------------------------------------- */

export interface SummaryInput {
  range: PeriodRange
  employees: Employee[]
  records: AttendanceRecord[]
  schedules: Schedule[]
  incidencias: Incidencia[]
  settings: AttendanceSettings
  branches: Array<{ id: string; name: string }>
  /** The date treated as "today": today and later days are never faltas nor incomplete. */
  todayISO: string
}

export function summarizePeriod(input: SummaryInput): { rows: PayrollEmployeeRow[]; totals: PayrollTotals } {
  const { range, employees, schedules, incidencias, settings, branches, todayISO } = input
  const branchName = new Map(branches.map((b) => [b.id, b.name]))
  const inRange = input.records.filter((r) => r.date >= range.from && r.date <= range.to)
  const byEmployee = new Map<string, AttendanceRecord[]>()
  for (const r of inRange) byEmployee.set(r.employeeId, [...(byEmployee.get(r.employeeId) ?? []), r])

  const ctx = {
    records: inRange,
    employees,
    schedules,
    branches,
    from: range.from,
    to: range.to,
    settings,
    incidencias,
    todayISO,
  }
  const lastDay = addDays(todayISO, -1) < range.to ? addDays(todayISO, -1) : range.to

  const rows: PayrollEmployeeRow[] = []
  for (const e of [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))) {
    const recs = byEmployee.get(e.id) ?? []
    if (e.hireDate > range.to) continue
    if (e.status !== 'active' && recs.length === 0) continue
    const schedule = schedules.find((s) => s.id === e.scheduleId)

    const row: PayrollEmployeeRow = {
      employeeId: e.id,
      number: e.employeeNumber,
      name: e.fullName,
      department: e.department,
      branch: branchName.get(e.branchId) ?? '—',
      daysWorked: 0,
      absences: missingDays(e, schedule, recs, ctx).length,
      lates: 0,
      earlyLeaves: 0,
      incompleteDays: 0,
      workedMinutes: 0,
      scheduledMinutes: 0,
      ordinaryMinutes: 0,
      overtimeMinutes: 0,
      overtimeDoubleMinutes: 0,
      overtimeTripleMinutes: 0,
      lunchMinutes: 0,
      vacationDays: 0,
      sickDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
    }

    const overtimeByWeek = new Map<string, number>()
    for (const r of recs) {
      row.workedMinutes += r.workedMinutes
      row.scheduledMinutes += r.scheduledMinutes
      row.overtimeMinutes += r.overtimeMinutes
      if (r.status === 'late') row.lates += 1
      if (r.punches.some((p) => p.type === 'entry')) row.daysWorked += 1
      const flags = getRecordFlags(r, schedule, settings, todayISO)
      if (flags.earlyLeaveMinutes > 0) row.earlyLeaves += 1
      if (flags.missingExit) row.incompleteDays += 1
      row.lunchMinutes += flags.lunchMinutes
      if (r.overtimeMinutes > 0) {
        const week = mondayOf(r.date)
        overtimeByWeek.set(week, (overtimeByWeek.get(week) ?? 0) + r.overtimeMinutes)
      }
    }
    for (const minutes of overtimeByWeek.values()) {
      const split = splitOvertimeLFT(minutes)
      row.overtimeDoubleMinutes += split.double
      row.overtimeTripleMinutes += split.triple
    }
    row.ordinaryMinutes = Math.max(0, row.workedMinutes - row.overtimeMinutes)

    // Justified days: scheduled working days with no punches that an approved incidencia covers.
    if (schedule) {
      const withPunches = new Set(recs.filter((r) => r.punches.length > 0).map((r) => r.date))
      for (let d = range.from < e.hireDate ? e.hireDate : range.from; d <= lastDay; d = addDays(d, 1)) {
        if (withPunches.has(d) || !scheduleDayFor(schedule, weekdayFromISO(d))?.enabled) continue
        const inc = findIncidencia(incidencias, e.id, d)
        if (!inc) continue
        if (inc.type === 'vacaciones') row.vacationDays += 1
        else if (inc.type === 'incapacidad') row.sickDays += 1
        else if (inc.type === 'permiso_con_goce') row.paidLeaveDays += 1
        else row.unpaidLeaveDays += 1
      }
    }
    rows.push(row)
  }
  return { rows, totals: totalsOf(rows) }
}

export function totalsOf(rows: PayrollEmployeeRow[]): PayrollTotals {
  const totals: PayrollTotals = {
    employees: rows.length,
    daysWorked: 0,
    absences: 0,
    lates: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    overtimeDoubleMinutes: 0,
    overtimeTripleMinutes: 0,
  }
  for (const r of rows) {
    totals.daysWorked += r.daysWorked
    totals.absences += r.absences
    totals.lates += r.lates
    totals.workedMinutes += r.workedMinutes
    totals.overtimeMinutes += r.overtimeMinutes
    totals.overtimeDoubleMinutes += r.overtimeDoubleMinutes
    totals.overtimeTripleMinutes += r.overtimeTripleMinutes
  }
  return totals
}

/* -------------------------------------------------------------------------- */
/*  ¿Se puede cerrar?                                                           */
/* -------------------------------------------------------------------------- */

export interface Readiness {
  /** Impiden cerrar hasta resolverse. */
  blockers: string[]
  /** Se muestran; quien cierra decide (por ejemplo, un día sin salida). */
  warnings: string[]
}

export interface ReadinessInput {
  range: PeriodRange
  todayISO: string
  rows: PayrollEmployeeRow[]
  incidencias: Incidencia[]
  corrections: CorrectionRequest[]
  employees: Employee[]
  /** Periods already closed (reopened ones are ignored). */
  periods: PayrollPeriod[]
  /** Punches of this device still waiting to upload. */
  pendingSync: number
  /** Sin internet no se cierra: el cierre se guarda directo en el servidor. */
  online: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function activePeriods(periods: PayrollPeriod[]): PayrollPeriod[] {
  return periods.filter((p) => !p.reopenedAt)
}

/** The closed period (not reopened) that covers this date, if any. */
export function closedPeriodOn(periods: PayrollPeriod[], date: string): PayrollPeriod | undefined {
  return activePeriods(periods).find((p) => date >= p.from && date <= p.to)
}

export function closedPeriodMessage(period: PayrollPeriod): string {
  return `Ese día pertenece al periodo cerrado del ${formatPeriod(period)}. Un administrador puede reabrirlo desde Cierre de periodo.`
}

export function checkReadiness(input: ReadinessInput): Readiness {
  const { range, todayISO } = input
  const blockers: string[] = []
  const warnings: string[] = []

  if (range.to >= todayISO) {
    blockers.push('El periodo todavía no termina. Solo se cierran periodos que ya pasaron completos.')
  }
  if (daysInRange(range) > MAX_PERIOD_DAYS) {
    blockers.push(`El periodo no puede durar más de ${MAX_PERIOD_DAYS} días.`)
  }
  const clash = activePeriods(input.periods).find((p) => rangesOverlap(p, range))
  if (clash) blockers.push(`Ya hay un periodo cerrado que se cruza con este (${formatPeriod(clash)}).`)
  if (!input.online) blockers.push('Sin internet. El cierre se guarda directo en el servidor: conéctate e inténtalo otra vez.')
  if (input.pendingSync > 0) {
    blockers.push(
      `Este equipo tiene ${plural(input.pendingSync, 'movimiento', 'movimientos')} sin enviar al servidor. Espera a que se sincronicen antes de cerrar.`,
    )
  }

  const empIds = new Set(input.employees.map((e) => e.id))
  const pendingInc = input.incidencias.filter(
    (i) => i.status === 'pending' && empIds.has(i.employeeId) && i.to >= range.from && i.from <= range.to,
  ).length
  if (pendingInc > 0) {
    blockers.push(`Hay ${plural(pendingInc, 'incidencia pendiente', 'incidencias pendientes')} de aprobar en este periodo (vacaciones, permisos…).`)
  }
  const pendingCorr = input.corrections.filter(
    (c) => c.status === 'pending' && empIds.has(c.employeeId) && c.date >= range.from && c.date <= range.to,
  ).length
  if (pendingCorr > 0) {
    blockers.push(`Hay ${plural(pendingCorr, 'solicitud de corrección pendiente', 'solicitudes de corrección pendientes')} en este periodo.`)
  }

  const incomplete = input.rows.filter((r) => r.incompleteDays > 0)
  if (incomplete.length > 0) {
    const days = incomplete.reduce((a, r) => a + r.incompleteDays, 0)
    warnings.push(
      `${plural(days, 'día con entrada pero sin salida', 'días con entrada pero sin salida')} (${incomplete
        .slice(0, 3)
        .map((r) => r.name)
        .join(', ')}${incomplete.length > 3 ? '…' : ''}). Sus horas quedan incompletas: corrígelos antes de cerrar.`,
    )
  }
  if (input.rows.length === 0) warnings.push('No hay empleados con movimientos en este periodo.')
  return { blockers, warnings }
}

/* -------------------------------------------------------------------------- */
/*  Comparar lo cerrado con los datos de hoy                                    */
/* -------------------------------------------------------------------------- */

const COMPARED: Array<keyof PayrollEmployeeRow> = [
  'daysWorked',
  'absences',
  'lates',
  'earlyLeaves',
  'workedMinutes',
  'overtimeMinutes',
  'overtimeDoubleMinutes',
  'overtimeTripleMinutes',
  'vacationDays',
  'sickDays',
  'paidLeaveDays',
  'unpaidLeaveDays',
]

/** Names of the employees whose numbers today differ from the frozen ones (empty = identical). */
export function changedSince(saved: PayrollEmployeeRow[], current: PayrollEmployeeRow[]): string[] {
  const now = new Map(current.map((r) => [r.employeeId, r]))
  const seen = new Set<string>()
  const changed: string[] = []
  for (const old of saved) {
    seen.add(old.employeeId)
    const cur = now.get(old.employeeId)
    if (!cur || COMPARED.some((k) => old[k] !== cur[k])) changed.push(old.name)
  }
  for (const cur of current) if (!seen.has(cur.employeeId)) changed.push(cur.name)
  return changed
}

/* -------------------------------------------------------------------------- */
/*  Para Excel / CSV                                                            */
/* -------------------------------------------------------------------------- */

/** Horas en decimal con dos cifras (7.5 = 7 h 30 min): lo que espera una hoja de nómina. */
export const hoursDecimal = (minutes: number): number => Math.round((minutes / 60) * 100) / 100

export const SUMMARY_COLUMNS = [
  { key: 'number', header: 'Número', width: 12 },
  { key: 'name', header: 'Empleado', width: 30 },
  { key: 'department', header: 'Departamento', width: 20 },
  { key: 'branch', header: 'Sucursal', width: 20 },
  { key: 'daysWorked', header: 'Días trabajados', width: 15 },
  { key: 'absences', header: 'Faltas', width: 9 },
  { key: 'lates', header: 'Retardos', width: 10 },
  { key: 'earlyLeaves', header: 'Salidas anticipadas', width: 18 },
  { key: 'vacationDays', header: 'Días de vacaciones', width: 18 },
  { key: 'sickDays', header: 'Días de incapacidad', width: 19 },
  { key: 'paidLeaveDays', header: 'Permiso con goce (días)', width: 22 },
  { key: 'unpaidLeaveDays', header: 'Permiso sin goce (días)', width: 22 },
  { key: 'workedHours', header: 'Horas trabajadas', width: 16 },
  { key: 'scheduledHours', header: 'Horas programadas', width: 17 },
  { key: 'ordinaryHours', header: 'Horas ordinarias', width: 16 },
  { key: 'overtimeHours', header: 'Horas extra', width: 12 },
  { key: 'overtimeDoubleHours', header: 'Extra dobles (hasta 9 h/sem)', width: 26 },
  { key: 'overtimeTripleHours', header: 'Extra triples (más de 9 h/sem)', width: 28 },
  { key: 'lunchHours', header: 'Horas de comida', width: 15 },
] as const

export function summaryRows(rows: PayrollEmployeeRow[]): Array<Record<string, string | number>> {
  return rows.map((r) => ({
    number: r.number,
    name: r.name,
    department: r.department,
    branch: r.branch,
    daysWorked: r.daysWorked,
    absences: r.absences,
    lates: r.lates,
    earlyLeaves: r.earlyLeaves,
    vacationDays: r.vacationDays,
    sickDays: r.sickDays,
    paidLeaveDays: r.paidLeaveDays,
    unpaidLeaveDays: r.unpaidLeaveDays,
    workedHours: hoursDecimal(r.workedMinutes),
    scheduledHours: hoursDecimal(r.scheduledMinutes),
    ordinaryHours: hoursDecimal(r.ordinaryMinutes),
    overtimeHours: hoursDecimal(r.overtimeMinutes),
    overtimeDoubleHours: hoursDecimal(r.overtimeDoubleMinutes),
    overtimeTripleHours: hoursDecimal(r.overtimeTripleMinutes),
    lunchHours: hoursDecimal(r.lunchMinutes),
  }))
}
