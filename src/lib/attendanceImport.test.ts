import { describe, expect, it } from 'vitest'
import { CORRECTION_FIELDS, buildCorrectionTemplate, parseCorrectionRows } from '@/lib/attendanceImport'
import type { AttendanceRecord, Employee } from '@/types'

const F = CORRECTION_FIELDS
const employee = { id: 'e1', employeeNumber: 'EMP-001', fullName: 'Ana Ruíz' } as unknown as Employee
const record = {
  id: 'r1',
  employeeId: 'e1',
  date: '2026-09-01',
  punches: [
    { type: 'entry', time: '09:05', method: 'qr' },
    { type: 'exit', time: '18:00', method: 'qr' },
  ],
} as unknown as AttendanceRecord

const headers = Object.values(F)
const row = (overrides: Partial<Record<(typeof F)[keyof typeof F], string>> = {}) => ({
  [F.employeeNumber]: 'EMP-001',
  [F.employee]: 'Ana Ruíz',
  [F.date]: '2026-09-01',
  [F.entry]: '',
  [F.lunchOut]: '',
  [F.lunchIn]: '',
  [F.exit]: '',
  [F.reason]: '',
  ...overrides,
})

describe('buildCorrectionTemplate', () => {
  it('trae una fila por empleado y día, con las horas ya registradas', () => {
    const [sheet] = buildCorrectionTemplate({ employees: [employee], attendance: [record], from: '2026-09-01', to: '2026-09-02' })
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0][F.entry]).toBe('09:05')
    expect(sheet.rows[0][F.exit]).toBe('18:00')
    expect(sheet.rows[1][F.entry]).toBe('') // 2026-09-02 has no record
  })
})

describe('parseCorrectionRows', () => {
  it('una celda vacía no genera cambio (no se toca esa hora)', () => {
    const r = parseCorrectionRows(headers, [row()], { employees: [employee], attendance: [record] })
    expect(r.changeCount).toBe(0)
  })

  it('detecta solo las horas que en verdad cambiaron', () => {
    const r = parseCorrectionRows(headers, [row({ [F.entry]: '09:00', [F.exit]: '18:00' })], { employees: [employee], attendance: [record] })
    expect(r.changeCount).toBe(1) // exit is unchanged (18:00), only entry (09:05→09:00) differs
    expect(r.rows[0].changes[0]).toMatchObject({ employeeId: 'e1', type: 'entry', time: '09:00' })
  })

  it('crea una checada nueva cuando el día no tenía ninguna', () => {
    const r = parseCorrectionRows(headers, [row({ [F.date]: '2026-09-05', [F.entry]: '08:30' })], { employees: [employee], attendance: [record] })
    expect(r.changeCount).toBe(1)
    expect(r.rows[0].changes[0]).toMatchObject({ date: '2026-09-05', type: 'entry', time: '08:30' })
  })

  it('usa un motivo por defecto cuando no se escribe uno', () => {
    const r = parseCorrectionRows(headers, [row({ [F.entry]: '09:00' })], { employees: [employee], attendance: [record] })
    expect(r.rows[0].changes[0].reason).toBe('Corrección por importación')
  })

  it('rechaza un número de empleado desconocido y una fecha inválida', () => {
    expect(parseCorrectionRows(headers, [row({ [F.employeeNumber]: 'EMP-999' })], { employees: [employee], attendance: [record] }).rows[0].errors[0]).toMatch(/No existe/)
    expect(parseCorrectionRows(headers, [row({ [F.date]: '31/02/2026' })], { employees: [employee], attendance: [record] }).rows[0].errors[0]).toMatch(/no es v[aá]lida/)
  })

  it('rechaza una hora mal escrita y admite un valor serial de Excel', () => {
    const bad = parseCorrectionRows(headers, [row({ [F.entry]: '25:99' })], { employees: [employee], attendance: [record] })
    expect(bad.rows[0].errors.length).toBeGreaterThan(0)
    const serial = parseCorrectionRows(headers, [row({ [F.entry]: '0.375' })], { employees: [employee], attendance: [record] }) // 0.375 día = 09:00
    expect(serial.rows[0].changes[0]).toMatchObject({ type: 'entry', time: '09:00' })
  })
})
