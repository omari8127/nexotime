import { useEffect, useState } from 'react'
import { useDataStore } from '@/store/dataStore'
import { DEMO_TODAY } from '@/data/catalog'
import { businessNow } from '@/lib/today'

function demoAnchor(): Date {
  return new Date(`${DEMO_TODAY}T11:45:32`)
}

/**
 * Wall clock shown across the app (dashboard header, reloj checador). In demo
 * mode the date is pinned to 2026-09-10 at a fixed moment so scripted data
 * stays consistent, while the time ticks forward in real time from there; in
 * live mode it's just the real current date and time.
 */
export function useLiveClock(): Date {
  const mode = useDataStore((s) => s.mode)
  // Re-reads when the company changes its time zone (the clock is the company's, not the device's).
  const timezone = useDataStore((s) => s.company.timezone)
  const [now, setNow] = useState(() => (mode === 'live' ? businessNow() : demoAnchor()))

  useEffect(() => {
    if (mode === 'live') {
      setNow(businessNow())
      const id = setInterval(() => setNow(businessNow()), 1000)
      return () => clearInterval(id)
    }

    const start = Date.now()
    const base = demoAnchor().getTime()
    setNow(new Date(base))
    const id = setInterval(() => {
      setNow(new Date(base + (Date.now() - start)))
    }, 1000)
    return () => clearInterval(id)
  }, [mode, timezone])

  return now
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}
