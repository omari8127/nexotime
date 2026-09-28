/**
 * Bulk employee import: builds the downloadable template and validates a
 * spreadsheet the customer filled in before any employee is actually created.
 */
import { generateQrValue } from '@/lib/credentials'
import { normalizeDate, normalizeKey } from '@/lib/importNormalize'
import type { SheetColumn, WorkbookPayload } from '@/services/exportService'
import { buildWorkbookPayload } from '@/services/exportService'
import type { NewEmployeeInput } from '@/store/dataStore'

export const EMPLOYEE_IMPORT_FIELDS = {
  firstName: 'Nombre(s)',
  lastNamePaternal: 'Apellido paterno',
  lastNameMaternal: 'Apellido materno',
  employeeNumber: 'Número de empleado',
  position: 'Puesto',
  department: 'Departamento',
  branch: 'Sucursal',
  schedule: 'Horario',
  hireDate: 'Fecha de ingreso (AAAA-MM-DD)',
  pin: 'PIN (4 dígitos, opcional)',
  phone: 'Teléfono',
  email: 'Correo',
  curp: 'CURP (opcional)',
} as const

type FieldKey = keyof typeof EMPLOYEE_IMPORT_FIELDS

export interface EmployeeImportRow {
  rowNumber: number
  errors: string[]
  input?: NewEmployeeInput
  preview: { name: string; number: string; branch: string; schedule: string }
}

export interface EmployeeImportResult {
  rows: EmployeeImportRow[]
  validCount: number
  errorCount: number
}

function buildHeaderMap(fileHeaders: string[]): Partial<Record<FieldKey, string>> {
  const map: Partial<Record<FieldKey, string>> = {}
  for (const h of fileHeaders) {
    const n = normalizeKey(h)
    for (const key of Object.keys(EMPLOYEE_IMPORT_FIELDS) as FieldKey[]) {
      if (map[key]) continue
      const label = normalizeKey(EMPLOYEE_IMPORT_FIELDS[key]).split('(')[0].trim()
      if (n === normalizeKey(EMPLOYEE_IMPORT_FIELDS[key]) || n === label) map[key] = h
    }
  }
  return map
}

export function buildEmployeeImportTemplate(ctx: {
  branches: Array<{ name: string }>
  schedules: Array<{ name: string }>
}): WorkbookPayload[] {
  const columns: SheetColumn[] = Object.values(EMPLOYEE_IMPORT_FIELDS).map((header) => ({ key: header, header, width: 24 }))
  const example: Record<string, string> = {
    [EMPLOYEE_IMPORT_FIELDS.firstName]: 'Juan',
    [EMPLOYEE_IMPORT_FIELDS.lastNamePaternal]: 'Pérez',
    [EMPLOYEE_IMPORT_FIELDS.lastNameMaternal]: 'López',
    [EMPLOYEE_IMPORT_FIELDS.employeeNumber]: 'EMP-010',
    [EMPLOYEE_IMPORT_FIELDS.position]: 'Auxiliar',
    [EMPLOYEE_IMPORT_FIELDS.department]: 'Operaciones',
    [EMPLOYEE_IMPORT_FIELDS.branch]: ctx.branches[0]?.name ?? 'Sucursal Centro',
    [EMPLOYEE_IMPORT_FIELDS.schedule]: ctx.schedules[0]?.name ?? 'Horario general',
    [EMPLOYEE_IMPORT_FIELDS.hireDate]: new Date().toISOString().slice(0, 10),
    [EMPLOYEE_IMPORT_FIELDS.pin]: '1234',
    [EMPLOYEE_IMPORT_FIELDS.phone]: '5512345678',
    [EMPLOYEE_IMPORT_FIELDS.email]: 'juan.perez@empresa.com',
    [EMPLOYEE_IMPORT_FIELDS.curp]: '',
  }
  const sheet = buildWorkbookPayload('Empleados', columns, [example])
  const instructions = buildWorkbookPayload(
    'Instrucciones',
    [
      { key: 'campo', header: 'Campo', width: 30 },
      { key: 'nota', header: 'Notas', width: 70 },
    ],
    [
      { campo: EMPLOYEE_IMPORT_FIELDS.firstName, nota: 'Obligatorio.' },
      { campo: EMPLOYEE_IMPORT_FIELDS.lastNamePaternal, nota: 'Obligatorio.' },
      { campo: EMPLOYEE_IMPORT_FIELDS.employeeNumber, nota: 'Obligatorio y único, por ejemplo EMP-010.' },
      {
        campo: EMPLOYEE_IMPORT_FIELDS.branch,
        nota: `Obligatorio. Escribe exactamente el nombre de una sucursal existente: ${ctx.branches.map((b) => b.name).join(', ') || 'crea una sucursal antes de importar'}.`,
      },
      {
        campo: EMPLOYEE_IMPORT_FIELDS.schedule,
        nota: `Obligatorio. Escribe exactamente el nombre de un horario existente: ${ctx.schedules.map((s) => s.name).join(', ') || 'crea un horario antes de importar'}.`,
      },
      { campo: EMPLOYEE_IMPORT_FIELDS.hireDate, nota: 'Formato AAAA-MM-DD. Si se deja vacío se usa la fecha de hoy.' },
      { campo: EMPLOYEE_IMPORT_FIELDS.pin, nota: 'Opcional, exactamente 4 dígitos. Sirve para checar por número de empleado.' },
      { campo: 'General', nota: 'No borres ni cambies los encabezados de la primera fila de la hoja «Empleados». Borra la fila de ejemplo antes de subir tu lista real. El rostro y el código de barras se registran después, desde el perfil de cada empleado.' },
    ],
  )
  return [sheet, instructions]
}

export function parseEmployeeImportRows(
  fileHeaders: string[],
  records: Record<string, string>[],
  ctx: {
    branches: Array<{ id: string; name: string }>
    schedules: Array<{ id: string; name: string }>
    existingEmployeeNumbers: string[]
    todayISO: string
  },
): EmployeeImportResult {
  const headerMap = buildHeaderMap(fileHeaders)
  const branchByName = new Map(ctx.branches.map((b) => [normalizeKey(b.name), b.id]))
  const scheduleByName = new Map(ctx.schedules.map((s) => [normalizeKey(s.name), s.id]))
  const seenNumbers = new Set(ctx.existingEmployeeNumbers.map(normalizeKey))

  const rows = records.map((rec, i): EmployeeImportRow => {
    const rowNumber = i + 2
    const val = (key: FieldKey) => (headerMap[key] ? (rec[headerMap[key]!] ?? '').trim() : '')
    const errors: string[] = []

    const firstName = val('firstName')
    const lastNamePaternal = val('lastNamePaternal')
    if (!firstName) errors.push('Falta el nombre.')
    if (!lastNamePaternal) errors.push('Falta el apellido paterno.')

    const employeeNumber = val('employeeNumber')
    if (!employeeNumber) errors.push('Falta el número de empleado.')
    else if (seenNumbers.has(normalizeKey(employeeNumber))) errors.push(`El número «${employeeNumber}» ya existe o está repetido en el archivo.`)

    const branchName = val('branch')
    const branchId = branchByName.get(normalizeKey(branchName))
    if (!branchName) errors.push('Falta la sucursal.')
    else if (!branchId) errors.push(`No existe la sucursal «${branchName}».`)

    const scheduleName = val('schedule')
    const scheduleId = scheduleByName.get(normalizeKey(scheduleName))
    if (!scheduleName) errors.push('Falta el horario.')
    else if (!scheduleId) errors.push(`No existe el horario «${scheduleName}».`)

    const rawHireDate = val('hireDate')
    const hireDate = rawHireDate ? normalizeDate(rawHireDate) : ctx.todayISO
    if (!hireDate) errors.push('La fecha de ingreso no es válida (usa AAAA-MM-DD).')

    const pin = val('pin')
    if (pin && !/^\d{4}$/.test(pin)) errors.push('El PIN debe tener exactamente 4 dígitos, o déjalo vacío.')

    const email = val('email')
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('El correo no es válido.')

    const preview = { name: [firstName, lastNamePaternal].filter(Boolean).join(' ') || `Fila ${rowNumber}`, number: employeeNumber || '—', branch: branchName || '—', schedule: scheduleName || '—' }

    if (errors.length > 0 || !branchId || !scheduleId || !hireDate) return { rowNumber, errors, preview }

    seenNumbers.add(normalizeKey(employeeNumber))
    const input: NewEmployeeInput = {
      branchId,
      employeeNumber,
      firstName,
      lastNamePaternal,
      lastNameMaternal: val('lastNameMaternal') || undefined,
      position: val('position') || 'Sin puesto',
      department: val('department') || 'General',
      email: email || undefined,
      phone: val('phone') || undefined,
      hireDate,
      status: 'active',
      scheduleId,
      identifications: [
        { method: 'employee_number', enabled: true },
        { method: 'qr', enabled: true, value: generateQrValue() },
        { method: 'barcode', enabled: false },
        { method: 'pin', enabled: !!pin, value: pin || undefined },
        { method: 'face', enabled: false },
      ],
      curp: val('curp') || undefined,
    }
    return { rowNumber, errors: [], input, preview }
  })

  return { rows, validCount: rows.filter((r) => r.input).length, errorCount: rows.filter((r) => r.errors.length > 0).length }
}
