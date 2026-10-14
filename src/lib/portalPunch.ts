/**
 * Builds the day's record for a movement registered from the employee portal, with the very same
 * rules the reloj checador uses. Pure: the portal sends the result to the server, which checks it again.
 */
import { canRegisterPunch, recomputeRecord, validatePunchSequence } from '@/lib/attendance'
import { resolveKiosk } from '@/lib/kiosk'
import type { AttendanceRecord, AttendanceSettings, Employee, Punch, Schedule } from '@/types'

export function buildPortalPunch(input: {
  existing?: AttendanceRecord
  employee: Pick<Employee, 'id' | 'companyId' | 'branchId'>
  schedule: Schedule
  settings: AttendanceSettings
  punch: Punch
  today: string
}): AttendanceRecord {
  const { existing, employee, schedule, settings, punch, today } = input
  const blocked = canRegisterPunch(existing?.punches ?? [], punch.type, settings, {
    minutes: resolveKiosk(settings).minGapMinutes,
    now: punch.time,
  })
  if (blocked) throw new Error(blocked)

  const punches = [...(existing?.punches.filter((p) => p.type !== punch.type) ?? []), punch].sort((a, b) =>
    a.time.localeCompare(b.time),
  )
  const inconsistent = validatePunchSequence(punches)
  if (inconsistent) throw new Error(inconsistent)

  const base: AttendanceRecord = existing ?? {
    id: crypto.randomUUID(),
    companyId: employee.companyId,
    branchId: employee.branchId,
    employeeId: employee.id,
    date: today,
    scheduleId: schedule.id,
    punches: [],
    status: 'present',
    workedMinutes: 0,
    scheduledMinutes: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    missingMinutes: 0,
  }
  return recomputeRecord({ ...base, punches }, schedule, settings, today)
}
