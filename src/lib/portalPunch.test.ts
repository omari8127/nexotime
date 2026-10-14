import { describe, expect, it } from 'vitest'
import { buildPortalPunch } from '@/lib/portalPunch'
import type { AttendanceSettings, Punch, Schedule, Weekday } from '@/types'

const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const schedule: Schedule = {
  id: 's1',
  companyId: 'c1',
  name: 'General',
  weeklyTargetHours: 40,
  color: '#000',
  days: WEEK.map((weekday) => ({ weekday, enabled: true, entry: '09:00', exit: '17:00' })),
}
const settings: AttendanceSettings = {
  entryToleranceMinutes: 10,
  absenceThresholdMinutes: 120,
  allowEarlyLeave: false,
  trackLunch: true,
  allowMultipleEntries: false,
  overtimeThresholdMinutes: 15,
  roundingMinutes: 1,
}
const employee = { id: 'e1', companyId: 'c1', branchId: 'b1' }
const today = '2026-10-13'
const punch = (type: Punch['type'], time: string): Punch => ({
  type,
  time,
  method: 'app',
  photoEvidence: { id: `photo-${type}`, capturedAt: '2026-10-13T16:00:00Z' },
})

describe('buildPortalPunch', () => {
  it('crea el día con la entrada, a nombre del empleado y con el retardo calculado', () => {
    const record = buildPortalPunch({ employee, schedule, settings, punch: punch('entry', '09:25'), today })
    expect(record).toMatchObject({ employeeId: 'e1', companyId: 'c1', branchId: 'b1', date: today, scheduleId: 's1' })
    expect(record.punches).toHaveLength(1)
    expect(record.lateMinutes).toBe(25)
    expect(record.status).toBe('late')
  })

  it('agrega la salida al mismo día y calcula las horas', () => {
    const entry = buildPortalPunch({ employee, schedule, settings, punch: punch('entry', '09:00'), today })
    const full = buildPortalPunch({ existing: entry, employee, schedule, settings, punch: punch('exit', '17:00'), today })
    expect(full.id).toBe(entry.id)
    expect(full.punches.map((p) => p.type)).toEqual(['entry', 'exit'])
    expect(full.workedMinutes).toBe(480)
  })

  it('rechaza lo que el reloj checador también rechaza', () => {
    const entry = buildPortalPunch({ employee, schedule, settings, punch: punch('entry', '09:00'), today })
    expect(() => buildPortalPunch({ employee, schedule, settings, punch: punch('exit', '17:00'), today })).toThrow(/entrada/)
    expect(() => buildPortalPunch({ existing: entry, employee, schedule, settings, punch: punch('entry', '12:00'), today })).toThrow(/Ya registraste/)
    expect(() => buildPortalPunch({ existing: entry, employee, schedule, settings, punch: punch('lunch_in', '14:00'), today })).toThrow(/comida|comer/)
    // Doble toque: dos movimientos seguidos sin dejar pasar el tiempo mínimo.
    expect(() => buildPortalPunch({ existing: entry, employee, schedule, settings, punch: punch('lunch_out', '09:01'), today })).toThrow(/Espera/)
  })
})
