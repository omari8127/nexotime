import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, RefreshCw, UserRoundX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FaceViewport } from '@/components/clock/FaceViewport'
import { CameraTools, FacePrivacyNote, FaceStatus, FaceSteps, type FaceTone } from '@/components/clock/FacePanelParts'
import { videoFrameCanvas } from '@/lib/camera'
import { encodePhotoCapture, KIOSK_PHOTO_MAX_SIDE, type PhotoCapture } from '@/lib/photoEvidence'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useCameraView, useRotationSearch } from '@/hooks/useCameraView'
import { useAutoFrame } from '@/hooks/useAutoFrame'
import { GET_READY_SECONDS, GetReadyOverlay, useGetReady } from '@/hooks/useGetReady'
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
  /** Whether the current hint is an instruction or a problem to fix, and how far the confirmation is (0–1). */
  const [hintKind, setHintKind] = useState<'scan' | 'warn'>('scan')
  const [progress, setProgress] = useState(0)
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
      const show = (text: string, kind: 'scan' | 'warn' = 'scan', done = 0) => {
        setHint(text)
        setHintKind(kind)
        setProgress(done)
      }
      setStage('searching')
      setReading('')
      show('Mira a la cámara')

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
            show('Coloca tu rostro dentro del óvalo')
          } else if (result.kind === 'multiple') {
            session.reset()
            unknownFrames = 0
            setReading('')
            show('Debe haber una sola persona frente a la cámara', 'warn')
          } else {
            const issues = frameRef.current.relevant(
              qualityIssues(result.reading, { blur: true, ...distanceProfile(settingsRef.current.faceDistance, tuning) }),
            )
            if (issues.length > 0 || !result.reading.descriptor) {
              session.reset()
              unknownFrames = 0
              setReading('')
              if (issues.length) show(QUALITY_TEXT[issues[0]], 'warn')
              else show('Mira a la cámara')
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
                show('Mantente quieto', 'scan', evidence.progress / evidence.required)
              } else {
                unknownFrames += 1
                if (unknownFrames >= 5) show('No hay una coincidencia clara. Mira de frente, mejora la luz o usa otro método.', 'warn')
                else show('Mira a la cámara')
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
          show('No se pudo leer la imagen. Mantente frente a la cámara.', 'warn')
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
  const counting = cameraState === 'ready' && !ready
  const broken = stage === 'failed' || cameraState === 'error'
  const status: { tone: FaceTone; title: string; detail?: string; progress?: number } = broken
    ? {
        tone: 'error',
        title: cameraState === 'error' ? 'Revisa la cámara' : 'No se pudo usar el reconocimiento',
        detail: stage === 'failed' ? hint : 'Toca «Reintentar cámara» o usa QR, código de barras o tu número.',
      }
    : cameraState !== 'ready'
      ? { tone: 'wait', title: 'Encendiendo la cámara…' }
      : counting
        ? {
            tone: 'ready',
            title: 'Acomódate frente a la cámara',
            detail: `Pon tu cara dentro del óvalo. Empezamos en ${left} s.`,
            progress: 1 - left / GET_READY_SECONDS,
          }
        : stage === 'loading'
          ? { tone: 'wait', title: 'Preparando el reconocimiento…', detail: 'Solo tarda unos segundos.' }
          : progress > 0
            ? { tone: 'progress', title: 'Mantente quieto…', detail: 'Te estamos reconociendo.', progress }
            : hintKind === 'warn'
              ? { tone: 'warn', title: hint }
              : { tone: 'scan', title: hint || 'Mira a la cámara', detail: 'Con buena luz, de frente y sin gorra ni lentes oscuros.' }

  return (
    // Held upright: the camera on top, the text and buttons under it. Held sideways: side by side.
    // Without a camera (nobody enrolled) the notice and its button simply stack.
    <div
      className={
        cameraOn
          ? 'flex flex-col items-center gap-5 text-center landscape:flex-row landscape:items-center landscape:gap-8 landscape:text-left'
          : 'mx-auto flex w-full max-w-xl flex-col gap-4'
      }
    >
      {!cameraOn ? (
        <div className="flex w-full items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-5 text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-amber-950 shadow-lg shadow-amber-500/30">
            <UserRoundX className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-bold text-amber-950">Aún no hay rostros registrados</p>
            <p className="mt-1 text-sm text-slate-600">
              Registra el rostro de cada empleado desde su perfil (botón «Rostro») o desde Configuración →
              Reloj checador. Mientras tanto, usa el código QR, el de barras o el número de empleado.
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full landscape:w-[55%] landscape:shrink-0">
          <FaceViewport
            videoRef={videoRef}
            cameraState={cameraState}
            cameraMessage={cameraMessage}
            loadingModels={stage === 'loading' && ready}
            overlay={!ready ? <GetReadyOverlay left={left} /> : undefined}
            scanning={stage === 'searching' && ready}
            zoom={frame.zoom}
            rotation={view.rotation}
            aspect={view.aspect}
          />
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col items-center gap-4 landscape:flex-1 landscape:items-stretch">
        {cameraOn ? (
          <>
            <FaceSteps step={counting || cameraState !== 'ready' ? 1 : 2} />
            <FaceStatus tone={status.tone} eyebrow="Reconocimiento facial" title={status.title} detail={status.detail} progress={status.progress} />
            {can('biometrics.manage') && (resolution || (reading && stage === 'searching')) ? (
              <p className="w-full text-left font-mono text-[11px] text-slate-400">
                {resolution ? `Cámara ${resolution}` : ''}
                {reading && stage === 'searching' ? ` · ${reading}` : ''}
              </p>
            ) : null}
          </>
        ) : null}

        <div className="flex w-full flex-wrap gap-3">
          {broken && cameraOn ? (
            <Button size="lg" className="flex-1 gap-2" onClick={() => { setStage('loading'); setAttempt((n) => n + 1); restart() }}>
              <RefreshCw className="h-5 w-5" />
              Reintentar cámara
            </Button>
          ) : null}
          {counting ? (
            <Button size="lg" className="flex-1 gap-2 bg-indigo-600 shadow-lg shadow-indigo-600/25 hover:bg-indigo-700" onClick={skip}>
              <Play className="h-5 w-5" />
              Empezar ya
            </Button>
          ) : null}
          <Button variant="outline" size="lg" className="flex-1 gap-2" onClick={onCancel}>
            <X className="h-5 w-5" />
            {cameraOn ? 'Cancelar' : 'Elegir otro método'}
          </Button>
        </div>

        {cameraOn ? (
          <>
            <CameraTools
              facingMode={facingMode}
              onSwitch={() => { setStage('loading'); setFacingMode((v) => v === 'user' ? 'environment' : 'user') }}
              onRotate={view.rotate}
              rotation={view.rotation}
            />
            <FacePrivacyNote>El reconocimiento se hace en este equipo. Se toma una foto y se guarda con tu registro.</FacePrivacyNote>
          </>
        ) : null}
      </div>
    </div>
  )
}
