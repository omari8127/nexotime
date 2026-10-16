import { describe, expect, it } from 'vitest'
import { buildPayrollSheets, payrollFileName } from '@/services/payrollExport'
import { toCSV } from '@/services/exportService'
import type { AttendanceRecord, Incidencia, PayrollEmployeeRow, PayrollPeriod } from '@/types'

const row = (over: Partial<PayrollEmployeeRow> = {}): PayrollEmployeeRow => ({
  employeeId: 'e1',
  number: 'EMP-001',
  name: 'Ana Pérez',
  department: 'Tienda',
  branch: 'Matriz',
  daysWorked: 2,
  absences: 1,
  lates: 0,
  earlyLeaves: 0,
  incompleteDays: 0,
  workedMinutes: 990,
  scheduledMinutes: 960,
  ordinaryMinutes: 960,
  overtimeMinutes: 30,
  overtimeDoubleMinutes: 30,
  overtimeTripleMinutes: 0,
  lunchMinutes: 0,
  vacationDays: 0,
  sickDays: 0,
  paidLeaveDays: 0,
  unpaidLeaveDays: 0,
  ...over,
})

const record = (date: string, entry: string, exit: string, workedMinutes: number): AttendanceRecord => ({
  id: date,
  companyId: 'c1',
  branchId: 'b1',
  employeeId: 'e1',
  date,
  scheduleId: 's1',
  punches: [
    { type: 'entry', time: entry, method: 'pin' },
    { type: 'exit', time: exit, method: 'pin' },
  ],
  status: 'present',
  workedMinutes,
  scheduledMinutes: 480,
  lateMinutes: 0,
  overtimeMinutes: 0,
  missingMinutes: 0,
})

const incidencia = (status: Incidencia['status'], employeeId = 'e1'): Incidencia => ({
  id: status + employeeId,
  companyId: 'c1',
  employeeId,
  type: 'vacaciones',
  from: '2026-10-07',
  to: '2026-10-08',
  status,
  requestedById: '',
  createdAt: '',
})

const base = {
  companyName: 'Mi Empresa',
  range: { from: '2026-10-05', to: '2026-10-11' },
  rows: [row()],
  records: [record('2026-10-05', '09:00', '17:30', 510), record('2026-10-06', '09:00', '17:00', 480), record('2026-09-30', '09:00', '17:00', 480)],
  incidencias: [incidencia('approved'), incidencia('pending'), incidencia('approved', 'otro')],
  generatedBy: 'Omar',
}

describe('exportar el periodo', () => {
  it('trae cuatro hojas: cierre, resumen, detalle e incidencias', () => {
    const sheets = buildPayrollSheets(base)
    expect(sheets.map((s) => s.sheetName)).toEqual(['Cierre', 'Resumen', 'Detalle diario', 'Incidencias'])
  })

  it('el resumen lleva números (horas en decimal), no texto', () => {
    const [, summary] = buildPayrollSheets(base)
    expect(summary.rows[0]).toMatchObject({ number: 'EMP-001', name: 'Ana Pérez', daysWorked: 2, absences: 1, workedHours: 16.5, overtimeHours: 0.5 })
    expect(typeof summary.rows[0].workedHours).toBe('number')
  })

  it('el detalle solo trae los días del periodo y de los empleados del resumen', () => {
    const [, , detail] = buildPayrollSheets(base)
    expect(detail.rows.map((r) => r.date)).toEqual(['2026-10-05', '2026-10-06'])
    expect(detail.rows[0]).toMatchObject({ entry: '09:00', exit: '17:30', worked: 8.5, status: 'Presente' })
  })

  it('las incidencias son solo las aprobadas de esos empleados', () => {
    const [, , , inc] = buildPayrollSheets(base)
    expect(inc.rows).toHaveLength(1)
    expect(inc.rows[0]).toMatchObject({ employee: 'Ana Pérez', type: 'Vacaciones', from: '2026-10-07' })
  })

  it('la portada dice si es vista previa o cierre', () => {
    const preview = buildPayrollSheets(base)[0].rows
    expect(preview.find((r) => r.concept === 'Estado')?.value).toMatch(/Vista previa/)
    const period: PayrollPeriod = {
      id: 'p',
      companyId: 'c1',
      from: base.range.from,
      to: base.range.to,
      note: 'Revisado',
      summary: base.rows,
      totals: { employees: 1, daysWorked: 2, absences: 1, lates: 0, workedMinutes: 990, overtimeMinutes: 30, overtimeDoubleMinutes: 30, overtimeTripleMinutes: 0 },
      closedAt: '2026-10-12T10:00:00Z',
      closedByName: 'Omar',
    }
    const cover = buildPayrollSheets({ ...base, period })[0].rows
    expect(cover.find((r) => r.concept === 'Estado')?.value).toBe('Cerrado')
    expect(cover.find((r) => r.concept === 'Cerrado por')?.value).toBe('Omar')
    expect(cover.find((r) => r.concept === 'Nota del cierre')?.value).toBe('Revisado')
  })

  it('el CSV del resumen abre bien y el nombre del archivo lleva las fechas', () => {
    const [, summary] = buildPayrollSheets(base)
    const csv = toCSV(summary).split('\r\n')
    expect(csv[0]).toContain('Horas trabajadas')
    expect(csv[1]).toContain('EMP-001')
    expect(csv[1]).toContain('16.5')
    expect(payrollFileName(base.range)).toBe('nexotime-nomina-2026-10-05_2026-10-11')
  })
})
