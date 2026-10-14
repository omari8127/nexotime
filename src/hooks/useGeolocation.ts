import { useCallback, useEffect, useRef, useState } from 'react'
import type { PunchLocation } from '@/types'

/** Good enough to stop listening: a real GPS fix, not a guess from the network. */
const GOOD_FIX_METERS = 25
/** How long one "burst" keeps the GPS on looking for a better fix. */
const BURST_MS = 30_000
/** The device may have moved (a phone in someone's pocket): look again this often. */
const REFRESH_MS = 120_000
/** A fix older than this is replaced by any newer one, even a less precise one. */
const STALE_MS = 90_000

/**
 * The device's best-known position, kept fresh in the background so a punch never waits for it.
 *
 * It asks for the *precise* position (GPS on a phone or tablet, Wi-Fi scanning on a PC) and keeps
 * the most accurate fix it gets. The first answers are often rough — a browser may start with a
 * guess from the network that is blocks or kilometers away — so it keeps listening for a while and
 * replaces a rough fix with a better one. The accuracy travels with the position: whoever uses it
 * (see `pickPunchLocation`) knows whether it is exact or only an area.
 *
 * The GPS is not left on all the time (battery, heat on a wall tablet): it works in short bursts,
 * stops as soon as the fix is good, and looks again every couple of minutes and whenever the page
 * comes back to the front.
 *
 * `refresh()` forgets what it had and reads again right now: the employee portal calls it when someone
 * is about to check in, so the movement carries where they are at that moment, not a minute ago.
 */
export function useGeolocation() {
  const [location, setLocation] = useState<PunchLocation | null>(null)
  const [denied, setDenied] = useState(false)
  const restart = useRef<() => void>(() => {})

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    let cancelled = false
    let watchId: number | null = null
    let stopTimer: number | undefined
    let best: { fix: PunchLocation; at: number } | null = null

    const stop = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      watchId = null
      window.clearTimeout(stopTimer)
    }

    const burst = () => {
      if (cancelled || watchId != null) return
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return
          const fix: PunchLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          }
          const now = Date.now()
          const better =
            !best || now - best.at > STALE_MS || (fix.accuracy ?? Infinity) <= (best.fix.accuracy ?? Infinity)
          if (better) {
            best = { fix, at: now }
            setLocation(fix)
          }
          setDenied(false)
          if ((fix.accuracy ?? Infinity) <= GOOD_FIX_METERS) stop()
        },
        (err) => {
          if (cancelled) return
          if (err.code === err.PERMISSION_DENIED) {
            setDenied(true)
            stop()
          }
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
      )
      stopTimer = window.setTimeout(stop, BURST_MS)
    }

    restart.current = () => {
      stop()
      best = null
      burst()
    }
    burst()
    const refresh = window.setInterval(burst, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') burst()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      stop()
      window.clearInterval(refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const refresh = useCallback(() => restart.current(), [])
  return { location, denied, refresh }
}
