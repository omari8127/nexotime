import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * The same wall clock, but as a function to call when the time is needed (to stamp a punch), without
 * re-rendering anything every second. A screen that only needs the time at the moment of an action
 * (the reloj checador: its camera steps must not repaint every second) reads it here and leaves the
 * ticking digits to small components of their own.
 */
export function useClockReader(): () => Date {
  const mode = useDataStore((s) => s.mode)
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = Date.now()
  }, [mode])
  return useCallback(
    () =>
      mode === 'live'
        ? businessNow()
        : new Date(demoAnchor().getTime() + (Date.now() - (startedAt.current || Date.now()))),
    [mode],
  )
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}
