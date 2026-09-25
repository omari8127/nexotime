import { DEMO_TODAY } from '@/data/catalog'
import type { BackendMode } from '@/store/dataStore'

/** "YYYY-MM-DD" for a Date, in local time (no UTC shift like toISOString). */
export function toISODate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/**
 * The operational "today". In demo mode this is pinned to 2026-09-10 so the
 * scripted mock data (retardos, incidencias, alertas...) always tells the same
 * story; in live mode it's the real calendar date, because a paying company's
 * attendance has to land on the day it actually happened.
 */
export function getToday(mode: BackendMode): string {
  return mode === 'live' ? toISODate(new Date()) : DEMO_TODAY
}

/** Absolute timestamp for audit/created-at fields. Keeps the "Z" so it parses
 *  to the right instant both in memory and after a round-trip through Postgres
 *  (timestamptz) — slicing it to local-looking text shifts it by the UTC offset. */
export function nowISO(): string {
  return new Date().toISOString()
}
