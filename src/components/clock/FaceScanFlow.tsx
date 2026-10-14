import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FaceViewport } from '@/components/clock/FaceViewport'
import { videoFrameCanvas } from '@/lib/camera'
import { encodePhotoCapture, KIOSK_PHOTO_MAX_SIDE, type PhotoCapture } from '@/lib/photoEvidence'
import { VoiceToggle } from '@/components/shared/VoiceToggle'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useCameraView, useRotationSearch } from '@/hooks/useCameraView'
import { useAutoFrame } from '@/hooks/useAutoFrame'
import { GetReadyOverlay, useGetReady } from '@/hooks/useGetReady'
import { useVoice } from '@/lib/speech'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import {
  QUALITY_TEXT,
  distanceProfile,
  faceCandidates,
  findFaceRotation,
  loadFaceApi,
  paceDelay,
  qualityIssues,
  readFace,
  tuningFor,
  type FaceApi,
  type FaceMatch,
} from '@/lib/face'
import { FaceSession } from '@/lib/faceSession'
import type { ResolvedKioskSettings } from '@/lib/kiosk'
import type { Employee } from '@/types'

type Stage = 'loading' | 'searching' | 'failed'

/** Frames of a clear, well-lit face with no trustworthy match before it is logged as rejected. */
const REJECT_FRAMES = 14
const REJECT_LOG_COOLDOWN_MS = 30_000
/** Shortest pause between readings while someone is being matched / while nobody is in front of the camera.
 *  While matching it grows with how long a reading took (see paceDelay), so the preview stays smooth. */
const ACTIVE_DELAY_MS = 40
const IDLE_DELAY_MS = 160

/**
 * Identify by face, hands-free: find the closest enrolled face on a short average of frames
 * (steadier than a single frame), trust only a clear, repeated match that is also clearly
 * closer than anyone else, and hand the identified employee to the clock, which shows the
 * verification photo and registers the movement.
 */
export function FaceScanFlow({
  employees,
  settings,
  onConfirmed,
  onCancel,
}: {
  employees: Employee[]
  settings: ResolvedKioskSettings
  /** `photo` is the frame the person was recognised in: it is saved with the movement. */
  onConfirmed: (employee: Employee, photo?: PhotoCapture) => void
  onCancel: () => void
}) {
  const candidates = useMemo(() => faceCandidates(employees), [employees])
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const { videoRef, state: cameraState, message: cameraMessage, resolution, size, restart } = useCameraStream(candidates.length > 0, {
    hd: true, facingMode,
  })
  const [stage, setStage] = useState<Stage>('loading')
  const [hint, setHint] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [reading, setReading] = useState('')
  const { say } = useVoice('kiosk')
  // The camera shows the person first and only then starts looking: a few seconds to get in place.
  const { left, ready, skip } = useGetReady(cameraState === 'ready', attempt)
  // The picture as it must be shown and read on this device, held this way (sideways cameras included).
  const view = useCameraView(size, settings.faceDistance)
  // Automatic framing: the zoom follows how close the face is (or stays at the configured zoom).
  const frame = useAutoFrame({ distance: settings.faceDistance, baseZoom: settings.faceZoom, aspect: view.aspect })
  const frameRef = useRef(frame)
  useEffect(() => {
    frameRef.current = frame
  })
  const rotationRef = useRef(view.rotation)
  const aspectRef = useRef(view.aspect)
  const apiRef = useRef<FaceApi | null>(null)
  useEffect(() => {
    rotationRef.current = view.rotation
    aspectRef.current = view.aspect
  })
  const noteReading = useRotationSearch({
    enabled: stage === 'searching' && ready,
    rotation: view.rotation,
    setRotation: view.setRotation,
    probe: async (current) => {
      const api = apiRef.current
      const video = videoRef.current
      return api && video ? findFaceRotation(api, video, current) : null
    },
  })
  const noteReadingRef = useRef(noteReading)
  useEffect(() => {
    noteReadingRef.current = noteReading
  })
  const logAudit = useDataStore((s) => s.logAudit)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  // The technical reading line is for administrators only: do not re-render on every frame for nobody.
  const showReading = useRef(false)
  showReading.current = can('biometrics.manage')
  const candidatesRef = useRef(candidates)
  const settingsRef = useRef(settings)
  const confirmRef = useRef(onConfirmed)
  const logRef = useRef((reason: string) => {
    void reason
  })
  useEffect(() => {
    logRef.current = (reason: string) =>
      logAudit(
        {
          action: 'face.rejected',
          entityType: 'Reloj',
          entityId: 'kiosk',
          entityLabel: 'Reloj checador',
          reason,
          changes: [],
        },
        currentUser,
      )
    candidatesRef.current = candidates
    settingsRef.current = settings
    confirmRef.current = onConfirmed
  })

  // Spoken instructions (off unless switched on at this device): hints only when they change,
  // and never the same sentence twice in a row.
  useEffect(() => {
    if (stage === 'searching' && hint) say(hint, { repeatAfterMs: 12_000 })
  }, [stage, hint, say])

  useEffect(() => {
    if (candidatesRef.current.length === 0 || cameraState !== 'ready' || !ready) return
    let alive = true
    let timer: number | undefined
    const video = videoRef.current
    if (!video) return

    const run = async () => {
      let api: FaceApi
      try {
        api = await loadFaceApi()
      } catch {
        if (alive) {
          setHint('No se pudo cargar el reconocimiento facial. Usa QR, código de barras o tu número.')
          setStage('failed')
        }
        return
      }
      if (!alive) return
      apiRef.current = api
      setStage('searching')
      setReading('')
      setHint('Mira a la cámara')

      const session = new FaceSession()
      let errors = 0
      let unknownFrames = 0
      let lastRejectLog = 0
      const reject = (reason: string) => {
        if (Date.now() - lastRejectLog < REJECT_LOG_COOLDOWN_MS) return
        lastRejectLog = Date.now()
        logRef.current(reason)
      }

      const accept = (m: FaceMatch) => {
        alive = false
        let photo: PhotoCapture | undefined
        try {
          photo = encodePhotoCapture(videoFrameCanvas(video, KIOSK_PHOTO_MAX_SIDE, rotationRef.current), KIOSK_PHOTO_MAX_SIDE)
        } catch {
          photo = undefined // recognised: the movement goes through even if the photo could not be made
        }
        confirmRef.current(m.employee, photo)
      }

      let nextDelay = ACTIVE_DELAY_MS
      const loop = async () => {
        if (!alive) return
        try {
          const { faceStrictness, faceThreshold } = settingsRef.current
          const tuning = tuningFor(faceStrictness, faceThreshold)
          const startedAt = performance.now()
          const result = await readFace(api, video, true, 'accurate', {
            zoom: frameRef.current.zoomRef.current,
            minConfidence: tuning.minConfidence,
            rotation: rotationRef.current,
            fitAspect: aspectRef.current,
          })
          if (!alive) return
          errors = 0
          noteReadingRef.current(result.kind !== 'none')
          frameRef.current.note(result)
          // Nobody in front of the camera: look less often (saves the tablet's CPU/battery); the
          // moment a face appears, the loop runs at full speed again.
          nextDelay = paceDelay(performance.now() - startedAt, result.kind === 'none' ? IDLE_DELAY_MS : ACTIVE_DELAY_MS, 600, result.kind === 'none' ? 1.5 : 0.8)

          if (result.kind === 'none') {
            session.reset()
            unknownFrames = 0
            setReading('')
            setHint('Coloca tu rostro dentro del óvalo')
          } else if (result.kind === 'multiple') {
            session.reset()
            unknownFrames = 0
            setReading('')
            setHint('Debe haber una sola persona frente a la cámara')
          } else {
            const issues = frameRef.current.relevant(
              qualityIssues(result.reading, { blur: true, ...distanceProfile(settingsRef.current.faceDistance, tuning) }),
            )
            if (issues.length > 0 || !result.reading.descriptor) {
              session.reset()
              unknownFrames = 0
              setReading('')
              setHint(issues.length ? QUALITY_TEXT[issues[0]] : 'Mira a la cámara')
            } else {
              const evidence = session.push(candidatesRef.current, result.reading.descriptor, tuning)
              const near = evidence.match
              if (near && showReading.current) setReading(`Distancia ${near.distance.toFixed(3)} · límite ${tuning.threshold.toFixed(3)} · ${evidence.progress}/${evidence.required} lecturas`)
              if (evidence.accepted) {
                accept(evidence.accepted)
                return
              }
              if (evidence.progress > 0) {
                unknownFrames = 0
                setHint(`Mantente quieto · verificando ${evidence.progress}/${evidence.required}`)
              } else {
                unknownFrames += 1
                setHint(unknownFrames >= 5
                  ? 'No hay una coincidencia clara. Mira de frente, mejora la luz o usa otro método.'
                  : 'Mira a la cámara')
                if (near && unknownFrames >= REJECT_FRAMES) {
                  unknownFrames = 0
                  reject(`Rostro no reconocido: distancia ${near.distance.toFixed(2)} (límite ${tuning.threshold.toFixed(2)}).`)
                }
              }
            }
          }
        } catch {
          session.reset()
          unknownFrames = 0
          if (!alive) return
          setReading('')
          if (++errors >= 3) {
            setHint('No se pueden analizar imágenes de la cámara. Reintenta o usa QR, código de barras o número + PIN.')
            setStage('failed')
            return
          }
          setHint('No se pudo leer la imagen. Mantente frente a la cámara.')
        }
        timer = window.setTimeout(loop, nextDelay)
      }
      loop()
    }
    run()

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [cameraState, attempt, videoRef, ready])

  const cameraOn = candidates.length > 0
  return (
    // Held upright: the camera on top, the text and buttons under it. Held sideways: side by side.
    <div className="flex flex-col items-center gap-5 text-center landscape:flex-row landscape:items-center landscape:gap-8 landscape:text-left">
      {!cameraOn ? (
        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-left">
          <p className="text-[15px] font-semibold text-slate-900">Aún no hay rostros registrados</p>
          <p className="mt-1 text-sm text-slate-500">
            Registra el rostro de cada empleado desde su perfil (botón «Rostro») o desde Configuración →
            Reloj checador. Mientras tanto, usa el código QR, el de barras o el número de empleado.
          </p>
        </div>
      ) : (
        <div className="w-full landscape:w-[55%] landscape:shrink-0">
          <FaceViewport
            videoRef={videoRef}
            cameraState={cameraState}
            cameraMessage={cameraMessage}
            loadingModels={stage === 'loading' && ready}
            overlay={!ready ? <GetReadyOverlay left={left} /> : undefined}
            zoom={frame.zoom}
            rotation={view.rotation}
            aspect={view.aspect}
          />
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col items-center gap-4 landscape:flex-1 landscape:items-stretch">
        {cameraOn ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reconocimiento facial</p>
            <p className="text-lg font-semibold text-slate-900" role="status">
              {cameraState === 'error'
                ? 'Revisa la cámara'
                : cameraState === 'ready' && !ready
                  ? 'Acomódate frente a la cámara'
                  : stage === 'loading' ? 'Preparando…' : hint || 'Mira a la cámara'}
            </p>
            <p className="text-sm text-slate-500">
              El reconocimiento se hace en este equipo. Se toma una foto y se guarda con tu registro.
            </p>
            {resolution ? <p className="text-xs text-slate-500">Cámara: {resolution}</p> : null}
            {reading && stage === 'searching' && can('biometrics.manage') ? <p className="font-mono text-[11px] text-slate-400">{reading}</p> : null}
          </div>
        ) : null}

        {cameraOn ? (
          <div className="flex flex-wrap justify-center gap-2 landscape:justify-start">
            <Button variant="secondary" onClick={() => { setStage('loading'); setFacingMode((v) => v === 'user' ? 'environment' : 'user') }}>
              Cambiar a cámara {facingMode === 'user' ? 'trasera' : 'frontal'}
            </Button>
            <Button variant="secondary" onClick={view.rotate} title="Si la imagen se ve de lado o de cabeza">
              Girar imagen{view.rotation ? ` (${view.rotation}°)` : ''}
            </Button>
          </div>
        ) : null}
        <div className="flex w-full flex-wrap gap-3">
          {stage === 'failed' || cameraState === 'error' ? (
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => { setStage('loading'); setAttempt((n) => n + 1); restart() }}>
              Reintentar cámara
            </Button>
          ) : null}
          {cameraState === 'ready' && !ready ? (
            <Button size="lg" className="flex-1" onClick={skip}>
              Empezar ya
            </Button>
          ) : null}
          <VoiceToggle scope="kiosk" compact />
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}
