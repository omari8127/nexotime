/**
 * The Excel / CSV a payroll clerk takes away from a period: a cover sheet, the per-employee numbers (hours
 * as decimals, ready to multiply by a rate), the day-by-day detail and the approved incidencias.
 */
import type { AttendanceRecord, Incidencia, PayrollEmployeeRow, PayrollPeriod } from '@/types'
import { WEEKDAY_LABEL, weekdayFromISO } from '@/lib/attendance'
import { INCIDENCIA_META } from '@/data/incidencias'
import { formatPeriod, hoursDecimal, SUMMARY_COLUMNS, summaryRows, type PeriodRange } from '@/lib/payrollPeriod'
import { STATUS_LABEL } from '@/services/reportService'
import { buildWorkbookPayload, type WorkbookPayload } from '@/services/exportService'

export interface PayrollExportInput {
  companyName: string
  range: PeriodRange
  /** The numbers to export: the frozen ones for a closed period, the current ones for a preview. */
  rows: PayrollEmployeeRow[]
  records: AttendanceRecord[]
  incidencias: Incidencia[]
  /** Set when the period is closed (and not reopened). */
  period?: PayrollPeriod
  generatedBy: string
}

const when = (iso: string) => new Date(iso).toLocaleString('es-MX')

export function payrollFileName(range: PeriodRange): string {
  return `nexotime-nomina-${range.from}_${range.to}`
}

export function payrollSummaryPayload(input: PayrollExportInput): WorkbookPayload {
  return buildWorkbookPayload('Resumen', [...SUMMARY_COLUMNS], summaryRows(input.rows), {
    periodo: `${input.range.from} a ${input.range.to}`,
  })
}

export function buildPayrollSheets(input: PayrollExportInput): WorkbookPayload[] {
  const { range, rows, period } = input
  const ids = new Set(rows.map((r) => r.employeeId))
  const nameOf = new Map(rows.map((r) => [r.employeeId, r]))

  const cover = buildWorkbookPayload(
    'Cierre',
    [
      { key: 'concept', header: 'Concepto', width: 26 },
      { key: 'value', header: 'Detalle', width: 60 },
    ],
    [
      { concept: 'Empresa', value: input.companyName },
      { concept: 'Periodo', value: formatPeriod(range) },
      {
        concept: 'Estado',
        value: period ? 'Cerrado' : 'Vista previa (el periodo todavía no está cerrado)',
      },
      ...(period
        ? [
            { concept: 'Cerrado por', value: period.closedByName || '—' },
            { concept: 'Fecha de cierre', value: when(period.closedAt) },
            ...(period.note ? [{ concept: 'Nota del cierre', value: period.note }] : []),
          ]
        : []),
      { concept: 'Empleados', value: rows.length },
      { concept: 'Generado por', value: input.generatedBy },
      { concept: 'Generado', value: when(new Date().toISOString()) },
      {
        concept: 'Nota',
        value:
          'Las horas van en decimal (7.5 = 7 h 30 min). Las horas extra dobles son las primeras 9 h de cada semana y las triples el resto (Art. 66-68 LFT).',
      },
    ],
  )

  const detail = buildWorkbookPayload(
    'Detalle diario',
    [
      { key: 'number', header: 'Número', width: 12 },
      { key: 'employee', header: 'Empleado', width: 30 },
      { key: 'date', header: 'Fecha', width: 12 },
      { key: 'weekday', header: 'Día', width: 12 },
      { key: 'entry', header: 'Entrada', width: 10 },
      { key: 'lunchOut', header: 'Salida a comer', width: 14 },
      { key: 'lunchIn', header: 'Regreso de comer', width: 16 },
      { key: 'exit', header: 'Salida', width: 10 },
      { key: 'worked', header: 'Horas trabajadas', width: 16 },
      { key: 'lateMinutes', header: 'Minutos de retardo', width: 18 },
      { key: 'overtime', header: 'Horas extra', width: 12 },
      { key: 'status', header: 'Estado', width: 14 },
      { key: 'note', header: 'Nota', width: 40 },
    ],
    input.records
      .filter((r) => ids.has(r.employeeId) && r.date >= range.from && r.date <= range.to)
      .sort((a, b) => (nameOf.get(a.employeeId)!.name).localeCompare(nameOf.get(b.employeeId)!.name, 'es') || a.date.localeCompare(b.date))
      .map((r) => {
        const at = (type: string) => r.punches.find((p) => p.type === type)?.time ?? ''
        const emp = nameOf.get(r.employeeId)!
        return {
          number: emp.number,
          employee: emp.name,
          date: r.date,
          weekday: WEEKDAY_LABEL[weekdayFromISO(r.date)],
          entry: at('entry'),
          lunchOut: at('lunch_out'),
          lunchIn: at('lunch_in'),
          exit: at('exit'),
          worked: hoursDecimal(r.workedMinutes),
          lateMinutes: r.lateMinutes,
          overtime: hoursDecimal(r.overtimeMinutes),
          status: STATUS_LABEL[r.status],
          note: r.note ?? '',
        }
      }),
  )

  const incidencias = buildWorkbookPayload(
    'Incidencias',
    [
      { key: 'number', header: 'Número', width: 12 },
      { key: 'employee', header: 'Empleado', width: 30 },
      { key: 'type', header: 'Tipo', width: 28 },
      { key: 'from', header: 'Desde', width: 12 },
      { key: 'to', header: 'Hasta', width: 12 },
      { key: 'reason', header: 'Motivo', width: 44 },
    ],
    input.incidencias
      .filter((i) => i.status === 'approved' && ids.has(i.employeeId) && i.to >= range.from && i.from <= range.to)
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((i) => ({
        number: nameOf.get(i.employeeId)!.number,
        employee: nameOf.get(i.employeeId)!.name,
        type: INCIDENCIA_META[i.type].label,
        from: i.from,
        to: i.to,
        reason: i.reason ?? '',
      })),
  )

  return [cover, payrollSummaryPayload(input), detail, incidencias]
}
