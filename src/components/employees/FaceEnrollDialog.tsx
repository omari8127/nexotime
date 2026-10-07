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
import { VoiceToggle } from '@/components/shared/VoiceToggle'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useVoice } from '@/lib/speech'
import { useDataStore } from '@/store/dataStore'
import {
  QUALITY_TEXT,
  tuningFor,
  descriptorDistance,
  faceCandidates,
  loadFaceApi,
  meanDescriptor,
  qualityIssues,
  readFace,
} from '@/lib/face'
import { FaceSession } from '@/lib/faceSession'
import { resolveKiosk } from '@/lib/kiosk'
import type { Employee } from '@/types'

/** Each sample must show a specific pose, so the set covers small natural variations.
 *  `say` is what the voice reads when the step starts. */
const STEPS = [
  { pose: 'front', title: 'Mira de frente a la cámara', say: 'Mira de frente a la cámara y quédate quieto', nudge: 'Mira directo a la cámara' },
  { pose: 'front', title: 'Sonríe ligeramente', say: 'Sonríe ligeramente', nudge: 'Mira de frente y sonríe un poco' },
  { pose: 'turn', title: 'Gira la cabeza un poco hacia un lado', say: 'Gira la cabeza un poco hacia un lado', nudge: 'Gira despacio, solo un poco más' },
  { pose: 'opposite', title: 'Ahora hacia el lado contrario', say: 'Ahora gira hacia el lado contrario', nudge: 'Gira hacia el otro lado' },
  { pose: 'front', title: 'Vuelve a mirar de frente', say: 'Vuelve a mirar de frente', nudge: 'Mira directo a la cámara' },
] as const

/** Each step lasts at least this long before its sample is taken, so the instruction (read aloud or on
 *  screen) can be heard, understood and followed instead of flashing by. */
const STEP_DWELL_MS = 1600
/** Good frames before a sample is taken: this is the visible "hold still" moment. */
const STABLE_FRAMES = 4
/** Frames averaged into each saved sample (averages out frame-to-frame noise). */
const SAMPLE_FRAMES = 3
/**
 * A wrong frame (a blink, a small sway) only freezes the hold ring. It starts walking back — one
 * tick at a time, never snapping to zero — after the problem has lasted this long.
 */
const BAD_GRACE_MS = 900
const DECAY_MS = 300
/** The voice only repeats a problem once it has lasted this long (not on every flicker). */
const SPEAK_AFTER_MS = 1200
/** Pause before retrying a sample that did not come out clean; the ring stays almost full meanwhile. */
const RETRY_MS = 400
/** Stuck on one step this long: assisted mode — the pose gates are relaxed for it, so a
 *  person who cannot (or does not manage to) do the exact movement still finishes. The final
 *  recognition test is the real check. */
const ASSIST_AFTER_MS = 10_000
/** Head-turn gates are relative to the person's own straight-ahead yaw (learned on step 1):
 *  natural faces are not symmetric, so an absolute "yaw ≈ 1" can never be met by some people. */
const TURN_MIN = 0.13
/** Turning further than this stops being a usable sample (the face is mostly in profile). */
const TURN_MAX = 0.65
/** Step 1 only has to rule out a face in profile: it defines the person's own "straight ahead" (a laptop
 *  camera below the eyes, or an off-axis tablet, makes a perfectly normal face read as slightly turned). */
const FIRST_FRONT_TOL = 0.5
const FIRST_FRONT_TOL_ASSISTED = 0.7
/** The sample must be this close to at least one already saved (same person). Turned faces differ more. */
const SAME_PERSON_FRONT = 0.45
const SAME_PERSON_TURNED = 0.6
const DUPLICATE_DISTANCE = 0.42
const TEST_TIMEOUT_MS = 30_000

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
 * Every instruction is also spoken (switchable), for people who can't read and hold still.
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
  const { say, beep } = useVoice('enroll')

  const hasFace = !!employee.identifications.find((i) => i.method === 'face')?.descriptors?.length

  const [stage, setStage] = useState<Stage>(testOnly ? 'test' : 'intro')
  const [consent, setConsent] = useState(false)
  const [count, setCount] = useState(0)
  const [hold, setHold] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [loadingModels, setLoadingModels] = useState(false)
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean } | null>(null)
  const [testAttempt, setTestAttempt] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const saved = useRef<number[][]>(
    testOnly ? (employee.identifications.find((i) => i.method === 'face')?.descriptors ?? []) : [],
  )

  const cameraOn = open && stage !== 'intro'
  const { videoRef, state: cameraState, message, resolution, restart } = useCameraStream(cameraOn, { hd: true, facingMode })

  const others = useMemo(
    () => faceCandidates(allEmployees.filter((e) => e.id !== employee.id)),
    [allEmployees, employee.id],
  )
  const othersRef = useRef(others)
  useEffect(() => {
    othersRef.current = others
  })

  // Start loading the face models as soon as the dialog opens (while the person reads the
  // tips), so "Comenzar" doesn't sit on a "Preparando…" screen.
  useEffect(() => {
    if (open) void loadFaceApi().catch(() => undefined)
  }, [open])

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
  }, [open, testOnly])

  /* --------------------------------- voice ------------------------------- */
  const ready = open && cameraState === 'ready' && !loadingModels
  // What was last announced, so a screen that briefly flips to "preparing" and back doesn't repeat itself.
  const announced = useRef('')
  const announce = (key: string, text: string) => {
    if (announced.current === key) return
    announced.current = key
    say(text, { important: true, repeatAfterMs: 0 })
  }
  useEffect(() => {
    announced.current = '' // a new screen (or reopening the dialog) announces itself again
  }, [open, stage])
  useEffect(() => {
    if (!ready || stage !== 'capture') return
    announce(`capture:${count}`, count >= STEPS.length ? 'Listo. Vamos a comprobar tu rostro' : STEPS[count].say)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stage, count])
  useEffect(() => {
    if (!ready || stage !== 'test') return
    announce(
      `test:${testResult === null ? 'wait' : testResult.ok ? 'ok' : 'fail'}`,
      testResult === null
        ? 'Mira a la cámara para comprobar que te reconoce'
        : testResult.ok
          ? 'Te reconocí. Todo listo'
          : 'No se reconoció con claridad. Repite el registro con mejor luz de frente',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stage, testResult])
  useEffect(() => {
    if (error) say(error, { important: true, repeatAfterMs: 0 })
  }, [error, say])

  /* ------------------------------- capture ------------------------------- */
  useEffect(() => {
    if (!open || stage !== 'capture' || cameraState !== 'ready') return
    let alive = true
    let timer: number | undefined
    let stageTimer: number | undefined
    const video = videoRef.current
    if (!video) return
    const samples: number[][] = []
    setCount(0)
    setHold(0)
    setTestResult(null)
    let lastAccepted = 0
    let stable = 0
    let badSince = 0
    let lastDecay = 0
    let retryAt = 0
    let stepStart = Date.now()
    let assisted = false
    let holdAnnounced = false
    let errors = 0
    let firstTurnSide = 0
    let baseLogYaw = 0
    const yawLog: number[] = []

    /** A frame that can't be used: freeze the ring, and only walk it back gently if this keeps up. */
    const bad = (msg: string) => {
      const now = Date.now()
      if (!badSince) badSince = now
      const lasting = now - badSince
      if (lasting > BAD_GRACE_MS && now - lastDecay > DECAY_MS && stable > 0) {
        stable -= 1
        lastDecay = now
        setHold(stable / STABLE_FRAMES)
      }
      if (stable === 0) holdAnnounced = false
      setHint(msg)
      if (lasting > SPEAK_AFTER_MS) say(msg)
    }
    /** A sample that did not come out clean: keep the ring nearly full and just try again. */
    const retry = (msg: string) => {
      stable = Math.max(0, STABLE_FRAMES - 1)
      retryAt = Date.now() + RETRY_MS
      setHold(stable / STABLE_FRAMES)
      setHint(msg)
      say(msg)
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
      stepStart = Date.now()
      lastAccepted = stepStart // the first step also waits its dwell time

      const loop = async () => {
        if (!alive) return
        let finished = false
        try {
          // Cheap pass first (no descriptor): is there one clear face in the right pose?
          // 'fast' is fine here: this reading only guides the pose and is never saved.
          const kiosk = resolveKiosk(settings)
          const tuning = tuningFor(kiosk.faceStrictness, kiosk.faceThreshold)
          const result = await readFace(api, video, false, 'fast', { minConfidence: tuning.minConfidence })
          errors = 0
          if (!alive) return
          const step = STEPS[samples.length]

          if (!assisted && Date.now() - stepStart > ASSIST_AFTER_MS) {
            assisted = true
            setHint('Sin problema, solo mira a la cámara')
            say('Sin problema. Solo mira a la cámara', { important: true, repeatAfterMs: 0 })
          }

          if (result.kind !== 'face') {
            bad(result.kind === 'none' ? 'Coloca tu rostro dentro del círculo' : 'Debe aparecer una sola persona')
          } else {
            const r = result.reading
            const issues = qualityIssues(r, { blur: true, minFace: tuning.minFace })
            const rel = Math.log(r.yaw) - baseLogYaw
            const side = Math.abs(rel) < TURN_MIN ? 0 : rel < 0 ? -1 : 1
            const first = samples.length === 0
            const tooTurned = !first && Math.abs(rel) > TURN_MAX
            const poseOk = first
              ? Math.abs(rel) < (assisted ? FIRST_FRONT_TOL_ASSISTED : FIRST_FRONT_TOL)
              : tooTurned
                ? false
                : assisted
                  ? true
                  : step.pose === 'front'
                    ? side === 0
                    : step.pose === 'turn'
                      ? side !== 0
                      : side !== 0 && (firstTurnSide === 0 || side === -firstTurnSide)

            if (issues.length > 0 || !poseOk) {
              bad(
                issues.length > 0
                  ? QUALITY_TEXT[issues[0]]
                  : tooTurned
                    ? 'Gira un poco menos'
                    : step.pose === 'opposite' && side === firstTurnSide
                      ? 'Gira hacia el lado contrario'
                      : step.nudge,
              )
            } else {
              badSince = 0
              stable += 1
              yawLog.push(Math.log(r.yaw))
              setHold(Math.min(1, stable / STABLE_FRAMES))
              setHint('Perfecto, no te muevas…')
              if (!holdAnnounced) {
                holdAnnounced = true
                say('Perfecto, no te muevas', { repeatAfterMs: 0 })
              }

              if (stable >= STABLE_FRAMES && Date.now() >= retryAt && Date.now() - lastAccepted >= STEP_DWELL_MS) {
                // Hold complete: read a few frames with descriptors and average them.
                const frames: number[][] = []
                // Saved samples use the accurate detector, same as the reloj; one spare attempt for a bad frame.
                for (let i = 0; i < SAMPLE_FRAMES + 1 && frames.length < SAMPLE_FRAMES && alive; i++) {
                  const again = await readFace(api, video, true, 'accurate', { minConfidence: tuning.minConfidence })
                  if (
                    again.kind === 'face' &&
                    again.reading.descriptor &&
                    qualityIssues(again.reading, { blur: true, minFace: tuning.minFace }).length === 0
                  ) {
                    frames.push(again.reading.descriptor)
                  }
                }
                if (!alive) return
                if (frames.length < SAMPLE_FRAMES || frames.some((d) => descriptorDistance(d, frames[0]) > 0.35)) {
                  retry('No alcanzamos a verte bien. Mantén la posición.')
                } else {
                  const d = meanDescriptor(frames)
                  const limit = step.pose === 'front' ? SAME_PERSON_FRONT : SAME_PERSON_TURNED
                  const nearest = samples.length ? Math.min(...samples.map((s) => descriptorDistance(s, d))) : 0
                  if (samples.length > 0 && nearest > limit) {
                    retry(
                      step.pose === 'front'
                        ? 'Mantén el mismo rostro frente a la cámara'
                        : 'Gira un poco menos y mira hacia la cámara',
                    )
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
                    badSince = 0
                    stepStart = Date.now()
                    assisted = false
                    holdAnnounced = false
                    setHold(0)
                    setCount(samples.length)
                    setFlashKey((n) => n + 1)
                    beep()
                    if (samples.length >= STEPS.length) {
                      saved.current = samples
                      setTestResult(null)
                      setHint('')
                      finished = true
                      // Let the last segment light up before moving on.
                      stageTimer = window.setTimeout(() => {
                        if (alive) setStage('test')
                      }, 600)
                    } else {
                      setHint('')
                    }
                  }
                }
              }
            }
          }
        } catch {
          stable = 0
          if (!alive) return
          if (++errors >= 3) { fail('No se puede analizar el video. Reintenta la cámara o usa otro dispositivo.'); return }
          bad('No se pudo leer la imagen. Mantén la posición.')
        }
        if (!finished && alive) timer = window.setTimeout(loop, 30)
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
  }, [stage, cameraState, open])

  /* --------------------------------- test -------------------------------- */
  useEffect(() => {
    if (!open || stage !== 'test' || cameraState !== 'ready') return
    let alive = true
    let timer: number | undefined
    const video = videoRef.current
    if (!video) return
    const session = new FaceSession()
    const run = async () => {
      setTestResult(null)
      setLoadingModels(true)
      const api = await loadFaceApi().catch(() => null)
      if (!alive) return
      setLoadingModels(false)
      if (!api) {
        setHint('No se pudieron cargar los modelos. Revisa la conexión y reintenta.')
        setTestResult({ ok: false })
        return
      }
      // Model loading is not counted against slow tablets' test window.
      const started = Date.now()
      let errors = 0
      const loop = async () => {
        if (!alive) return
        try {
          const kiosk = resolveKiosk(settings)
          const tuning = tuningFor(kiosk.faceStrictness, kiosk.faceThreshold)
          const result = await readFace(api, video, true, 'accurate', {
            minConfidence: tuning.minConfidence,
          })
          if (!alive) return
          errors = 0
          if (result.kind === 'face' && result.reading.descriptor) {
            const issues = qualityIssues(result.reading, { blur: true, minFace: tuning.minFace })
            if (issues.length) {
              session.reset()
              setHint(QUALITY_TEXT[issues[0]])
            } else {
              const descriptors = testOnly
                ? (employee.identifications.find((i) => i.method === 'face')?.descriptors ?? [])
                : saved.current
              const evidence = session.push([
                { employee, descriptors }, ...othersRef.current,
              ], result.reading.descriptor, tuning)
              if (evidence.accepted?.employee.id === employee.id) {
                if (!testOnly) enroll(employee.id, descriptors, currentUser)
                setTestResult({ ok: true })
                setHint('')
                return
              }
              setHint(evidence.progress ? `Verificando ${evidence.progress}/${evidence.required}` : 'Mira de frente; todavía no hay una coincidencia clara.')
            }
          } else {
            session.reset()
            setHint(result.kind === 'multiple' ? 'Debe aparecer una sola persona' : 'Coloca tu rostro dentro del círculo')
          }
        } catch {
          session.reset()
          if (!alive) return
          setHint('No se pudo analizar el video. Reintenta la cámara.')
          if (++errors >= 3) { setTestResult({ ok: false }); return }
        }
        if (Date.now() - started > TEST_TIMEOUT_MS) {
          setTestResult({ ok: false })
          return
        }
        timer = window.setTimeout(loop, 60)
      }
      void loop()
    }
    void run()
    return () => { alive = false; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cameraState, open, testAttempt])

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
                : testResult?.ok ? 'Registro facial guardado y verificado.' : 'Comprobemos tu rostro antes de guardar el registro.'
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
            <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
              <span>Las indicaciones también se dicen en voz alta.</span>
              {resolution ? <p className="text-xs text-muted-foreground">Cámara: {resolution}</p> : null}
            {cameraState === 'error' ? <Button variant="secondary" onClick={restart}>Reintentar cámara</Button> : null}
            <Button variant="secondary" disabled={!!testResult?.ok} onClick={() => setFacingMode((v) => v === 'user' ? 'environment' : 'user')}>
              Cambiar a cámara {facingMode === 'user' ? 'trasera' : 'frontal'}
            </Button>
            <VoiceToggle scope="enroll" />
            </div>
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
                  {count >= STEPS.length ? 'Preparando la prueba…' : `Paso ${count + 1} de ${STEPS.length}`}
                </p>
              </div>
            ) : (
              <div className="min-h-[88px] w-full text-center">
                {testResult === null ? (
                  <>
                    <p className="text-xl font-semibold tracking-tight">Mira a la cámara</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">{hint || 'Probando el reconocimiento…'}</p>
                  </>
                ) : testResult.ok ? (
                  <>
                    <p className="text-xl font-semibold tracking-tight text-success">Te reconocí</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">Coincidencia verificada en varias imágenes</p>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <p className="flex items-center justify-center gap-2 text-lg font-semibold text-warning">
                      <TriangleAlert className="h-5 w-5" />
                      No se reconoció con claridad
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {hint || 'Repite el registro con mejor luz de frente y sin objetos que tapen el rostro.'}
                    </p>
                  </div>
                )}
              </div>
            )}
            {resolution ? <p className="text-xs text-muted-foreground">Cámara: {resolution}</p> : null}
            {cameraState === 'error' ? <Button variant="secondary" onClick={restart}>Reintentar cámara</Button> : null}
            <Button variant="secondary" disabled={!!testResult?.ok} onClick={() => setFacingMode((v) => v === 'user' ? 'environment' : 'user')}>
              Cambiar a cámara {facingMode === 'user' ? 'trasera' : 'frontal'}
            </Button>
            <VoiceToggle scope="enroll" />
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
              {testResult && !testResult.ok ? (
                <Button variant="secondary" onClick={() => setTestAttempt((n) => n + 1)}>Reintentar prueba</Button>
              ) : null}
              <Button onClick={() => onOpenChange(false)}>{testResult?.ok || testOnly ? 'Listo' : 'Cerrar sin guardar'}</Button>
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
