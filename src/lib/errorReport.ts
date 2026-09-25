import { APP_VERSION } from '@/lib/license/config'
import { LicenseApiError, licenseApi, type ErrorReportItem } from '@/lib/license/api'
import { getStoredToken, useLicenseStore } from '@/lib/license/store'

/**
 * Technical error reports, sent to YOUR license server (no third-party service).
 * They carry only the error text, the screen and the app version — never employee
 * data — and emails or long numbers that slip into a message are masked.
 * Reports wait in this device's storage until it is online and licensed, so a
 * crash while offline is not lost.
 */
const KEY = 'nexotime.errorQueue'
const MAX_QUEUE = 20
const FLUSH_EVERY_MS = 5 * 60_000

const mask = (text: string) =>
  text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]').replace(/\d{6,}/g, '[número]').replace(/\?[^\s)'"]*/g, '')

const read = (): ErrorReportItem[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorReportItem[]
  } catch {
    return []
  }
}
const write = (items: ErrorReportItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_QUEUE)))
  } catch {
    /* storage full or unavailable: reporting is best effort */
  }
}

/** Queue one error. Repeats of the same error just raise a counter. */
export function reportError(error: unknown, where = location.pathname) {
  const err = error instanceof Error ? error : new Error(String(error))
  const message = mask(err.message || err.name || 'Error').slice(0, 300)
  const stack = err.stack ? mask(err.stack).slice(0, 1500) : undefined
  const queue = read()
  const same = queue.find((q) => q.message === message && q.path === where)
  if (same) {
    same.count += 1
    same.at = new Date().toISOString()
  } else {
    queue.push({ at: new Date().toISOString(), message, stack, path: where, count: 1 })
  }
  write(queue)
}

let flushing = false
export async function flushErrorReports() {
  const { phase, payload, deviceId } = useLicenseStore.getState()
  const token = getStoredToken()
  const queue = read()
  if (flushing || !queue.length || phase !== 'ready' || !payload || !token || !navigator.onLine) return
  flushing = true
  try {
    await licenseApi.report({ licenseId: payload.lid, deviceId, token, appVersion: APP_VERSION, errors: queue })
    // Keep anything that was queued while the request was in flight.
    const sent = new Set(queue.map((q) => `${q.message}|${q.path}|${q.at}`))
    write(read().filter((q) => !sent.has(`${q.message}|${q.path}|${q.at}`)))
  } catch (e) {
    // A definitive refusal (device removed) will not fix itself: drop, so the queue does not grow forever.
    if (e instanceof LicenseApiError && e.revoked) write([])
  } finally {
    flushing = false
  }
}

/** Call once at startup. */
export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
  setInterval(() => void flushErrorReports(), FLUSH_EVERY_MS)
  window.addEventListener('online', () => void flushErrorReports())
  // Shortly after start, once the license has been checked.
  setTimeout(() => void flushErrorReports(), 15_000)
}
