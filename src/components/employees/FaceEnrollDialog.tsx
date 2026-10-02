import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Glasses, ScanFace, ShieldCheck, Sun, Trash2, TriangleAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { EnrollCircle } from '@/components/employees/EnrollCircle'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useDataStore } from '@/store/dataStore'
import {
  QUALITY_TEXT,
  tuningFor,
  descriptorDistance,
  faceCandidates,
  loadFaceApi,
  matchPercent,
  meanDescriptor,
  nearestFace,
  qualityIssues,
  readFace,
} from '@/lib/face'
import { resolveKiosk } from '@/lib/kiosk'
import type { Employee } from '@/types'

/** Each sample must show a specific pose, so the set covers small natural variations. */
const STEPS = [
  { pose: 'front', title: 'Mira de frente a la cámara', nudge: 'Mira directo a la cámara' },
  { pose: 'front', title: 'Sonríe ligeramente', nudge: 'Mira de frente y sonríe un poco' },
  { pose: 'turn', title: 'Gira la cabeza un poco hacia un lado', nudge: 'Gira despacio, solo un poco más' },
  { pose: 'opposite', title: 'Ahora hacia el lado contrario', nudge: 'Gira hacia el otro lado' },
  { pose: 'front', title: 'Vuelve a mirar de frente', nudge: 'Mira directo a la cámara' },
] as const

const SAMPLE_GAP_MS = 500
/** Good frames in a row before a sample is taken: this is the visible "hold still" moment. */
const STABLE_FRAMES = 6
/** Frames averaged into each saved sample (averages out frame-to-frame noise). */
const SAMPLE_FRAMES = 3
/** Bad frames in a row tolerated before the hold progress restarts, so one flicker doesn't reset it. */
const MISS_TOLERANCE = 3
/** Head-turn gates are relative to the person's own straight-ahead yaw (learned on step 1):
 *  natural faces are not symmetric, so an absolute "yaw ≈ 1" can never be met by some people. */
const TURN_MIN = 0.13
const FIRST_FRONT_TOL = 0.35
const SAME_PERSON_FRONT = 0.42
const SAME_PERSON_TURNED = 0.5
const DUPLICATE_DISTANCE = 0.42
const TEST_TIMEOUT_MS = 9000

type Stage = 'intro' | 'capture' | 'test'

const TIPS = [
  { Icon: Sun, text: 'Busca buena luz de frente, sin ventanas ni focos a tu espalda.' },
  { Icon: Glasses, text: 'Sin lentes oscuros, gorra ni cubrebocas. Los lentes graduados están bien.' },
  { Icon: ScanFace, text: 'Mueve la cabeza despacio, como te pida cada paso. Se captura solo.' },
]

/**
 * Guided face enrollment: consent → 5 posed samples around a Face-ID style dial →
 * an immediate recognition test. Stores descriptors only (never photos). Biometric
 * data is sensitive under Mexican privacy law, so consent is recorded in the audit log.
 */
export function FaceEnrollDialog({
  open,
  onOpenChange,
  employee,
  testOnly = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee
  /** Skip enrollment and only check that the saved face is recognised. */
  testOnly?: boolean
}) {
  const currentUser = useDataStore((s) => s.currentUser)
  const allEmployees = useDataStore((s) => s.employees)
  const enroll = useDataStore((s) => s.enrollFace)
  const remove = useDataStore((s) => s.removeFace)
  const settings = useDataStore((s) => s.company.attendanceSettings)

  const hasFace = !!employee.identifications.find((i) => i.method === 'face')?.descriptors?.length

  const [stage, setStage] = useState<Stage>(testOnly ? 'test' : 'intro')
  const [consent, setConsent] = useState(false)
  const [count, setCount] = useState(0)
  const [hold, setHold] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [loadingModels, setLoadingModels] = useState(false)
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; percent?: number } | null>(null)
  const saved = useRef<number[][]>(
    testOnly ? (employee.identifications.find((i) => i.method === 'face')?.descriptors ?? []) : [],
  )

  const cameraOn = open && stage !== 'intro'
  const { videoRef, state: cameraState, message } = useCameraStream(cameraOn)

  const others = useMemo(
    () => faceCandidates(allEmployees.filter((e) => e.id !== employee.id)),
    [allEmployees, employee.id],
  )
  const othersRef = useRef(others)
  useEffect(() => {
    othersRef.current = others
  })

  useEffect(() => {
    if (!open) {
      setStage(testOnly ? 'test' : 'intro')
      setConsent(false)
      setCount(0)
      setHold(0)
      setHint('')
      setError('')
      setTestResult(null)
      setLoadingModels(false)
    }
  }, [open])

  /* ------------------------------- capture ------------------------------- */
  useEffect(() => {
    if (stage !== 'capture' || cameraState !== 'ready') return
    let alive = true
    let timer: number | undefined
    let stageTimer: number | undefined
    const video = videoRef.current
    if (!video) return
    const samples: number[][] = []
    let lastAccepted = 0
    let stable = 0
    let misses = 0
    let firstTurnSide = 0
    let baseLogYaw = 0
    const yawLog: number[] = []

    const restartHold = () => {
      stable = 0
      misses = 0
      setHold(0)
    }
    const fail = (msg: string) => {
      setError(msg)
      setStage('intro')
    }

    const run = async () => {
      setLoadingModels(true)
      let api
      try {
        api = await loadFaceApi()
      } catch {
        if (alive) fail('No se pudo cargar el reconocimiento facial. Revisa la conexión e inténtalo de nuevo.')
        return
      }
      if (!alive) return
      setLoadingModels(false)
      setHint('')

      const loop = async () => {
        if (!alive) return
        let finished = false
        try {
          // Cheap pass first (no descriptor): is there one clear face in the right pose?
          const result = await readFace(api, video, false)
          if (!alive) return
          const step = STEPS[samples.length]
          if (result.kind !== 'face') {
            if (++misses >= MISS_TOLERANCE) {
              stable = 0
              setHold(0)
            }
            setHint(result.kind === 'none' ? 'Coloca tu rostro dentro del círculo' : 'Debe aparecer una sola persona')
          } else {
            const r = result.reading
            const issues = qualityIssues(r, { blur: true })
            const rel = Math.log(r.yaw) - baseLogYaw
            const side = Math.abs(rel) < TURN_MIN ? 0 : rel < 0 ? -1 : 1
            const poseOk =
              samples.length === 0
                ? Math.abs(rel) < FIRST_FRONT_TOL
                : step.pose === 'front'
                  ? side === 0
                  : step.pose === 'turn'
                    ? side !== 0
                    : side !== 0 && side === -firstTurnSide
            if (issues.length > 0 || !poseOk) {
              if (++misses >= MISS_TOLERANCE) {
                stable = 0
                setHold(0)
              }
              setHint(issues.length > 0 ? QUALITY_TEXT[issues[0]] : step.nudge)
            } else {
              misses = 0
              stable += 1
              yawLog.push(Math.log(r.yaw))
              setHold(Math.min(1, stable / STABLE_FRAMES))
              setHint('Perfecto, no te muevas…')

              if (stable >= STABLE_FRAMES && Date.now() - lastAccepted >= SAMPLE_GAP_MS) {
                // Hold complete: read a few frames with descriptors and average them.
                const frames: number[][] = []
                for (let i = 0; i < SAMPLE_FRAMES && alive; i++) {
                  const again = await readFace(api, video, true)
                  if (
                    again.kind === 'face' &&
                    again.reading.descriptor &&
                    qualityIssues(again.reading, { blur: true }).length === 0
                  ) {
                    frames.push(again.reading.descriptor)
                  }
                }
                if (!alive) return
                if (frames.length < 2) {
                  restartHold()
                  setHint('No alcanzamos a verte bien. Mantén la posición.')
                } else {
                  const d = meanDescriptor(frames)
                  const limit = step.pose === 'front' ? SAME_PERSON_FRONT : SAME_PERSON_TURNED
                  if (samples.length > 0 && descriptorDistance(samples[0], d) > limit) {
                    restartHold()
                    setHint('Mantén el mismo rostro frente a la cámara')
                  } else {
                    const twin = othersRef.current.find((c) =>
                      c.descriptors.some((x) => descriptorDistance(x, d) < DUPLICATE_DISTANCE),
                    )
                    if (twin) {
                      fail(`Este rostro ya está registrado para ${twin.employee.fullName}.`)
                      return
                    }
                    if (step.pose === 'turn') firstTurnSide = side
                    if (samples.length === 0) {
                      const recent = yawLog.slice(-STABLE_FRAMES)
                      baseLogYaw = recent.reduce((a, b) => a + b, 0) / recent.length
                    }
                    samples.push(d)
                    lastAccepted = Date.now()
                    stable = 0
                    misses = 0
                    setHold(0)
                    setCount(samples.length)
                    setFlashKey((n) => n + 1)
                    if (samples.length >= STEPS.length) {
                      saved.current = samples
                      enroll(employee.id, samples, currentUser)
                      setTestResult(null)
                      setHint('')
                      finished = true
                      // Let the last segment light up before moving on.
                      stageTimer = window.setTimeout(() => {
                        if (alive) setStage('test')
                      }, 900)
                    } else {
                      setHint('')
                    }
                  }
                }
              }
            }
          }
        } catch {
          /* skip a bad frame */
        }
        if (!finished && alive) timer = window.setTimeout(loop, 80)
      }
      loop()
    }
    run()

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      if (stageTimer) clearTimeout(stageTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cameraState])

  /* --------------------------------- test -------------------------------- */
  useEffect(() => {
    if (stage !== 'test' || cameraState !== 'ready') return
    let alive = true
    let timer: number | undefined
    const video = videoRef.current
    if (!video) return
    const started = Date.now()
    const candidate = [{ employee, descriptors: saved.current }]

    const run = async () => {
      setLoadingModels(true)
      const api = await loadFaceApi().catch(() => null)
      if (!alive) return
      setLoadingModels(false)
      if (!api) return
      const loop = async () => {
        if (!alive) return
        try {
          const result = await readFace(api, video, true)
          if (!alive) return
          if (result.kind === 'face' && result.reading.descriptor) {
            const m = nearestFace(candidate, result.reading.descriptor)
            const kiosk = resolveKiosk(settings)
            if (m && m.distance < tuningFor(kiosk.faceStrictness, kiosk.faceThreshold).threshold) {
              setTestResult({ ok: true, percent: matchPercent(m.distance) })
              return
            }
          }
        } catch {
          /* ignore */
        }
        if (Date.now() - started > TEST_TIMEOUT_MS) {
          setTestResult({ ok: false })
          return
        }
        timer = window.setTimeout(loop, 150)
      }
      loop()
    }
    run()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cameraState])

  const currentStep = STEPS[Math.min(count, STEPS.length - 1)]
  const turning =
    stage === 'capture' && (currentStep.pose === 'turn' || currentStep.pose === 'opposite') && count < STEPS.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage === 'intro' ? 'Registro facial' : `Reconocimiento facial de ${employee.firstName}`}
          </DialogTitle>
          <DialogDescription>
            {stage === 'test'
              ? testOnly
                ? 'Mira a la cámara para comprobar que el rostro guardado se reconoce.'
                : 'Rostro guardado. Comprobemos que se reconoce bien.'
              : stage === 'capture'
                ? 'Sigue las indicaciones. No hace falta tocar nada.'
                : hasFace
                  ? `${employee.firstName} ya tiene un rostro registrado. Puedes actualizarlo o eliminarlo.`
                  : `Registra el rostro de ${employee.firstName} para que pueda checar con la cámara del reloj.`}
          </DialogDescription>
        </DialogHeader>

        {stage === 'intro' ? (
          <div className="space-y-5">
            <div className="flex justify-center py-1">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-ping [animation-duration:2.4s]" />
                <span className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-primary to-sky-400 text-white shadow-lg shadow-primary/30">
                  <ScanFace className="h-12 w-12" strokeWidth={1.6} />
                </span>
              </div>
            </div>
            <ul className="space-y-3">
              {TIPS.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm leading-5 text-muted-foreground">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 rounded-xl border border-border bg-secondary/40 p-3.5 text-[13px] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                No se guardan fotografías: solo una representación numérica del rostro, en la base de datos de tu
                empresa y usada únicamente para registrar asistencia. Es un dato personal sensible; pide el
                consentimiento del empleado antes de registrarlo.
              </p>
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={consent} onCheckedChange={setConsent} className="mt-0.5" />
              <span>El empleado da su consentimiento para registrar su rostro con fines de control de asistencia.</span>
            </label>
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 py-1">
            <div className="relative">
              {turning ? (
                <>
                  <ChevronLeft className="absolute -left-7 top-1/2 h-7 w-7 -translate-y-1/2 text-primary motion-safe:animate-pulse" />
                  <ChevronRight className="absolute -right-7 top-1/2 h-7 w-7 -translate-y-1/2 text-primary motion-safe:animate-pulse" />
                </>
              ) : null}
              <EnrollCircle
                videoRef={videoRef}
                cameraState={cameraState}
                cameraMessage={message}
                loading={loadingModels}
                segments={STEPS.length}
                done={stage === 'test' ? STEPS.length : count}
                hold={hold}
                success={stage === 'test' && !!testResult?.ok}
                flashKey={flashKey}
              />
            </div>

            {stage === 'capture' ? (
              <div className="min-h-[88px] w-full text-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={count}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="text-xl font-semibold tracking-tight"
                  >
                    {count >= STEPS.length ? '¡Listo!' : currentStep.title}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-1.5 h-5 text-sm text-muted-foreground">{hint}</p>
                <p className="mt-2 text-xs text-muted-foreground/70">
                  {count >= STEPS.length ? 'Guardando tu rostro…' : `Paso ${count + 1} de ${STEPS.length}`}
                </p>
              </div>
            ) : (
              <div className="min-h-[88px] w-full text-center">
                {testResult === null ? (
                  <>
                    <p className="text-xl font-semibold tracking-tight">Mira a la cámara</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">Probando el reconocimiento…</p>
                  </>
                ) : testResult.ok ? (
                  <>
                    <p className="text-xl font-semibold tracking-tight text-success">Te reconocí</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">{testResult.percent}% de coincidencia</p>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <p className="flex items-center justify-center gap-2 text-lg font-semibold text-warning">
                      <TriangleAlert className="h-5 w-5" />
                      No se reconoció con claridad
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Repite el registro con mejor luz de frente y sin objetos que tapen el rostro.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === 'intro' && hasFace ? (
            <Button
              variant="secondary"
              onClick={() => {
                remove(employee.id, currentUser)
                toast.success('Rostro eliminado', employee.fullName)
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar rostro
            </Button>
          ) : null}
          {stage === 'capture' ? (
            <Button variant="secondary" onClick={() => setStage('intro')}>
              Cancelar
            </Button>
          ) : null}
          {stage === 'test' ? (
            <>
              {testResult && !testResult.ok && !testOnly ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCount(0)
                    setHold(0)
                    setError('')
                    setStage('capture')
                  }}
                >
                  Repetir registro
                </Button>
              ) : null}
              <Button onClick={() => onOpenChange(false)}>{testResult ? 'Listo' : 'Omitir prueba'}</Button>
            </>
          ) : null}
          {stage === 'intro' ? (
            <Button
              size="lg"
              disabled={!consent}
              onClick={() => {
                setError('')
                setCount(0)
                setHold(0)
                setStage('capture')
              }}
            >
              {hasFace ? 'Actualizar rostro' : 'Comenzar'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
