/**
 * Vacation math. Pure functions shared by the admin panel and the employee portal.
 *
 * Days by law: Art. 76 LFT after the 2023 "vacaciones dignas" reform — 12 working days after the
 * first year, +2 per year up to 20, then +2 for every 5 years. Informative: a company may grant more.
 */
import { scheduleDayFor, weekdayFromISO } from '@/lib/attendance'
import type { Incidencia, Schedule } from '@/types'

export function vacationDaysForYear(completedYears: number): number {
  const y = Math.floor(completedYears)
  if (y < 1) return 0
  if (y <= 5) return 12 + (y - 1) * 2
  return 20 + 2 * Math.ceil((y - 5) / 5)
}

const pad = (n: number) => String(n).padStart(2, '0')
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number]

/** The hire date's anniversary in `year` (29 Feb falls on 28 Feb in a common year). */
function anniversary(hireDate: string, year: number): string {
  const [, m, d] = parts(hireDate)
  const lastDay = new Date(year, m, 0).getDate()
  return `${year}-${pad(m)}-${pad(Math.min(d, lastDay))}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = parts(iso)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Full years worked on `todayISO`. */
export function yearsOfService(hireDate: string, todayISO: string): number {
  const [hy] = parts(hireDate)
  const [ty] = parts(todayISO)
  if (!hy || !ty || todayISO < hireDate) return 0
  return todayISO >= anniversary(hireDate, ty) ? ty - hy : ty - hy - 1
}

/**
 * Working days of a vacation between two dates (both included): only the days the person's schedule
 * has them working, clipped to [clipFrom, clipTo] when given. Without a schedule every day counts.
 */
export function countVacationDays(
  from: string,
  to: string,
  schedule?: Schedule,
  clip?: { from: string; to: string },
): number {
  const start = clip && clip.from > from ? clip.from : from
  const end = clip && clip.to < to ? clip.to : to
  let days = 0
  for (let day = start, guard = 0; day <= end && guard < 800; day = addDaysISO(day, 1), guard++) {
    if (!schedule || scheduleDayFor(schedule, weekdayFromISO(day))?.enabled) days += 1
  }
  return days
}

export interface VacationBalance {
  yearsOfService: number
  /** Days of the vacation year in course (0 during the first year of work). */
  entitled: number
  /** Approved days inside the vacation year in course. */
  taken: number
  /** Requested days still waiting for a decision. */
  pending: number
  available: number
  /** The vacation year in course runs between these two dates (both included). */
  periodStart: string
  periodEnd: string
  /** When the next year of service is completed. */
  nextAnniversary: string
}

export function vacationBalance(
  employee: { id: string; hireDate: string },
  incidencias: Incidencia[],
  schedule: Schedule | undefined,
  todayISO: string,
): VacationBalance {
  const years = yearsOfService(employee.hireDate, todayISO)
  const [hy] = parts(employee.hireDate)
  const periodStart = years >= 1 ? anniversary(employee.hireDate, hy + years) : employee.hireDate
  const nextAnniversary = anniversary(employee.hireDate, hy + years + 1)
  const periodEnd = addDaysISO(nextAnniversary, -1)
  const clip = { from: periodStart, to: periodEnd }
  const mine = incidencias.filter(
    (i) => i.employeeId === employee.id && i.type === 'vacaciones' && i.to >= periodStart && i.from <= periodEnd,
  )
  const sum = (status: Incidencia['status']) =>
    mine.filter((i) => i.status === status).reduce((n, i) => n + countVacationDays(i.from, i.to, schedule, clip), 0)
  const entitled = vacationDaysForYear(years)
  const taken = sum('approved')
  return {
    yearsOfService: years,
    entitled,
    taken,
    pending: sum('pending'),
    available: Math.max(0, entitled - taken),
    periodStart,
    periodEnd,
    nextAnniversary,
  }
}
