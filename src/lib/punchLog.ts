/**
 * "Registro de checadas": every movement as its own line (the daily summary shows one line per day).
 */
import type { AttendanceRecord, Employee, Punch, PunchType } from '@/types'

export type PunchLogTab = 'entries' | 'exits' | 'lunch' | 'all'

export const PUNCH_LOG_TABS: Array<{ value: PunchLogTab; label: string }> = [
  { value: 'entries', label: 'Entradas' },
  { value: 'exits', label: 'Salidas' },
  { value: 'lunch', label: 'Comidas' },
  { value: 'all', label: 'Todos' },
]

const TAB_TYPES: Record<PunchLogTab, PunchType[]> = {
  entries: ['entry'],
  exits: ['exit'],
  lunch: ['lunch_out', 'lunch_in'],
  all: ['entry', 'lunch_out', 'lunch_in', 'exit'],
}

export interface PunchLogRow {
  key: string
  record: AttendanceRecord
  employee: Employee
  punch: Punch
}

/** Accent- and case-insensitive, so "nunez" finds "Núñez". */
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function matchesEmployee(employee: Employee, query: string): boolean {
  const q = searchKey(query)
  if (!q) return true
  return searchKey(`${employee.fullName} ${employee.employeeNumber} ${employee.rfc ?? ''}`).includes(q)
}

export function buildPunchLog(
  records: AttendanceRecord[],
  employees: Employee[],
  filter: { from: string; to: string; tab: PunchLogTab; query?: string; branchId?: string },
): PunchLogRow[] {
  const byId = new Map(employees.map((e) => [e.id, e]))
  const types = TAB_TYPES[filter.tab]
  const rows: PunchLogRow[] = []
  for (const record of records) {
    if (record.date < filter.from || record.date > filter.to) continue
    if (filter.branchId && filter.branchId !== 'all' && record.branchId !== filter.branchId) continue
    const employee = byId.get(record.employeeId)
    if (!employee || !matchesEmployee(employee, filter.query ?? '')) continue
    for (const punch of record.punches) {
      if (types.includes(punch.type)) rows.push({ key: `${record.id}:${punch.type}`, record, employee, punch })
    }
  }
  // Newest first, like a bank statement.
  return rows.sort(
    (a, b) => b.record.date.localeCompare(a.record.date) || b.punch.time.localeCompare(a.punch.time),
  )
}

