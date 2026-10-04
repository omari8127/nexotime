import { setClockOffset } from '@/lib/today'

/**
 * A tablet's own clock is wrong more often than people think (dead battery, "automatic time" off,
 * or set by hand). The server's clock is the reference: read it from the `Date` header of a tiny
 * request and keep the difference, so punches are stamped with the right time.
 *
 * The header has one-second resolution, so differences under half a minute are ignored (see
 * `setClockOffset`); this only matters when the device is really off. Returns the measured
 * difference in ms (server − device), or null if it could not be measured (offline, blocked).
 */
export async function syncServerClock(): Promise<number | null> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const sentAt = Date.now()
    // RLS makes this return nothing; only the response headers are wanted.
    const res = await fetch(`${url}/rest/v1/companies?select=id&limit=1`, {
      method: 'HEAD',
      headers: { apikey: key },
      cache: 'no-store',
    })
    const receivedAt = Date.now()
    const server = Date.parse(res.headers.get('date') ?? '')
    if (!Number.isFinite(server)) return null
    // The header is truncated to the second (+0.5 s on average); compare with the middle of the request.
    const offset = server + 500 - (sentAt + receivedAt) / 2
    setClockOffset(offset)
    return offset
  } catch {
    return null
  }
}
