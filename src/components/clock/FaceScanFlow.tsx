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
  loadFaceApi,
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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const { videoRef, state: cameraState, message: cameraMessage, resolution, restart } = useCameraStream(candidates.length > 0, {
    hd: true, facingMode,
  })
  const [stage, setStage] = useState<Stage>('loading')
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
          errors = 0

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
            const issues = qualityIssues(result.reading, { blur: true, minFace: tuning.minFace })
            if (issues.length > 0 || !result.reading.descriptor) {
              session.reset()
              unknownFrames = 0
              setReading('')
              setHint(issues.length ? QUALITY_TEXT[issues[0]] : 'Mira a la cámara')
            } else {
              const evidence = session.push(candidatesRef.current, result.reading.descriptor, tuning)
              const near = evidence.match
              if (near) setReading(`Distancia ${near.distance.toFixed(3)} · límite ${tuning.threshold.toFixed(3)} · ${evidence.progress}/${evidence.required} lecturas`)
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
      {candidates.length === 0 ? (
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
              {cameraState === 'error' ? 'Revisa la cámara' : stage === 'loading' ? 'Preparando…' : hint || 'Mira a la cámara'}
            </p>
            <p className="text-sm text-slate-500">
              Se procesa en este equipo. Al identificarte verás una foto de verificación que no se guarda.
            </p>
            {resolution ? <p className="text-xs text-slate-500">Cámara: {resolution}</p> : null}
            {reading && stage === 'searching' && can('biometrics.manage') ? <p className="font-mono text-[11px] text-slate-400">{reading}</p> : null}
          </div>
        </>
      )}

      {candidates.length > 0 ? (
        <Button variant="secondary" onClick={() => { setStage('loading'); setFacingMode((v) => v === 'user' ? 'environment' : 'user') }}>
          Cambiar a cámara {facingMode === 'user' ? 'trasera' : 'frontal'}
        </Button>
      ) : null}
      <div className="flex w-full flex-wrap gap-3">
        {stage === 'failed' || cameraState === 'error' ? (
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => { setStage('loading'); setAttempt((n) => n + 1); restart() }}>
            Reintentar cámara
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
