import { DEMO_TODAY } from '@/data/catalog'
import type { BackendMode } from '@/store/dataStore'

/** "YYYY-MM-DD" for a Date, in local time (no UTC shift like toISOString). */
export function toISODate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The company's time zone (live mode); null = use the device's own. Set by the data store. */
let businessTimezone: string | null = null

export function setBusinessTimezone(tz: string | null | undefined) {
  businessTimezone = tz && isValidTimeZone(tz) ? tz : null
}

/**
 * A Date whose *local* fields (getHours(), getDate()…) read the wall-clock time in `tz`.
 *
 * A time clock must stamp the company's time, not whatever zone the tablet happens to be set to
 * (UTC, another state, a travelling phone). Everything in the app reads a "now" through local
 * getters, so shifting it once here fixes the kiosk, the panel and the reports together.
 */
export function inTimezone(date: Date, tz: string | null = businessTimezone): Date {
  if (!tz) return date
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return new Date(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
}

/** Server time − device time, in ms (see `setClockOffset`). */
let clockOffsetMs = 0
/** Below this the measurement is just noise (the server header has 1 s resolution): don't correct. */
const MIN_DRIFT_MS = 30_000

/** Corrects a device whose own clock is off. Tiny differences are ignored on purpose. */
export function setClockOffset(ms: number) {
  clockOffsetMs = Math.abs(ms) >= MIN_DRIFT_MS ? ms : 0
}

export function getClockOffset(): number {
  return clockOffsetMs
}

/** The real current instant: the device clock, corrected by the server's when it is off. */
export function trueNow(): Date {
  return new Date(Date.now() + clockOffsetMs)
}

/** The current moment as the company's wall clock (see `inTimezone`). */
export function businessNow(): Date {
  return inTimezone(trueNow())
}

/**
 * The operational "today". In demo mode this is pinned to 2026-09-10 so the
 * scripted mock data (retardos, incidencias, alertas...) always tells the same
 * story; in live mode it's the real calendar date in the company's time zone, because
 * a paying company's attendance has to land on the day it actually happened.
 */
export function getToday(mode: BackendMode): string {
  return mode === 'live' ? toISODate(businessNow()) : DEMO_TODAY
}

/** Absolute timestamp for audit/created-at fields. Keeps the "Z" so it parses
 *  to the right instant both in memory and after a round-trip through Postgres
 *  (timestamptz) — slicing it to local-looking text shifts it by the UTC offset. */
export function nowISO(): string {
  return trueNow().toISOString()
}
