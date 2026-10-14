import { motion } from 'framer-motion'
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

/** The countdown over the camera: a ring that empties and a number that pops each second. */
export function GetReadyOverlay({ left, seconds = GET_READY_SECONDS }: { left: number; seconds?: number }) {
  const r = 44
  const length = 2 * Math.PI * r
  return (
    <>
      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-700 shadow">Prepárate</span>
      <span className="relative mt-2 flex h-28 w-28 items-center justify-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r={r} fill="rgba(15,23,42,0.35)" stroke="rgba(255,255,255,0.3)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - left / seconds)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <motion.span
          key={left}
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="relative font-mono text-6xl font-bold tabular-nums leading-none drop-shadow"
        >
          {left}
        </motion.span>
      </span>
      <span className="mt-2 rounded-full bg-slate-900/50 px-3 py-1 text-sm font-medium text-white">Pon tu cara dentro del óvalo</span>
    </>
  )
}
