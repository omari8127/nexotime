import { WEEKDAY_SHORT, weekdayFromISO } from '@/lib/attendance'
import type { Weekday } from '@/types'

/** Monday-anchored week containing `iso`. Returns ISO date strings. */
export function weekDates(iso: string): string[] {
  const d = new Date(`${iso}T00:00:00`)
  const jsDay = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((jsDay + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setDate(monday.getDate() + i)
    return x.toISOString().slice(0, 10)
  })
}

export function isInWeek(iso: string, weekIso: string): boolean {
  const week = weekDates(weekIso)
  return iso >= week[0] && iso <= week[6]
}

export function dayLabel(iso: string): string {
  return WEEKDAY_SHORT[weekdayFromISO(iso) as Weekday]
}

/** The demo's frozen "now" — keeps relative timestamps stable regardless of the
 *  real date the demo is opened. */
export const DEMO_NOW = new Date('2026-09-10T11:45:00')

export function relativeFromNow(isoDateTime: string): string {
  const then = new Date(isoDateTime).getTime()
  const now = DEMO_NOW.getTime()
  const diffMin = Math.round((now - then) / 60000)
  if (diffMin < 1) return 'hace instantes'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.round(diffH / 24)
  return `hace ${diffD} d`
}
