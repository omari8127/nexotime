import { describe, expect, it } from 'vitest'
import { countVacationDays, vacationBalance, vacationDaysForYear, yearsOfService } from '@/lib/vacations'
import type { Incidencia, Schedule, Weekday } from '@/types'

const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const monToFri: Schedule = {
  id: 's1',
  companyId: 'c1',
  name: 'Lunes a viernes',
  weeklyTargetHours: 40,
  color: '#000',
  days: WEEK.map((weekday) => ({ weekday, enabled: weekday !== 'sat' && weekday !== 'sun', entry: '09:00', exit: '17:00' })),
}

const vac = (from: string, to: string, status: Incidencia['status'], employeeId = 'e1'): Incidencia => ({
  id: `${from}-${status}`,
  companyId: 'c1',
  employeeId,
  type: 'vacaciones',
  from,
  to,
  status,
  requestedById: '',
  createdAt: '2026-01-01T00:00:00Z',
})

describe('vacationDaysForYear (Art. 76 LFT)', () => {
  it('sigue la tabla de la reforma de 2023', () => {
    expect([0, 1, 2, 3, 4, 5].map(vacationDaysForYear)).toEqual([0, 12, 14, 16, 18, 20])
    expect([6, 10, 11, 15, 16, 20, 21, 31].map(vacationDaysForYear)).toEqual([22, 22, 24, 24, 26, 26, 28, 32])
  })
})

describe('yearsOfService', () => {
  it('cuenta años cumplidos, no años calendario', () => {
    expect(yearsOfService('2024-05-16', '2026-05-15')).toBe(1)
    expect(yearsOfService('2024-05-16', '2026-05-16')).toBe(2)
    expect(yearsOfService('2026-10-07', '2026-10-13')).toBe(0)
    expect(yearsOfService('2027-01-01', '2026-10-13')).toBe(0)
  })

  it('un ingreso el 29 de febrero cumple el 28 en años no bisiestos', () => {
    expect(yearsOfService('2024-02-29', '2025-02-27')).toBe(0)
    expect(yearsOfService('2024-02-29', '2025-02-28')).toBe(1)
  })
})

describe('countVacationDays', () => {
  it('solo cuenta los días que la persona trabaja', () => {
    // Lunes 12 a domingo 18 de octubre de 2026: 5 días laborables.
    expect(countVacationDays('2026-10-12', '2026-10-18', monToFri)).toBe(5)
    expect(countVacationDays('2026-10-12', '2026-10-18')).toBe(7)
    expect(countVacationDays('2026-10-17', '2026-10-18', monToFri)).toBe(0)
  })

  it('recorta al periodo indicado', () => {
    expect(countVacationDays('2026-10-12', '2026-10-23', monToFri, { from: '2026-10-19', to: '2026-12-31' })).toBe(5)
  })
})

describe('vacationBalance', () => {
  const employee = { id: 'e1', hireDate: '2024-05-16' }

  it('descuenta lo aprobado del año vacacional en curso y aparta lo pendiente', () => {
    const balance = vacationBalance(
      employee,
      [
        vac('2026-10-12', '2026-10-16', 'approved'), // 5 días, en el periodo
        vac('2026-11-02', '2026-11-03', 'pending'), // 2 días, sin decidir
        vac('2026-03-02', '2026-03-06', 'approved'), // año vacacional anterior
        vac('2026-12-01', '2026-12-04', 'rejected'),
        vac('2026-10-19', '2026-10-23', 'approved', 'otro'),
      ],
      monToFri,
      '2026-10-13',
    )
    expect(balance).toMatchObject({
      yearsOfService: 2,
      entitled: 14,
      taken: 5,
      pending: 2,
      available: 9,
      periodStart: '2026-05-16',
      periodEnd: '2027-05-15',
      nextAnniversary: '2027-05-16',
    })
  })

  it('en el primer año todavía no hay días por ley', () => {
    const balance = vacationBalance({ id: 'e1', hireDate: '2026-10-07' }, [], monToFri, '2026-10-13')
    expect(balance).toMatchObject({ yearsOfService: 0, entitled: 0, available: 0, nextAnniversary: '2027-10-07' })
  })
})
