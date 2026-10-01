import { useEffect, useState } from 'react'
import type { PunchLocation } from '@/types'

/**
 * Best-known device location, fetched in the background so a punch never
 * waits on a GPS fix. The kiosk sits in one fixed spot, so a single good fix
 * is enough.
 *
 * Why a punch can still land with no location: the auto-register countdown
 * (2–8 s, configurable) is often shorter than how long it takes a brand-new
 * browser profile to show its permission prompt, wait for someone to answer
 * it, and get a first fix. That first miss is expected — once this hook gets
 * one good fix it keeps it for the rest of the session, so every punch after
 * the first one on a given tablet carries a location. Network-based location
 * (enableHighAccuracy: false) is used on purpose: it resolves in roughly a
 * second via Wi-Fi/cell instead of GPS's much slower cold fix, and
 * block-level precision is all this needs.
 */
export function useGeolocation() {
  const [location, setLocation] = useState<PunchLocation | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    let cancelled = false
    let id: number

    const attempt = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
          setDenied(false)
          window.clearInterval(id)
        },
        (err) => {
          if (cancelled) return
          setDenied(err.code === err.PERMISSION_DENIED)
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
      )
    }

    attempt()
    // A fixed kiosk never needs a second fix once it has one — this only
    // keeps firing while we don't have a location yet (new permission still
    // pending, or a slow first fix), roughly every 15 s instead of every 2 min.
    id = window.setInterval(attempt, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return { location, denied }
}
