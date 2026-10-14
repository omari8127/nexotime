import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Play, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FaceViewport } from '@/components/clock/FaceViewport'
import { CameraTools, FacePrivacyNote, FaceStatus, FaceSteps, type FaceTone } from '@/components/clock/FacePanelParts'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useCameraView, useRotationSearch } from '@/hooks/useCameraView'
import { useAutoFrame } from '@/hooks/useAutoFrame'
import { GET_READY_SECONDS, GetReadyOverlay, useGetReady } from '@/hooks/useGetReady'
import { videoFrameCanvas } from '@/lib/camera'
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
} from '@/lib/face'
import { ClaimSession } from '@/lib/faceSession'
import { encodePhotoCapture, KIOSK_PHOTO_MAX_SIDE, type PhotoCapture } from '@/lib/photoEvidence'
import type { ResolvedKioskSettings } from '@/lib/kiosk'
import { useVoice } from '@/lib/speech'
import { useDataStore } from '@/store/dataStore'
import type { Employee } from '@/types'

/** How a verification ended (what the clock and the audit trail need to know). */
export interface FaceVerification {
  photo: PhotoCapture
  /** Distance to the enrolled face; undefined when this was only a photo for the record. */
  distance?: number
}

type Stage = 'loading' | 'searching' | 'verified' | 'rejected' | 'failed'

/** Hints that ask the person to fix something (shown in amber, not as a plain instruction). */
const WARN_HINTS = new Set<string>([
  ...Object.values(QUALITY_TEXT),
  'Debe haber una sola persona frente a la cámara',
  'No se pudo leer la imagen. Mantente frente a la cámara.',
])

const ACTIVE_DELAY_MS = 40
const IDLE_DELAY_MS = 160
/** Clear, well-framed readings in a row that do not match before it is declared "not this person". */
const MISMATCH_FRAMES = 10
const MISMATCH_MIN_MS = 2500
/** A photo only for the record: a good frame held this long (so it is sharp and not mid-blink). */
const EVIDENCE_HOLD_MS = 1500
/** Shows the green "verificado" state this long before moving on. */
const VERIFIED_PAUSE_MS = 1500
/** Nobody did anything for this long: back to the start screen, the PIN stays unused. */
const GIVE_UP_MS = 60_000
const REJECT_LOG_COOLDOWN_MS = 30_000

/**
 * The step after number + PIN: a photo of whoever is at the clock.
 *  - 'verify': compared with the enrolled face of the employee whose number and PIN were entered
 *    (1:1). Registers only if it is them.
 *  - 'evidence': the employee has no enrolled face yet, so there is nothing to compare; a good photo
 *    is taken for the record (entries by number/PIN require it).
 */
export function FaceVerifyFlow({
  employee,
  employees,
  settings,
  mode,
  onSkip,
  stepLabel,
  photoNote,
  onVerified,
  onCancel,
}: {
  employee: Employee
  /** Everyone who can be recognised: used to tell "not you" from "someone else". */
  employees: Employee[]
  settings: ResolvedKioskSettings
  mode: 'verify' | 'evidence'
  /** The photo is saved with the movement (an entry); otherwise it is only shown once, never stored. */
  keepPhoto: boolean
  /** Only where the photo is not required (anything but an entry by number/PIN): register without it
   *  when the camera cannot be used. Offered once the camera or the reading has failed. */
  onSkip?: () => void
  /** Replaces the "Paso 3 de 3 · …" line where this is not the third step of the kiosk (employee portal). */
  stepLabel?: string
  /** Replaces the sentence that says what happens with the photo. */
  photoNote?: string
  onVerified: (result: FaceVerification) => void
  onCancel: () => void
}) {
  const candidates = useMemo(() => faceCandidates(employees), [employees])
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const { videoRef, state: cameraState, message: cameraMessage, size, restart } = useCameraStream(true, {
    hd: true,
    facingMode,
  })
  const [stage, setStage] = useState<Stage>('loading')
  const [hint, setHint] = useState('Mira a la cámara')
  /** 0–1 while the face is being confirmed (or the photo held still); 0 otherwise. */
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [rejections, setRejections] = useState(0)
  const [rejectedAsOther, setRejectedAsOther] = useState(false)
  const { say, beep } = useVoice('kiosk')
  // Time to get in place before anything is read or taken (see useGetReady).
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

  const settingsRef = useRef(settings)
  const candidatesRef = useRef(candidates)
  const verifiedRef = useRef(onVerified)
  const lastRejectLog = useRef(0)
  useEffect(() => {
    settingsRef.current = settings
    candidatesRef.current = candidates
    verifiedRef.current = onVerified
  })

  // Spoken instructions (only when switched on at this device).
  useEffect(() => {
    if (stage === 'searching' && hint) say(hint, { repeatAfterMs: 12_000 })
  }, [stage, hint, say])

  // Nobody is here any more: do not leave a pending identity on the screen.
  useEffect(() => {
    if (stage === 'verified') return
    const id = window.setTimeout(onCancel, GIVE_UP_MS)
    return () => clearTimeout(id)
  }, [stage, attempt, onCancel])

  useEffect(() => {
    if (cameraState !== 'ready' || !ready) return
    const video = videoRef.current
    if (!video) return
    let alive = true
    let timer: number | undefined
    let doneTimer: number | undefined

    const finish = (distance?: number) => {
      alive = false
      try {
        const photo = encodePhotoCapture(videoFrameCanvas(video, KIOSK_PHOTO_MAX_SIDE, rotationRef.current), KIOSK_PHOTO_MAX_SIDE)
        setStage('verified')
        setHint(mode === 'verify' ? 'Rostro verificado' : 'Foto tomada')
        beep()
        doneTimer = window.setTimeout(() => verifiedRef.current({ photo, distance }), VERIFIED_PAUSE_MS)
      } catch (error) {
        setStage('failed')
        setHint(error instanceof Error ? error.message : 'No se pudo tomar la foto. Reintenta.')
      }
    }

    const reject = (other: boolean, detail: string) => {
      alive = false
      setRejectedAsOther(other)
      setRejections((n) => n + 1)
      setStage('rejected')
      setHint(other ? 'Este rostro no corresponde a esa persona' : 'No coincide con el rostro registrado')
      if (Date.now() - lastRejectLog.current >= REJECT_LOG_COOLDOWN_MS) {
        lastRejectLog.current = Date.now()
        logAudit(
          {
            action: 'face.rejected',
            entityType: 'Reloj',
            entityId: 'kiosk',
            entityLabel: 'Reloj checador',
            reason: `Número y PIN de ${employee.fullName} (${employee.employeeNumber}): ${detail}`,
            changes: [],
          },
          currentUser,
        )
      }
    }

    const run = async () => {
      let api: FaceApi
      try {
        api = await loadFaceApi()
      } catch {
        if (alive) {
          setHint('No se pudo cargar el reconocimiento facial. Revisa la conexión y reintenta.')
          setStage('failed')
        }
        return
      }
      if (!alive) return
      apiRef.current = api
      setStage('searching')
      setHint('Mira a la cámara')
      setProgress(0)

      const session = new ClaimSession(candidatesRef.current, employee.id)
      let clearSince = 0
      let mismatches = 0
      let goodSince = 0
      let errors = 0

      const loop = async () => {
        if (!alive) return
        let delay = ACTIVE_DELAY_MS
        try {
          const { faceStrictness, faceThreshold } = settingsRef.current
          const tuning = tuningFor(faceStrictness, faceThreshold)
          const started = performance.now()
          const result = await readFace(api, video, mode === 'verify', 'accurate', {
            zoom: frameRef.current.zoomRef.current,
            minConfidence: tuning.minConfidence,
            sharpness: true,
            rotation: rotationRef.current,
            fitAspect: aspectRef.current,
          })
          if (!alive) return
          errors = 0
          noteReadingRef.current(result.kind !== 'none')
          frameRef.current.note(result)
          delay = paceDelay(performance.now() - started, result.kind === 'none' ? IDLE_DELAY_MS : ACTIVE_DELAY_MS, 600, result.kind === 'none' ? 1.5 : 0.8)

          if (result.kind !== 'face') setProgress(0)
          if (result.kind === 'none') {
            session.reset()
            clearSince = goodSince = mismatches = 0
            setHint('Coloca tu rostro dentro del óvalo')
          } else if (result.kind === 'multiple') {
            session.reset()
            clearSince = goodSince = mismatches = 0
            setHint('Debe haber una sola persona frente a la cámara')
          } else {
            const issues = frameRef.current.relevant(
              qualityIssues(result.reading, { blur: true, ...distanceProfile(settingsRef.current.faceDistance, tuning) }),
            )
            const descriptor = result.reading.descriptor
            if (issues.length > 0 || (mode === 'verify' && !descriptor)) {
              session.reset()
              goodSince = 0
              setProgress(0)
              setHint(issues.length ? QUALITY_TEXT[issues[0]] : 'Mira a la cámara')
            } else if (mode === 'evidence') {
              goodSince ||= Date.now()
              const left = Math.max(0, Math.ceil((EVIDENCE_HOLD_MS - (Date.now() - goodSince)) / 500))
              if (left === 0) return finish()
              setProgress(Math.min(1, (Date.now() - goodSince) / EVIDENCE_HOLD_MS))
              setHint('Mantente quieto, tomando la foto')
            } else if (descriptor) {
              clearSince ||= Date.now()
              const evidence = session.push(descriptor, tuning)
              if (evidence.accepted && evidence.verdict.kind === 'match') return finish(evidence.verdict.distance)
              if (evidence.verdict.kind === 'match') {
                mismatches = 0
                setProgress(evidence.progress / evidence.required)
                setHint('Mantente quieto')
              } else if (evidence.verdict.kind === 'not_enrolled') {
                alive = false
                setStage('failed')
                setHint('Este empleado no tiene rostro registrado.')
                return
              } else {
                mismatches += 1
                setProgress(0)
                setHint('Mira de frente a la cámara')
                if (mismatches >= MISMATCH_FRAMES && Date.now() - clearSince >= MISMATCH_MIN_MS) {
                  const d = evidence.verdict.distance.toFixed(2)
                  if (evidence.verdict.kind === 'other') {
                    return reject(true, `el rostro se parece más a ${evidence.verdict.other.fullName} (distancia ${d}).`)
                  }
                  return reject(false, `el rostro no coincide con el registrado (distancia ${d}, límite ${tuning.threshold.toFixed(2)}).`)
                }
              }
            }
          }
        } catch {
          session.reset()
          if (!alive) return
          if (++errors >= 3) {
            setHint('No se pueden analizar imágenes de la cámara. Reintenta.')
            setStage('failed')
            return
          }
          setProgress(0)
          setHint('No se pudo leer la imagen. Mantente frente a la cámara.')
        }
        timer = window.setTimeout(loop, delay)
      }
      void loop()
    }
    void run()

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      if (doneTimer) clearTimeout(doneTimer)
    }
  }, [cameraState, ready, attempt, videoRef, employee, mode, beep, logAudit, currentUser])

  const retry = () => {
    setStage('loading')
    setAttempt((n) => n + 1)
  }
  const first = employee.firstName
  const title =
    stage === 'verified'
      ? mode === 'verify' ? `Rostro verificado, ${first}` : `Foto lista, ${first}`
      : stage === 'rejected'
        ? rejectedAsOther ? 'Ese rostro es de otra persona' : `No coincide con el rostro de ${first}`
        : mode === 'verify' ? `${first}, mira a la cámara` : `${first}, mira a la cámara para tu foto`

  const counting = cameraState === 'ready' && !ready
  const broken = stage === 'failed' || cameraState === 'error'
  const status: { tone: FaceTone; title: string; detail?: string; progress?: number } =
    stage === 'verified'
      ? { tone: 'ok', title, detail: mode === 'verify' ? 'Eres tú. Registrando…' : 'Registrando…' }
      : stage === 'rejected'
        ? {
            tone: 'rejected',
            title: `No se registró nada · ${title}`,
            detail:
              (rejectedAsOther
                ? 'Cada persona debe registrar su propia asistencia con su número y PIN.'
                : 'Mira de frente, con buena luz y sin gorra ni lentes oscuros, e inténtalo de nuevo.') +
              (rejections >= 2 ? ' Si sigue sin reconocerte, avisa a tu supervisor para que vuelva a registrar tu rostro.' : ''),
          }
        : broken
          ? { tone: 'error', title: cameraState === 'error' ? 'Revisa la cámara' : 'No se pudo continuar', detail: stage === 'failed' ? hint : cameraMessage }
          : cameraState !== 'ready'
            ? { tone: 'wait', title: 'Encendiendo la cámara…' }
            : counting
              ? { tone: 'ready', title, detail: `Pon tu cara dentro del óvalo. Empezamos en ${left} s.`, progress: 1 - left / GET_READY_SECONDS }
              : stage === 'loading'
                ? { tone: 'wait', title: 'Preparando…', detail: 'Solo tarda unos segundos.' }
                : progress > 0
                  ? { tone: 'progress', title: hint, detail: mode === 'verify' ? 'Comprobando que eres tú.' : 'Tomando tu foto.', progress }
                  : WARN_HINTS.has(hint)
                    ? { tone: 'warn', title: hint }
                    : { tone: 'scan', title, detail: hint }

  return (
    // Held upright: the camera on top, the text and buttons under it. Held sideways: side by side.
    <div className="flex flex-col items-center gap-5 text-center landscape:flex-row landscape:items-center landscape:gap-8 landscape:text-left">
      <div className="w-full landscape:w-[55%] landscape:shrink-0">
        <FaceViewport
          videoRef={videoRef}
          cameraState={cameraState}
          cameraMessage={cameraMessage}
          loadingModels={stage === 'loading' && ready}
          overlay={!ready ? <GetReadyOverlay left={left} /> : undefined}
          ok={stage === 'verified'}
          scanning={stage === 'searching' && ready}
          zoom={frame.zoom}
          rotation={view.rotation}
          aspect={view.aspect}
        />
      </div>

      <div className="flex w-full min-w-0 flex-col items-center gap-4 landscape:flex-1 landscape:items-stretch">
        <FaceSteps step={stage === 'verified' ? 3 : counting || cameraState !== 'ready' ? 1 : 2} />
        <FaceStatus
          tone={status.tone}
          eyebrow={stepLabel ?? (mode === 'verify' ? 'Paso 3 de 3 · Verificación de identidad' : 'Paso 3 de 3 · Foto de entrada')}
          title={status.title}
          detail={status.detail}
          progress={status.progress}
        />

        <div className="flex w-full flex-wrap gap-3">
          {stage === 'rejected' || broken ? (
            <Button
              size="lg"
              className="flex-1 gap-2"
              onClick={() => {
                if (cameraState === 'error') restart()
                retry()
              }}
            >
              <RefreshCw className="h-5 w-5" />
              {stage === 'rejected' ? 'Intentar de nuevo' : 'Reintentar'}
            </Button>
          ) : null}
          {counting ? (
            <Button size="lg" className="flex-1 gap-2 bg-indigo-600 shadow-lg shadow-indigo-600/25 hover:bg-indigo-700" onClick={skip}>
              <Play className="h-5 w-5" />
              Empezar ya
            </Button>
          ) : null}
          {onSkip && mode === 'evidence' && broken ? (
            <Button variant="outline" size="lg" className="flex-1 gap-2" onClick={onSkip}>
              <Camera className="h-5 w-5" />
              Registrar sin foto
            </Button>
          ) : null}
          {stage !== 'verified' ? (
            <Button variant="outline" size="lg" className="flex-1 gap-2" onClick={onCancel}>
              <X className="h-5 w-5" />
              Cancelar
            </Button>
          ) : null}
        </div>

        {stage !== 'verified' ? (
          <CameraTools
            onSwitch={() => {
              setStage('loading')
              setFacingMode((v) => (v === 'user' ? 'environment' : 'user'))
            }}
            onRotate={view.rotate}
            rotation={view.rotation}
          />
        ) : null}
        <FacePrivacyNote>{photoNote ?? 'Esta foto se guarda con tu registro, para que la empresa pueda comprobar quién checó.'}</FacePrivacyNote>
      </div>
    </div>
  )
}
