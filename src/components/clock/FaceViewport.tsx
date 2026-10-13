import { useId, type ReactNode, type RefObject } from 'react'
import { CameraOff, LoaderCircle } from 'lucide-react'
import type { CameraState } from '@/hooks/useCameraStream'
import type { Rotation } from '@/lib/cameraView'
import { cn } from '@/lib/utils'

/**
 * Mirrored selfie view with an oval guide; the ring turns green when the face is accepted.
 * The box takes the shape of the picture as it really is (and as it is turned), so a tablet held
 * upright shows a tall view and one held sideways a wide one, instead of a fixed 16:9 window.
 */
export function FaceViewport({
  videoRef,
  cameraState,
  cameraMessage,
  loadingModels,
  ok,
  zoom = 1,
  className,
  overlay,
  rotation = 0,
  aspect = 16 / 9,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  cameraState: CameraState
  cameraMessage: string
  loadingModels?: boolean
  ok?: boolean
  /** Digital zoom, so what the person sees is exactly the central part that is being read. */
  zoom?: number
  className?: string
  /** Shown over the camera (the "get ready" countdown). */
  overlay?: ReactNode
  /** Quarter turns that make the picture upright, and its width ÷ height once upright. */
  rotation?: Rotation
  aspect?: number
}) {
  const ready = cameraState === 'ready'
  const maskId = useId()
  const quarter = rotation === 90 || rotation === 270
  // Before rotation the video's own box is the upright one turned back: sized so that, once rotated,
  // it fills the view exactly.
  const videoStyle = quarter
    ? { width: `${100 / aspect}%`, height: `${100 * aspect}%` }
    : { width: '100%', height: '100%' }
  const w = aspect * 100
  const ry = 36
  const rx = Math.min(ry * 0.78, w * 0.44)
  return (
    <div
      className={cn(
        'relative mx-auto overflow-hidden rounded-lg border border-slate-300 bg-slate-900 [--cam-h:56dvh] landscape:[--cam-h:70dvh]',
        className,
      )}
      style={{ aspectRatio: String(aspect), width: `min(100%, calc(var(--cam-h) * ${aspect}))` }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        className={cn('absolute left-1/2 top-1/2 max-w-none object-contain', !ready && 'invisible')}
        // Mirrored like a selfie view, after the quarter turn, with the zoom of what is being read.
        style={{
          ...videoStyle,
          transform: `translate(-50%, -50%) scale(${-zoom}, ${zoom}) rotate(${rotation}deg)`,
        }}
      />
      {ready ? (
        <svg
          viewBox={`0 0 ${w} 100`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <mask id={maskId}>
              <rect width={w} height="100" fill="white" />
              <ellipse cx={w / 2} cy="48" rx={rx} ry={ry} fill="black" />
            </mask>
          </defs>
          <rect width={w} height="100" fill="rgba(15,23,42,0.5)" mask={`url(#${maskId})`} />
          <ellipse
            cx={w / 2}
            cy="48"
            rx={rx}
            ry={ry}
            fill="none"
            stroke={ok ? '#34d399' : 'rgba(255,255,255,0.8)'}
            strokeWidth="1"
            strokeDasharray={ok ? undefined : '3 2.5'}
          />
        </svg>
      ) : null}
      {ready && overlay ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/45 text-center text-white">
          {overlay}
        </div>
      ) : null}
      {!ready || loadingModels ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/85 p-6 text-center text-slate-200">
          {cameraState === 'error' ? (
            <>
              <CameraOff className="h-6 w-6" />
              <p className="text-[13px] leading-5">{cameraMessage}</p>
            </>
          ) : (
            <>
              <LoaderCircle className="h-6 w-6 animate-spin" />
              <p className="text-sm">{loadingModels && ready ? 'Cargando reconocimiento facial…' : 'Iniciando cámara…'}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
