import type {
  AttendanceRecord,
  AttendanceSettings,
  Employee,
  Incidencia,
  ReportType,
  Schedule,
} from '@/types'
import {
  PUNCH_TYPE_LABEL,
  calculateWeeklyHours,
  getRecordFlags,
  scheduleDayFor,
  weekdayFromISO,
} from '@/lib/attendance'
import { INCIDENCIA_META, INCIDENCIA_STATUS_META, findIncidencia } from '@/data/incidencias'
import { formatDuration, formatTime12, toMinutes } from '@/lib/utils'
import { weekDates } from '@/lib/week'
import type { SheetColumn } from '@/services/exportService'

const STATUS_LABEL: Record<AttendanceRecord['status'], string> = {
  present: 'Presente',
  late: 'Retardo',
  absent: 'Falta',
  incomplete: 'Incompleto',
  overtime: 'Hora extra',
  rest: 'Descanso',
}

export const REPORT_TYPES: Array<{ value: ReportType; label: string; description: string }> = [
  { value: 'attendance_general', label: 'Asistencia general', description: 'Todos los registros con entradas, salidas y estado.' },
  { value: 'worked_hours', label: 'Horas trabajadas', description: 'Horas efectivas vs. programadas por empleado.' },
  { value: 'late_arrivals', label: 'Retardos', description: 'Solo días con llegada tarde y minutos de retardo.' },
  { value: 'absences', label: 'Faltas', description: 'Días laborables sin registro ni incidencia justificada.' },
  { value: 'overtime', label: 'Horas extra', description: 'Tiempo trabajado por encima del horario.' },
  {
    value: 'employee_summary',
    label: 'Resumen por empleado (nómina)',
    description: 'Días trabajados, faltas, retardos, horas, extras, salidas anticipadas y comida por persona.',
  },
  { value: 'incidencias', label: 'Incidencias', description: 'Incidencias del periodo con su estado de aprobación.' },
  { value: 'branch_summary', label: 'Resumen por sucursal', description: 'Totales del periodo agrupados por sucursal.' },
  {
    value: 'legal_evidence',
    label: 'Evidencia legal (LFT)',
    description: 'Horas ordinarias, dobles y triples por semana — evidencia para inspección de la STPS (Art. 66-68 LFT).',
  },
]

export interface ReportContext {
  records: AttendanceRecord[]
  employees: Employee[]
  schedules: Schedule[]
  branches: { id: string; name: string }[]
  from: string
  to: string
  /** Needed for salida anticipada / comida excedida. */
  settings?: AttendanceSettings
  /** Needed to know which days were justified (vacaciones, incapacidad…). */
  incidencias?: Incidencia[]
  /** The date treated as "today": today and later days are never faltas. */
  todayISO?: string
}

export interface ReportResult {
  columns: SheetColumn[]
  rows: Array<Record<string, string | number>>
  title: string
}

function punch(r: AttendanceRecord, type: keyof typeof PUNCH_TYPE_LABEL) {
  return r.punches.find((p) => p.type === type)?.time
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Scheduled working days in [from, to] (up to yesterday) on which the employee
 * has no punches and no approved justifying incidencia: those are faltas.
 * Computed from the schedule, so days with no record at all count too.
 */
function missingDays(
  emp: Employee,
  schedule: Schedule | undefined,
  records: AttendanceRecord[],
  ctx: ReportContext,
): string[] {
  if (!schedule) return []
  const lastClosed = ctx.todayISO ? addDays(ctx.todayISO, -1) : ctx.to
  const end = ctx.to < lastClosed ? ctx.to : lastClosed
  const withPunches = new Set(records.filter((r) => r.punches.length > 0).map((r) => r.date))
  const out: string[] = []
  for (let d = ctx.from; d <= end; d = addDays(d, 1)) {
    if (d < emp.hireDate) continue
    if (!scheduleDayFor(schedule, weekdayFromISO(d))?.enabled) continue
    if (withPunches.has(d)) continue
    if (ctx.incidencias && findIncidencia(ctx.incidencias, emp.id, d)) continue
    out.push(d)
  }
  return out
}

export function buildReport(type: ReportType, ctx: ReportContext): ReportResult {
  const empById = new Map(ctx.employees.map((e) => [e.id, e]))
  const branchById = new Map(ctx.branches.map((b) => [b.id, b.name]))
  const inRange = ctx.records
    .filter((r) => r.date >= ctx.from && r.date <= ctx.to)
    .filter((r) => empById.has(r.employeeId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId))

  const label = REPORT_TYPES.find((t) => t.value === type)?.label ?? 'Reporte'

  if (type === 'employee_summary') {
    const rows = [...ctx.employees]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((e) => {
        const schedule = ctx.schedules.find((s) => s.id === e.scheduleId)
        const recs = inRange.filter((r) => r.employeeId === e.id)
        let worked = 0
        let scheduled = 0
        let overtime = 0
        let late = 0
        let early = 0
        let lunch = 0
        let days = 0
        for (const r of recs) {
          worked += r.workedMinutes
          scheduled += r.scheduledMinutes
          overtime += r.overtimeMinutes
          if (r.status === 'late') late += 1
          if (r.punches.some((p) => p.type === 'entry')) days += 1
          if (ctx.settings) {
            const f = getRecordFlags(r, schedule, ctx.settings, ctx.todayISO ?? ctx.to)
            if (f.earlyLeaveMinutes > 0) early += 1
            lunch += f.lunchMinutes
          }
        }
        const incCount = (ctx.incidencias ?? []).filter(
          (i) => i.employeeId === e.id && i.status === 'approved' && i.to >= ctx.from && i.from <= ctx.to,
        ).length
        return {
          employee: e.fullName,
          number: e.employeeNumber,
          department: e.department,
          branch: branchById.get(e.branchId) ?? '—',
          days,
          absent: missingDays(e, schedule, recs, ctx).length,
          late,
          early,
          worked: formatDuration(worked),
          scheduled: formatDuration(scheduled),
          overtime: formatDuration(overtime),
          lunch: formatDuration(lunch),
          incidencias: incCount,
        }
      })
    return {
      title: label,
      columns: [
        { key: 'employee', header: 'Empleado', width: 28 },
        { key: 'number', header: 'Número', width: 12 },
        { key: 'department', header: 'Departamento', width: 20 },
        { key: 'branch', header: 'Sucursal', width: 20 },
        { key: 'days', header: 'Días trabajados', width: 15 },
        { key: 'absent', header: 'Faltas', width: 10 },
        { key: 'late', header: 'Retardos', width: 10 },
        { key: 'early', header: 'Salidas anticipadas', width: 18 },
        { key: 'worked', header: 'Horas trabajadas', width: 16 },
        { key: 'scheduled', header: 'Horas programadas', width: 17 },
        { key: 'overtime', header: 'Horas extra', width: 13 },
        { key: 'lunch', header: 'Tiempo de comida', width: 16 },
        { key: 'incidencias', header: 'Incidencias aprobadas', width: 20 },
      ],
      rows,
    }
  }

  if (type === 'incidencias') {
    const rows = (ctx.incidencias ?? [])
      .filter((i) => empById.has(i.employeeId) && i.to >= ctx.from && i.from <= ctx.to)
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((i) => {
        const e = empById.get(i.employeeId)!
        return {
          employee: e.fullName,
          number: e.employeeNumber,
          department: e.department,
          type: INCIDENCIA_META[i.type].label,
          from: i.from,
          to: i.to,
          status: INCIDENCIA_STATUS_META[i.status].label,
          reason: i.reason ?? '',
          reviewer: i.reviewedByName ?? '',
        }
      })
    return {
      title: label,
      columns: [
        { key: 'employee', header: 'Empleado', width: 28 },
        { key: 'number', header: 'Número', width: 12 },
        { key: 'department', header: 'Departamento', width: 20 },
        { key: 'type', header: 'Tipo', width: 26 },
        { key: 'from', header: 'Desde', width: 12 },
        { key: 'to', header: 'Hasta', width: 12 },
        { key: 'status', header: 'Estado', width: 12 },
        { key: 'reason', header: 'Descripción', width: 40 },
        { key: 'reviewer', header: 'Revisó', width: 22 },
      ],
      rows,
    }
  }

  if (type === 'branch_summary') {
    const groups = new Map<string, { worked: number; scheduled: number; overtime: number; late: number; absent: number; people: Set<string> }>()
    for (const r of inRange) {
      const g = groups.get(r.branchId) ?? { worked: 0, scheduled: 0, overtime: 0, late: 0, absent: 0, people: new Set<string>() }
      g.worked += r.workedMinutes
      g.scheduled += r.scheduledMinutes
      g.overtime += r.overtimeMinutes
      g.people.add(r.employeeId)
      if (r.status === 'late') g.late += 1
      if (r.status === 'absent') g.absent += 1
      groups.set(r.branchId, g)
    }
    return {
      title: label,
      columns: [
        { key: 'branch', header: 'Sucursal', width: 24 },
        { key: 'people', header: 'Empleados', width: 12 },
        { key: 'worked', header: 'Horas trabajadas', width: 16 },
        { key: 'scheduled', header: 'Horas programadas', width: 16 },
        { key: 'overtime', header: 'Horas extra', width: 14 },
        { key: 'late', header: 'Retardos', width: 10 },
        { key: 'absent', header: 'Faltas', width: 10 },
      ],
      rows: [...groups.entries()].map(([branchId, g]) => ({
        branch: branchById.get(branchId) ?? '—',
        people: g.people.size,
        worked: formatDuration(g.worked),
        scheduled: formatDuration(g.scheduled),
        overtime: formatDuration(g.overtime),
        late: g.late,
        absent: g.absent,
      })),
    }
  }

  if (type === 'legal_evidence') {
    // Group by employee + Monday of the ISO week so overtime is split into
    // "dobles"/"triples" the way Art. 66-68 LFT actually accrues it: per week.
    const groups = new Map<string, { weekStart: string; empId: string; records: AttendanceRecord[] }>()
    for (const r of inRange) {
      const weekStart = weekDates(r.date)[0]
      const key = `${r.employeeId}__${weekStart}`
      const g = groups.get(key) ?? { weekStart, empId: r.employeeId, records: [] }
      g.records.push(r)
      groups.set(key, g)
    }

    const rows = [...groups.values()]
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.empId.localeCompare(b.empId))
      .map((g) => {
        const e = empById.get(g.empId)!
        const schedule = ctx.schedules.find((s) => s.id === e.scheduleId)
        const weekly = calculateWeeklyHours(g.records, schedule?.weeklyTargetHours ?? 40)
        const weekEnd = weekDates(g.weekStart)[6]
        return {
          employee: e.fullName,
          number: e.employeeNumber,
          branch: branchById.get(e.branchId) ?? '—',
          week: `${g.weekStart} a ${weekEnd}`,
          ordinary: formatDuration(weekly.ordinaryMinutes),
          double: formatDuration(weekly.overtimeDoubleMinutes),
          triple: formatDuration(weekly.overtimeTripleMinutes),
          late: weekly.lateCount,
          absent: weekly.absenceCount,
          compliance: weekly.exceedsLegalLimit ? 'Revisar' : 'En regla',
        }
      })

    return {
      title: label,
      columns: [
        { key: 'employee', header: 'Empleado', width: 26 },
        { key: 'number', header: 'Número', width: 12 },
        { key: 'branch', header: 'Sucursal', width: 18 },
        { key: 'week', header: 'Semana (Art. 66 LFT)', width: 20 },
        { key: 'ordinary', header: 'Horas ordinarias', width: 16 },
        { key: 'double', header: 'Extra dobles (200%)', width: 16 },
        { key: 'triple', header: 'Extra triples (300%)', width: 16 },
        { key: 'late', header: 'Retardos', width: 10 },
        { key: 'absent', header: 'Faltas', width: 10 },
        { key: 'compliance', header: 'Cumplimiento', width: 14 },
      ],
      rows,
    }
  }

  if (type === 'absences') {
    const rows = ctx.employees
      .flatMap((e) => {
        const schedule = ctx.schedules.find((s) => s.id === e.scheduleId)
        const recs = inRange.filter((r) => r.employeeId === e.id)
        return missingDays(e, schedule, recs, ctx).map((date) => {
          const day = schedule ? scheduleDayFor(schedule, weekdayFromISO(date)) : undefined
          const minutes = day ? toMinutes(day.exit) - toMinutes(day.entry) : 0
          return {
            employee: e.fullName,
            number: e.employeeNumber,
            department: e.department,
            branch: branchById.get(e.branchId) ?? '—',
            date,
            scheduled: day ? `${formatTime12(day.entry)} – ${formatTime12(day.exit)}` : '—',
            hours: formatDuration(minutes),
          }
        })
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee))
    return {
      title: label,
      columns: [
        { key: 'employee', header: 'Empleado', width: 28 },
        { key: 'number', header: 'Número', width: 12 },
        { key: 'department', header: 'Departamento', width: 20 },
        { key: 'branch', header: 'Sucursal', width: 20 },
        { key: 'date', header: 'Fecha', width: 12 },
        { key: 'scheduled', header: 'Jornada programada', width: 24 },
        { key: 'hours', header: 'Horas', width: 10 },
      ],
      rows,
    }
  }

  let filtered = inRange
  if (type === 'late_arrivals') filtered = inRange.filter((r) => r.status === 'late')
  if (type === 'overtime') filtered = inRange.filter((r) => r.overtimeMinutes > 0)

  const columns: SheetColumn[] = [
    { key: 'employee', header: 'Empleado', width: 26 },
    { key: 'number', header: 'Número empleado', width: 14 },
    { key: 'department', header: 'Departamento', width: 18 },
    { key: 'date', header: 'Fecha', width: 12 },
    { key: 'entry', header: 'Entrada', width: 10 },
    { key: 'lunchOut', header: 'Salida comida', width: 12 },
    { key: 'lunchIn', header: 'Regreso comida', width: 12 },
    { key: 'exit', header: 'Salida', width: 10 },
    { key: 'lunchTime', header: 'Tiempo de comida', width: 15 },
    { key: 'worked', header: 'Horas trabajadas', width: 14 },
    { key: 'scheduled', header: 'Horas programadas', width: 16 },
    { key: 'overtime', header: 'Horas extra', width: 12 },
    { key: 'early', header: 'Salida anticipada', width: 16 },
    { key: 'status', header: 'Estado', width: 12 },
  ]

  if (type === 'late_arrivals') {
    columns.splice(9, 0, { key: 'late', header: 'Minutos de retardo', width: 16 })
  }

  return {
    title: label,
    columns,
    rows: filtered.map((r) => {
      const e = empById.get(r.employeeId)!
      const flags = ctx.settings
        ? getRecordFlags(
            r,
            ctx.schedules.find((s) => s.id === r.scheduleId),
            ctx.settings,
            ctx.todayISO ?? ctx.to,
          )
        : undefined
      return {
        employee: e.fullName,
        number: e.employeeNumber,
        department: e.department,
        date: r.date,
        entry: punch(r, 'entry') ? formatTime12(punch(r, 'entry')) : '—',
        lunchOut: punch(r, 'lunch_out') ? formatTime12(punch(r, 'lunch_out')) : '—',
        lunchIn: punch(r, 'lunch_in') ? formatTime12(punch(r, 'lunch_in')) : '—',
        exit: punch(r, 'exit') ? formatTime12(punch(r, 'exit')) : '—',
        lunchTime: flags && flags.lunchMinutes ? formatDuration(flags.lunchMinutes) : '—',
        worked: formatDuration(r.workedMinutes),
        scheduled: formatDuration(r.scheduledMinutes),
        overtime: r.overtimeMinutes ? formatDuration(r.overtimeMinutes) : '—',
        early: flags && flags.earlyLeaveMinutes ? `${flags.earlyLeaveMinutes} min` : '—',
        late: r.lateMinutes ? `${r.lateMinutes} min` : '—',
        status: STATUS_LABEL[r.status],
      }
    }),
  }
}

export { STATUS_LABEL }
