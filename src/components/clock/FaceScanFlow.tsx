import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FaceViewport } from '@/components/clock/FaceViewport'
import { captureVideoFrame } from '@/lib/camera'
import { VoiceToggle } from '@/components/shared/VoiceToggle'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useVoice } from '@/lib/speech'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import {
  QUALITY_TEXT,
  faceCandidates,
  isConfidentMatch,
  loadFaceApi,
  matchPercent,
  meanDescriptor,
  nearestFace,
  qualityIssues,
  readFace,
  tuningFor,
  type FaceApi,
  type FaceMatch,
} from '@/lib/face'
import type { ResolvedKioskSettings } from '@/lib/kiosk'
import type { Employee } from '@/types'

type Stage = 'loading' | 'searching' | 'no_faces' | 'failed'

const SMOOTHING_FRAMES = 3
/** Frames of a clear, well-lit face with no trustworthy match before it is logged as rejected. */
const REJECT_FRAMES = 14
const REJECT_LOG_COOLDOWN_MS = 30_000

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
  /** `photo` is a fleeting, in-memory snapshot for the success screen only — not stored. */
  onConfirmed: (employee: Employee, photo?: string) => void
  onCancel: () => void
}) {
  const candidates = useMemo(() => faceCandidates(employees), [employees])
  // A basic (2 MP) camera or a zoomed-in view needs every pixel the camera has.
  const { videoRef, state: cameraState, message: cameraMessage } = useCameraStream(candidates.length > 0, {
    hd: settings.faceZoom > 1 || settings.faceStrictness === 'relaxed',
  })
  const [stage, setStage] = useState<Stage>(candidates.length === 0 ? 'no_faces' : 'loading')
  const [hint, setHint] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [reading, setReading] = useState('')
  const { say } = useVoice('kiosk')
  const logAudit = useDataStore((s) => s.logAudit)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
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
    if (candidatesRef.current.length === 0 || cameraState !== 'ready') return
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
      setStage('searching')
      setHint('Mira a la cámara')

      let recent: number[][] = []
      let streak = 0
      let streakId = ''
      let unknownFrames = 0
      let lastRejectLog = 0
      const reject = (reason: string) => {
        if (Date.now() - lastRejectLog < REJECT_LOG_COOLDOWN_MS) return
        lastRejectLog = Date.now()
        logRef.current(reason)
      }

      const accept = (m: FaceMatch) => {
        alive = false
        confirmRef.current(m.employee, captureVideoFrame(video))
      }

      const loop = async () => {
        if (!alive) return
        try {
          const { faceStrictness, faceThreshold, faceZoom } = settingsRef.current
          const tuning = tuningFor(faceStrictness, faceThreshold)
          const result = await readFace(api, video, true, 'accurate', {
            zoom: faceZoom,
            minConfidence: tuning.minConfidence,
          })
          if (!alive) return

          if (result.kind === 'none') {
            recent = []
            streak = 0
            setHint('Coloca tu rostro dentro del óvalo')
          } else if (result.kind === 'multiple') {
            recent = []
            streak = 0
            setHint('Debe haber una sola persona frente a la cámara')
          } else {
            const issues = qualityIssues(result.reading, { minFace: tuning.minFace })
            if (issues.length > 0 || !result.reading.descriptor) {
              recent = []
              streak = 0
              setHint(issues.length ? QUALITY_TEXT[issues[0]] : 'Mira a la cámara')
            } else {
              recent = [...recent, result.reading.descriptor].slice(-SMOOTHING_FRAMES)
              const m = nearestFace(candidatesRef.current, meanDescriptor(recent))
              if (m) setReading(`Coincidencia ${matchPercent(m.distance)}% · distancia ${m.distance.toFixed(2)} (límite ${tuning.threshold})`)
              const near: FaceMatch | null = m // `m` is narrowed to never in the else branch below
              if (isConfidentMatch(m, tuning)) {
                unknownFrames = 0
                streak = streakId === m.employee.id ? streak + 1 : 1
                streakId = m.employee.id
                if (streak >= tuning.streak) {
                  accept(m)
                  return
                }
              } else {
                streak = 0
                streakId = ''
                if (recent.length >= SMOOTHING_FRAMES) recent = recent.slice(1)
                setHint('Mira a la cámara')
                if (near && ++unknownFrames >= REJECT_FRAMES) {
                  unknownFrames = 0
                  reject(
                    `Rostro no reconocido: mejor coincidencia ${near.distance.toFixed(2)} (límite ${tuning.threshold.toFixed(2)}, ` +
                      `separación ${Number.isFinite(near.runnerUp) ? (near.runnerUp - near.distance).toFixed(2) : 'n/a'}).`,
                  )
                }
              }
            }
          }
        } catch {
          /* a dropped frame is not worth surfacing */
        }
        timer = window.setTimeout(loop, 40)
      }
      loop()
    }
    run()

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [cameraState, attempt, videoRef])

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {stage === 'no_faces' ? (
        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-left">
          <p className="text-[15px] font-semibold text-slate-900">Aún no hay rostros registrados</p>
          <p className="mt-1 text-sm text-slate-500">
            Registra el rostro de cada empleado desde su perfil (botón «Rostro») o desde Configuración →
            Reloj checador. Mientras tanto, usa el código QR, el de barras o el número de empleado.
          </p>
        </div>
      ) : (
        <>
          <FaceViewport
            videoRef={videoRef}
            cameraState={cameraState}
            cameraMessage={cameraMessage}
            loadingModels={stage === 'loading'}
            zoom={settings.faceZoom}
          />
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reconocimiento facial</p>
            <p className="text-lg font-semibold text-slate-900">
              {stage === 'loading' ? 'Preparando…' : hint || 'Mira a la cámara'}
            </p>
            <p className="text-sm text-slate-500">
              Se procesa en este equipo. Al identificarte verás una foto de verificación que no se guarda.
            </p>
            {reading && stage === 'searching' && can('biometrics.manage') ? <p className="font-mono text-[11px] text-slate-400">{reading}</p> : null}
          </div>
        </>
      )}

      <div className="flex w-full gap-3">
        {stage === 'failed' ? (
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        ) : null}
        <VoiceToggle scope="kiosk" compact />
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
