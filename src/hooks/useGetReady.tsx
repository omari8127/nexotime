import { useCallback, useEffect, useState } from 'react'

/** Seconds the person gets, with the camera already showing them, before anything is read. */
export const GET_READY_SECONDS = 4

/**
 * "Acomódate": the camera turns on, shows the person, and only after a few seconds starts looking.
 * Before this, reading began on the very first frame and a recognised face went straight through to a
 * registration, with no time to see what was happening or to place oneself.
 *
 * `rearmKey` starts the countdown again (a retry); `skip` ends it at once ("Empezar ya").
 */
export function useGetReady(active: boolean, rearmKey = 0, seconds = GET_READY_SECONDS) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (!active) return
    setLeft(seconds)
    const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(id)
  }, [active, rearmKey, seconds])
  const skip = useCallback(() => setLeft(0), [])
  return { left, ready: left === 0, skip }
}

/** The big number over the camera while counting down. */
export function GetReadyOverlay({ left }: { left: number }) {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wider text-white/90">Prepárate</p>
      <p className="font-mono text-7xl font-bold tabular-nums leading-none">{left}</p>
      <p className="text-sm text-white/90">Mira a la cámara y mantente quieto</p>
    </>
  )
}
