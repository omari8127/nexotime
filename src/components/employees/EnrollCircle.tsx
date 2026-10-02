import type { RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CameraOff, CircleCheck, LoaderCircle } from 'lucide-react'
import type { CameraState } from '@/hooks/useCameraStream'

const TICKS = 60
const SIZE = 288
const CENTER = SIZE / 2

/**
 * Face-ID style enrollment dial: a round camera view inside a ring of ticks. The ring is
 * split into one segment per pose; finished segments turn green, and the current one fills
 * as the person holds still, so there is always something moving while the app works.
 */
export function EnrollCircle({
  videoRef,
  cameraState,
  cameraMessage,
  loading,
  segments,
  done,
  hold,
  success,
  flashKey,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  cameraState: CameraState
  cameraMessage: string
  /** Face models still loading. */
  loading: boolean
  segments: number
  /** Completed segments. */
  done: number
  /** 0–1 progress of the segment in progress. */
  hold: number
  /** Everything finished / recognised: the whole ring goes green. */
  success?: boolean
  /** Changes on every captured sample, to play the capture flash. */
  flashKey: number
}) {
  const ready = cameraState === 'ready'
  const perSegment = TICKS / segments
  const busy = !ready || loading

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: TICKS }, (_, i) => {
          const segment = Math.floor(i / perSegment)
          const within = i - segment * perSegment
          const lit = success || segment < done || (segment === done && within < Math.round(hold * perSegment))
          const active = !success && segment === done && !lit
          return (
            <line
              key={i}
              x1={CENTER}
              y1={4}
              x2={CENTER}
              y2={segment === done && !success ? 17 : 15}
              transform={`rotate(${(i * 360) / TICKS} ${CENTER} ${CENTER})`}
              strokeWidth={3.2}
              strokeLinecap="round"
              style={{
                stroke: lit ? 'hsl(var(--success))' : active ? 'hsl(var(--primary) / 0.45)' : 'hsl(var(--border))',
                transition: 'stroke 0.25s ease',
              }}
            />
          )
        })}
      </svg>

      <div className="absolute inset-[26px] overflow-hidden rounded-full bg-slate-900 shadow-inner ring-1 ring-black/10">
        <video
          ref={videoRef}
          muted
          playsInline
          className={`h-full w-full -scale-x-100 object-cover transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />

        <AnimatePresence>
          {busy ? (
            <motion.div
              key="busy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-8 text-center text-slate-200"
            >
              {cameraState === 'error' ? (
                <>
                  <CameraOff className="h-7 w-7" />
                  <p className="text-[13px] leading-5">{cameraMessage}</p>
                </>
              ) : (
                <>
                  <LoaderCircle className="h-7 w-7 animate-spin" />
                  <p className="text-sm font-medium">{ready ? 'Preparando el reconocimiento…' : 'Iniciando cámara…'}</p>
                  {ready ? <p className="text-xs text-slate-400">La primera vez tarda unos segundos</p> : null}
                </>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {flashKey > 0 ? (
          <motion.div
            key={`flash-${flashKey}`}
            initial={{ opacity: 0.75 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none absolute inset-0 bg-white"
          />
        ) : null}

        <AnimatePresence>
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="absolute inset-0 flex items-center justify-center bg-success/25"
            >
              <CircleCheck className="h-20 w-20 text-white drop-shadow-lg" strokeWidth={1.6} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
