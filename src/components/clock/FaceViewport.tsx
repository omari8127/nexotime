import type { RefObject } from 'react'
import { CameraOff, LoaderCircle } from 'lucide-react'
import type { CameraState } from '@/hooks/useCameraStream'
import { cn } from '@/lib/utils'

/** Mirrored selfie view with an oval guide; the ring turns green when the face is accepted. */
export function FaceViewport({
  videoRef,
  cameraState,
  cameraMessage,
  loadingModels,
  ok,
  zoom = 1,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  cameraState: CameraState
  cameraMessage: string
  loadingModels?: boolean
  ok?: boolean
  /** Digital zoom, so what the person sees is exactly the central part that is being read. */
  zoom?: number
}) {
  const ready = cameraState === 'ready'
  return (
    <div className="relative h-72 w-72 overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
      <video
        ref={videoRef}
        muted
        playsInline
        className={cn('h-full w-full -scale-x-100 object-cover', !ready && 'invisible')}
        // Mirrored like a selfie view; the inline transform replaces the class one to add the zoom.
        style={zoom > 1 ? { transform: `scale(${-zoom}, ${zoom})` } : undefined}
      />
      {ready ? (
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <defs>
            <mask id="face-cut">
              <rect width="100" height="100" fill="white" />
              <ellipse cx="50" cy="48" rx="26" ry="34" fill="black" />
            </mask>
          </defs>
          <rect width="100" height="100" fill="rgba(15,23,42,0.55)" mask="url(#face-cut)" />
          <ellipse
            cx="50"
            cy="48"
            rx="26"
            ry="34"
            fill="none"
            stroke={ok ? '#34d399' : 'rgba(255,255,255,0.75)'}
            strokeWidth="1.2"
            strokeDasharray={ok ? undefined : '3 2.5'}
          />
        </svg>
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
