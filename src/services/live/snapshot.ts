/**
 * Local copy of the last data pulled from the server. It is what lets a
 * tablet that restarts with no internet still open the reloj checador and the
 * admin panel instead of bouncing to the login screen.
 */
import type { LiveBundle } from '@/services/live/liveApi'

const KEY = 'nexotime.liveSnapshot'

export function saveSnapshot(bundle: LiveBundle) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bundle))
  } catch {
    // Too large for localStorage: drop the (now stale) copy rather than keep old data.
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
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
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
