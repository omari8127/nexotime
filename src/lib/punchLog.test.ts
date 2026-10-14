import { describe, expect, it } from 'vitest'
import { buildPunchLog, matchesEmployee } from '@/lib/punchLog'
import type { AttendanceRecord, Employee, Punch } from '@/types'

const employee = (id: string, fullName: string, employeeNumber: string, branchId = 'b1'): Employee => ({
  id,
  companyId: 'c1',
  branchId,
  employeeNumber,
  firstName: fullName.split(' ')[0],
  lastNamePaternal: fullName.split(' ')[1] ?? '',
  fullName,
  position: '',
  department: '',
  status: 'active',
  hireDate: '2024-01-01',
  scheduleId: 's1',
  identifications: [],
})

const record = (employeeId: string, date: string, punches: Punch[], branchId = 'b1'): AttendanceRecord => ({
  id: `${employeeId}-${date}`,
  companyId: 'c1',
  branchId,
  employeeId,
  date,
  scheduleId: 's1',
  punches,
  status: 'present',
  workedMinutes: 0,
  scheduledMinutes: 0,
  lateMinutes: 0,
  overtimeMinutes: 0,
  missingMinutes: 0,
})

const p = (type: Punch['type'], time: string): Punch => ({ type, time, method: 'app' })

const employees = [employee('e1', 'Adriana Núñez', 'EMP-001'), employee('e2', 'Luis Mora', 'EMP-002', 'b2')]
const records = [
  record('e1', '2026-10-12', [p('entry', '08:00'), p('lunch_out', '12:00'), p('lunch_in', '13:00'), p('exit', '17:30')]),
  record('e1', '2026-10-13', [p('entry', '08:05')]),
  record('e2', '2026-10-13', [p('entry', '07:40'), p('exit', '15:00')], 'b2'),
  record('e2', '2026-09-01', [p('entry', '07:40')], 'b2'),
  record('gone', '2026-10-13', [p('entry', '09:00')]),
]
const range = { from: '2026-10-01', to: '2026-10-31' }

describe('buildPunchLog', () => {
  it('lista cada checada del periodo, la más reciente primero', () => {
    const all = buildPunchLog(records, employees, { ...range, tab: 'all' })
    expect(all).toHaveLength(7)
    expect([all[0].record.date, all[0].punch.time]).toEqual(['2026-10-13', '15:00'])
    expect(all.at(-1)?.punch.time).toBe('08:00')
  })

  it('separa entradas, salidas y comidas', () => {
    expect(buildPunchLog(records, employees, { ...range, tab: 'entries' })).toHaveLength(3)
    expect(buildPunchLog(records, employees, { ...range, tab: 'exits' })).toHaveLength(2)
    expect(buildPunchLog(records, employees, { ...range, tab: 'lunch' }).map((r) => r.punch.type)).toEqual(['lunch_in', 'lunch_out'])
  })

  it('filtra por nombre sin importar acentos, por número y por sucursal', () => {
    expect(buildPunchLog(records, employees, { ...range, tab: 'all', query: 'nunez' })).toHaveLength(5)
    expect(buildPunchLog(records, employees, { ...range, tab: 'all', query: 'emp-002' })).toHaveLength(2)
    expect(buildPunchLog(records, employees, { ...range, tab: 'all', branchId: 'b2' })).toHaveLength(2)
  })

  it('ignora registros de empleados que ya no se pueden ver', () => {
    expect(buildPunchLog(records, employees, { ...range, tab: 'all' }).some((r) => r.record.employeeId === 'gone')).toBe(false)
  })
})

describe('matchesEmployee', () => {
  it('una búsqueda vacía acepta a todos', () => {
    expect(matchesEmployee(employees[0], '  ')).toBe(true)
  })
})
