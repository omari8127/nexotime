import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FaceViewport } from '@/components/clock/FaceViewport'
import { captureVideoFrame } from '@/lib/camera'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import {
  BlinkDetector,
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
  turnSide,
  type FaceApi,
  type FaceMatch,
} from '@/lib/face'
import type { ResolvedKioskSettings } from '@/lib/kiosk'
import type { Employee } from '@/types'

type Stage = 'loading' | 'searching' | 'liveness' | 'no_faces' | 'failed'

const LIVENESS_TIMEOUT_MS = 15_000
const SMOOTHING_FRAMES = 3
/** Frames of a clear, well-lit face with no trustworthy match before it is logged as rejected. */
const REJECT_FRAMES = 14
const REJECT_LOG_COOLDOWN_MS = 30_000

/**
 * Identify by face, hands-free:
 *  1. find the closest enrolled face on a short average of frames (steadier than a
 *     single frame), trusting only a clear, repeated match;
 *  2. optionally ask for a blink — a still photo cannot blink — and re-check it is
 *     still the same person;
 *  3. hand the identified employee to the clock, which registers the movement.
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
  const { videoRef, state: cameraState, message: cameraMessage } = useCameraStream(candidates.length > 0)
  const [stage, setStage] = useState<Stage>(candidates.length === 0 ? 'no_faces' : 'loading')
  const [hint, setHint] = useState('')
  const [who, setWho] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [reading, setReading] = useState('')
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
      let identified: FaceMatch | null = null
      let livenessStart = 0
      let unknownFrames = 0
      let lastRejectLog = 0
      let step: 'blink' | 'turn' | 'back' = 'blink'
      const reject = (reason: string) => {
        if (Date.now() - lastRejectLog < REJECT_LOG_COOLDOWN_MS) return
        lastRejectLog = Date.now()
        logRef.current(reason)
      }
      const blink = new BlinkDetector()

      const restart = (message: string) => {
        identified = null
        recent = []
        streak = 0
        streakId = ''
        unknownFrames = 0
        step = 'blink'
        blink.blinks = 0
        setWho(null)
        setStage('searching')
        setHint(message)
      }

      const accept = (m: FaceMatch) => {
        alive = false
        confirmRef.current(m.employee, captureVideoFrame(video))
      }

      const loop = async () => {
        if (!alive) return
        try {
          const { faceStrictness, faceThreshold, faceRequireBlink, faceChallenge } = settingsRef.current
          const tuning = tuningFor(faceStrictness, faceThreshold)
          const result = await readFace(api, video, !identified)
          if (!alive) return

          if (result.kind === 'none') {
            recent = []
            streak = 0
            setHint(identified ? 'Mantén tu rostro frente a la cámara' : 'Coloca tu rostro dentro del óvalo')
          } else if (result.kind === 'multiple') {
            recent = []
            streak = 0
            setHint('Debe haber una sola persona frente a la cámara')
          } else if (!identified) {
            const issues = qualityIssues(result.reading)
            if (issues.length > 0 || !result.reading.descriptor) {
              recent = []
              streak = 0
              setHint(issues.length ? QUALITY_TEXT[issues[0]] : 'Mira a la cámara')
            } else {
              recent = [...recent, result.reading.descriptor].slice(-SMOOTHING_FRAMES)
              const m = nearestFace(candidatesRef.current, meanDescriptor(recent))
              if (m) setReading(`Coincidencia ${matchPercent(m.distance)}% · distancia ${m.distance.toFixed(2)} (límite ${tuning.threshold})`)
              const near: FaceMatch | null = m
              if (isConfidentMatch(m, tuning)) {
                unknownFrames = 0
                streak = streakId === m.employee.id ? streak + 1 : 1
                streakId = m.employee.id
                if (streak >= tuning.streak) {
                  if (!faceRequireBlink) {
                    accept(m)
                    return
                  }
                  identified = m
                  livenessStart = Date.now()
                  setWho(m.employee.firstName)
                  setStage('liveness')
                  setHint('Parpadea una vez para confirmar')
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
          } else {
            // Liveness: the eyes must close and reopen; optionally also turn the head and come back.
            let passed = false
            if (step === 'blink') {
              if (blink.update(result.reading.ear) >= 1) {
                if (faceChallenge) {
                  step = 'turn'
                  setHint('Bien. Ahora gira la cabeza hacia un lado')
                } else passed = true
              }
            } else if (step === 'turn') {
              if (turnSide(result.reading.yaw) !== 0) {
                step = 'back'
                setHint('Ahora vuelve a mirar de frente')
              }
            } else if (turnSide(result.reading.yaw) === 0) {
              passed = true
            }

            if (passed) {
              // Re-verify identity right after the checks so nobody can swap in.
              const again = await readFace(api, video, true)
              if (!alive) return
              const d = again.kind === 'face' ? again.reading.descriptor : undefined
              const m = d ? nearestFace(candidatesRef.current, d) : null
              if (isConfidentMatch(m, tuning) && m.employee.id === identified.employee.id) {
                accept(identified)
                return
              }
              reject('La identidad no se confirmó tras la prueba de vida.')
              restart('No se pudo confirmar tu identidad. Inténtalo de nuevo.')
            } else if (Date.now() - livenessStart > LIVENESS_TIMEOUT_MS) {
              reject(`Prueba de vida no superada (${identified.employee.employeeNumber}): no se detectó el movimiento pedido.`)
              restart('No detectamos el movimiento. Vuelve a intentarlo.')
            }
          }
        } catch {
          /* a dropped frame is not worth surfacing */
        }
        timer = window.setTimeout(loop, identified ? 60 : 110)
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
            ok={stage === 'liveness'}
          />
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {stage === 'liveness' && who ? `Hola, ${who}` : 'Reconocimiento facial'}
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {stage === 'loading' ? 'Preparando…' : hint || 'Mira a la cámara'}
            </p>
            <p className="text-sm text-slate-500">
              {stage === 'liveness'
                ? 'Comprobamos que eres una persona real.'
                : 'Se procesa en este equipo. Al identificarte verás una foto de verificación que no se guarda.'}
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
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
