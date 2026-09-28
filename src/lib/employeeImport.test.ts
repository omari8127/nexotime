import { describe, expect, it } from 'vitest'
import { EMPLOYEE_IMPORT_FIELDS, parseEmployeeImportRows } from '@/lib/employeeImport'

const F = EMPLOYEE_IMPORT_FIELDS
const ctx = {
  branches: [{ id: 'b1', name: 'Sucursal Centro' }],
  schedules: [{ id: 's1', name: 'Horario general' }],
  existingEmployeeNumbers: ['EMP-001'],
  todayISO: '2026-09-28',
}

const row = (overrides: Partial<Record<(typeof F)[keyof typeof F], string>> = {}) => ({
  [F.firstName]: 'Juan',
  [F.lastNamePaternal]: 'Pérez',
  [F.lastNameMaternal]: 'López',
  [F.employeeNumber]: 'EMP-010',
  [F.position]: 'Auxiliar',
  [F.department]: 'Operaciones',
  [F.branch]: 'Sucursal Centro',
  [F.schedule]: 'Horario general',
  [F.hireDate]: '2026-01-15',
  [F.pin]: '1234',
  [F.phone]: '',
  [F.email]: '',
  [F.curp]: '',
  ...overrides,
})

const headers = Object.values(F)

describe('parseEmployeeImportRows', () => {
  it('acepta una fila válida', () => {
    const r = parseEmployeeImportRows(headers, [row()], ctx)
    expect(r.validCount).toBe(1)
    expect(r.errorCount).toBe(0)
    expect(r.rows[0].input).toMatchObject({ firstName: 'Juan', branchId: 'b1', scheduleId: 's1', hireDate: '2026-01-15' })
  })

  it('el número de fila coincide con la hoja (el encabezado es la fila 1)', () => {
    const r = parseEmployeeImportRows(headers, [row(), row({ [F.employeeNumber]: 'EMP-011' })], ctx)
    expect(r.rows.map((x) => x.rowNumber)).toEqual([2, 3])
  })

  it('exige nombre y apellido paterno', () => {
    const r = parseEmployeeImportRows(headers, [row({ [F.firstName]: '' })], ctx)
    expect(r.rows[0].errors).toContain('Falta el nombre.')
  })

  it('rechaza un número de empleado repetido en la empresa o dentro del archivo', () => {
    const dup = parseEmployeeImportRows(headers, [row({ [F.employeeNumber]: 'EMP-001' })], ctx)
    expect(dup.rows[0].errors.some((e) => e.includes('ya existe'))).toBe(true)

    const twice = parseEmployeeImportRows(headers, [row(), row()], ctx)
    expect(twice.validCount).toBe(1)
    expect(twice.rows[1].errors.some((e) => e.includes('repetido'))).toBe(true)
  })

  it('exige que la sucursal y el horario existan, sin importar acentos o mayúsculas', () => {
    expect(parseEmployeeImportRows(headers, [row({ [F.branch]: 'sucursal centro' })], ctx).validCount).toBe(1)
    const bad = parseEmployeeImportRows(headers, [row({ [F.branch]: 'Sucursal Norte' })], ctx)
    expect(bad.rows[0].errors.some((e) => e.includes('No existe la sucursal'))).toBe(true)
  })

  it('usa hoy cuando falta la fecha de ingreso, y convierte DD/MM/AAAA', () => {
    const blank = parseEmployeeImportRows(headers, [row({ [F.hireDate]: '' })], ctx)
    expect(blank.rows[0].input?.hireDate).toBe('2026-09-28')
    const dmy = parseEmployeeImportRows(headers, [row({ [F.hireDate]: '15/01/2026' })], ctx)
    expect(dmy.rows[0].input?.hireDate).toBe('2026-01-15')
  })

  it('valida el PIN (4 dígitos) y el correo', () => {
    expect(parseEmployeeImportRows(headers, [row({ [F.pin]: '12' })], ctx).rows[0].errors.length).toBeGreaterThan(0)
    expect(parseEmployeeImportRows(headers, [row({ [F.pin]: '' })], ctx).validCount).toBe(1)
    expect(parseEmployeeImportRows(headers, [row({ [F.email]: 'no-es-correo' })], ctx).rows[0].errors.length).toBeGreaterThan(0)
  })

  it('tolera encabezados con mayúsculas distintas a la plantilla', () => {
    // A real uploaded file keys its rows by its OWN header text, whatever case that is.
    const looseHeaders = headers.map((h) => h.toUpperCase())
    const values = Object.values(row())
    const looseRow = Object.fromEntries(looseHeaders.map((h, i) => [h, values[i]]))
    const r = parseEmployeeImportRows(looseHeaders, [looseRow], ctx)
    expect(r.validCount).toBe(1)
  })

  it('cada empleado válido recibe un QR único y el número de empleado activo', () => {
    const r = parseEmployeeImportRows(headers, [row(), row({ [F.employeeNumber]: 'EMP-011' })], ctx)
    const qrs = r.rows.map((x) => x.input?.identifications.find((i) => i.method === 'qr')?.value)
    expect(new Set(qrs).size).toBe(2)
    expect(r.rows[0].input?.identifications.find((i) => i.method === 'employee_number')?.enabled).toBe(true)
    expect(r.rows[0].input?.identifications.find((i) => i.method === 'face')?.enabled).toBe(false)
  })
})
