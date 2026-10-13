/**
 * Local copy of the last data pulled from the server. It is what lets a
 * tablet that restarts with no internet still open the reloj checador and the
 * admin panel instead of bouncing to the login screen.
 */
import type { LiveBundle } from '@/services/live/liveApi'

const KEY = 'nexotime.liveSnapshot'

/** How much history the offline copy keeps, from most to least. A browser gives localStorage ≈5 MB
 *  and a year of a busy company's attendance does not fit; offline the kiosk only needs the recent past. */
const SNAPSHOT_TIERS = [
  { days: 62, audit: 100 },
  { days: 21, audit: 30 },
  { days: 7, audit: 0 },
]

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The offline copy at a given tier: recent attendance only, and a short audit trail. */
export function trimForSnapshot(bundle: LiveBundle, tier: { days: number; audit: number }): LiveBundle {
  const since = isoDaysAgo(tier.days)
  return {
    ...bundle,
    attendance: bundle.attendance.filter((r) => r.date >= since),
    audit: bundle.audit.slice(0, tier.audit),
  }
}

let pending: LiveBundle | null = null
let scheduled = false

/**
 * Serialising a whole company into localStorage is synchronous and, on a weak tablet, a visible
 * stall. Do it when the browser is idle (and only the newest data if several arrive meanwhile),
 * never in the middle of the frame that just received it.
 */
export function saveSnapshot(bundle: LiveBundle) {
  pending = bundle
  if (scheduled) return
  scheduled = true
  const run = () => {
    scheduled = false
    const next = pending
    pending = null
    if (next) writeSnapshot(next)
  }
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback
  if (ric) ric(run, { timeout: 4000 })
  else setTimeout(run, 250)
}

export function writeSnapshot(bundle: LiveBundle) {
  // Try the fullest copy that fits. Only if even the smallest does not, drop the (now stale) copy
  // rather than keep old data that would show wrong numbers offline.
  for (const tier of SNAPSHOT_TIERS) {
    try {
      localStorage.setItem(KEY, JSON.stringify(trimForSnapshot(bundle, tier)))
      return
    } catch {
      /* too large: try the next, smaller tier */
    }
  }
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function loadSnapshot(): LiveBundle | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LiveBundle) : null
  } catch {
    return null
  }
}

export function clearSnapshot() {
  pending = null // a write still waiting for an idle moment must not bring the data back after sign-out
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
