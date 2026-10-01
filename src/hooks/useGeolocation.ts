import { useEffect, useState } from 'react'
import type { PunchLocation } from '@/types'

/**
 * Best-known device location, fetched in the background so a punch never
 * waits on a GPS fix. The kiosk sits in one fixed spot, so a single good fix
 * is enough — this just keeps retrying until it gets one (the first attempt
 * commonly fails before the browser's permission prompt is answered).
 */
export function useGeolocation() {
  const [location, setLocation] = useState<PunchLocation | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    let cancelled = false

    const attempt = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
          setDenied(false)
        },
        (err) => {
          if (cancelled) return
          setDenied(err.code === err.PERMISSION_DENIED)
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 },
      )
    }

    attempt()
    // Retries: covers "permission answered after the first try" and a cold GPS fix warming up.
    const id = window.setInterval(attempt, 2 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return { location, denied }
}
