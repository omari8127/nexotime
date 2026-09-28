/**
 * Import attendance corrections in bulk: the customer downloads a template
 * pre-filled with the current punches for the selected period, edits only the
 * days that were wrong in Excel, and re-uploads it. Blank time cells mean "no
 * change" — nothing is ever deleted by importing.
 */
import { normalizeDate, normalizeKey, normalizeTime } from '@/lib/importNormalize'
import { formatTime12 } from '@/lib/utils'
import type { SheetColumn, WorkbookPayload } from '@/services/exportService'
import { buildWorkbookPayload } from '@/services/exportService'
import type { AttendanceRecord, Employee, PunchType } from '@/types'

export const CORRECTION_FIELDS = {
  employeeNumber: 'Número de empleado',
  employee: 'Empleado',
  date: 'Fecha (AAAA-MM-DD)',
  entry: 'Entrada (HH:MM)',
  lunchOut: 'Salida a comida (HH:MM)',
  lunchIn: 'Regreso de comida (HH:MM)',
  exit: 'Salida (HH:MM)',
  reason: 'Motivo de la corrección',
} as const

type FieldKey = keyof typeof CORRECTION_FIELDS
const PUNCH_FIELD: Partial<Record<FieldKey, PunchType>> = { entry: 'entry', lunchOut: 'lunch_out', lunchIn: 'lunch_in', exit: 'exit' }

function punchTime(r: AttendanceRecord | undefined, type: PunchType): string {
  return r?.punches.find((p) => p.type === type)?.time ?? ''
}

/** One row per employee × day in the period, pre-filled with what is already registered. */
export function buildCorrectionTemplate(ctx: {
  employees: Employee[]
  attendance: AttendanceRecord[]
  from: string
  to: string
}): WorkbookPayload[] {
  const columns: SheetColumn[] = [
    { key: CORRECTION_FIELDS.employeeNumber, header: CORRECTION_FIELDS.employeeNumber, width: 16 },
    { key: CORRECTION_FIELDS.employee, header: CORRECTION_FIELDS.employee, width: 26 },
    { key: CORRECTION_FIELDS.date, header: CORRECTION_FIELDS.date, width: 14 },
    { key: CORRECTION_FIELDS.entry, header: CORRECTION_FIELDS.entry, width: 14 },
    { key: CORRECTION_FIELDS.lunchOut, header: CORRECTION_FIELDS.lunchOut, width: 16 },
    { key: CORRECTION_FIELDS.lunchIn, header: CORRECTION_FIELDS.lunchIn, width: 16 },
    { key: CORRECTION_FIELDS.exit, header: CORRECTION_FIELDS.exit, width: 14 },
    { key: CORRECTION_FIELDS.reason, header: CORRECTION_FIELDS.reason, width: 30 },
  ]
  const byEmpDate = new Map(ctx.attendance.map((r) => [`${r.employeeId}_${r.date}`, r]))
  const rows: Array<Record<string, string>> = []
  for (const e of [...ctx.employees].sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    for (let d = ctx.from; d <= ctx.to; d = addDay(d)) {
      const r = byEmpDate.get(`${e.id}_${d}`)
      rows.push({
        [CORRECTION_FIELDS.employeeNumber]: e.employeeNumber,
        [CORRECTION_FIELDS.employee]: e.fullName,
        [CORRECTION_FIELDS.date]: d,
        [CORRECTION_FIELDS.entry]: punchTime(r, 'entry'),
        [CORRECTION_FIELDS.lunchOut]: punchTime(r, 'lunch_out'),
        [CORRECTION_FIELDS.lunchIn]: punchTime(r, 'lunch_in'),
        [CORRECTION_FIELDS.exit]: punchTime(r, 'exit'),
        [CORRECTION_FIELDS.reason]: '',
      })
    }
  }
  const sheet = buildWorkbookPayload('Correcciones', columns, rows, { periodo: `${ctx.from} a ${ctx.to}` })
  const instructions = buildWorkbookPayload(
    'Instrucciones',
    [
      { key: 'campo', header: 'Campo', width: 30 },
      { key: 'nota', header: 'Notas', width: 70 },
    ],
    [
      { campo: 'Cómo usar este archivo', nota: 'Cada fila es un empleado en un día del periodo, con sus horas ya registradas. Cambia solo las celdas que estén mal y déjalas vacías si no quieres tocarlas.' },
      { campo: CORRECTION_FIELDS.employeeNumber, nota: 'No lo cambies: identifica al empleado. Si lo borras, esa fila no se podrá aplicar.' },
      { campo: 'Horas (HH:MM)', nota: 'Formato de 24 horas, por ejemplo 09:03 o 18:30. Dejar la celda vacía significa «no cambiar esa hora».' },
      { campo: CORRECTION_FIELDS.reason, nota: 'Opcional. Se guarda en la auditoría de cada cambio; si se deja vacío se anota «Corrección por importación».' },
      { campo: 'General', nota: 'No agregues ni quites columnas ni cambies los encabezados de la primera fila.' },
    ],
  )
  return [sheet, instructions]
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface CorrectionRow {
  rowNumber: number
  errors: string[]
  /** One entry per punch column that actually changed. Empty = nothing to apply for this row. */
  changes: Array<{ employeeId: string; employeeName: string; date: string; type: PunchType; time: string; reason: string }>
  preview: { employee: string; date: string }
}

export interface CorrectionImportResult {
  rows: CorrectionRow[]
  changeCount: number
  errorRowCount: number
}

function buildHeaderMap(fileHeaders: string[]): Partial<Record<FieldKey, string>> {
  const map: Partial<Record<FieldKey, string>> = {}
  for (const h of fileHeaders) {
    const n = normalizeKey(h)
    for (const key of Object.keys(CORRECTION_FIELDS) as FieldKey[]) {
      if (map[key]) continue
      const label = normalizeKey(CORRECTION_FIELDS[key]).split('(')[0].trim()
      if (n === normalizeKey(CORRECTION_FIELDS[key]) || n === label) map[key] = h
    }
  }
  return map
}

export function parseCorrectionRows(
  fileHeaders: string[],
  records: Record<string, string>[],
  ctx: { employees: Employee[]; attendance: AttendanceRecord[] },
): CorrectionImportResult {
  const headerMap = buildHeaderMap(fileHeaders)
  const empByNumber = new Map(ctx.employees.map((e) => [normalizeKey(e.employeeNumber), e]))
  const byEmpDate = new Map(ctx.attendance.map((r) => [`${r.employeeId}_${r.date}`, r]))

  const rows = records.map((rec, i): CorrectionRow => {
    const rowNumber = i + 2
    const val = (key: FieldKey) => (headerMap[key] ? (rec[headerMap[key]!] ?? '').trim() : '')
    const errors: string[] = []

    const number = val('employeeNumber')
    const employee = number ? empByNumber.get(normalizeKey(number)) : undefined
    if (!number) errors.push('Falta el número de empleado.')
    else if (!employee) errors.push(`No existe un empleado con el número «${number}».`)

    const rawDate = val('date')
    const date = normalizeDate(rawDate)
    if (!rawDate) errors.push('Falta la fecha.')
    else if (!date) errors.push(`La fecha «${rawDate}» no es válida (usa AAAA-MM-DD).`)

    const preview = { employee: employee?.fullName ?? val('employee') ?? `Fila ${rowNumber}`, date: date ?? rawDate ?? '—' }
    if (errors.length > 0 || !employee || !date) return { rowNumber, errors, changes: [], preview }

    const existing = byEmpDate.get(`${employee.id}_${date}`)
    const reason = val('reason') || 'Corrección por importación'
    const changes: CorrectionRow['changes'] = []
    for (const key of Object.keys(PUNCH_FIELD) as FieldKey[]) {
      const raw = val(key)
      if (!raw) continue // blank = leave untouched
      const time = normalizeTime(raw)
      const type = PUNCH_FIELD[key]!
      if (!time) {
        errors.push(`«${CORRECTION_FIELDS[key]}» no es una hora válida (usa HH:MM).`)
        continue
      }
      const current = punchTime(existing, type)
      if (time !== current) changes.push({ employeeId: employee.id, employeeName: employee.fullName, date, type, time, reason })
    }
    return { rowNumber, errors, changes: errors.length === 0 ? changes : [], preview }
  })

  return {
    rows,
    changeCount: rows.reduce((a, r) => a + r.changes.length, 0),
    errorRowCount: rows.filter((r) => r.errors.length > 0).length,
  }
}

export const formatChangeSummary = (c: CorrectionRow['changes'][number]) =>
  `${c.employeeName} · ${c.date} · nueva hora: ${formatTime12(c.time)}`
