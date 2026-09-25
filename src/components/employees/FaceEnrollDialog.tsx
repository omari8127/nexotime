import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
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
import { FaceViewport } from '@/components/clock/FaceViewport'
import { useCameraStream } from '@/hooks/useCameraStream'
import { useDataStore } from '@/store/dataStore'
import {
  QUALITY_TEXT,
  tuningFor,
  descriptorDistance,
  faceCandidates,
  loadFaceApi,
  matchPercent,
  nearestFace,
  qualityIssues,
  readFace,
  turnSide,
  type QualityIssue,
} from '@/lib/face'
import { resolveKiosk } from '@/lib/kiosk'
import { cn } from '@/lib/utils'
import type { Employee } from '@/types'

/** Each sample must show a specific pose, so the set covers small natural variations. */
const STEPS = [
  { pose: 'front', text: 'Mira de frente a la cámara' },
  { pose: 'front', text: 'Sonríe ligeramente' },
  { pose: 'turn', text: 'Gira la cabeza un poco hacia un lado' },
  { pose: 'opposite', text: 'Ahora gira hacia el lado contrario' },
  { pose: 'front', text: 'Vuelve a mirar de frente' },
] as const

const SAMPLE_GAP_MS = 650
const STABLE_FRAMES = 2 // the pose and quality must hold for this many frames in a row
const SAME_PERSON_FRONT = 0.42
const SAME_PERSON_TURNED = 0.5
const DUPLICATE_DISTANCE = 0.42
const TEST_TIMEOUT_MS = 9000

type Stage = 'intro' | 'capture' | 'test'

interface Live {
  issues: QualityIssue[]
  faces: 'none' | 'multiple' | 'one'
}

/**
 * Guided face enrollment: consent → 5 posed samples with live quality feedback →
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
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [live, setLive] = useState<Live>({ issues: [], faces: 'none' })
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
      setHint('')
      setError('')
      setTestResult(null)
    }
  }, [open])

  /* ------------------------------- capture ------------------------------- */
  useEffect(() => {
    if (stage !== 'capture' || cameraState !== 'ready') return
    let alive = true
    let timer: number | undefined
    const video = videoRef.current
    if (!video) return
    const samples: number[][] = []
    let lastAccepted = 0
    let stable = 0
    let firstTurnSide = 0

    const fail = (msg: string) => {
      setError(msg)
      setStage('intro')
    }

    const run = async () => {
      let api
      try {
        api = await loadFaceApi()
      } catch {
        if (alive) fail('No se pudo cargar el reconocimiento facial. Revisa la conexión e inténtalo de nuevo.')
        return
      }
      setHint(STEPS[0].text)

      const loop = async () => {
        if (!alive) return
        try {
          const result = await readFace(api, video, true)
          if (!alive) return
          if (result.kind !== 'face') {
            stable = 0
            setLive({ issues: [], faces: result.kind === 'none' ? 'none' : 'multiple' })
            setHint(result.kind === 'none' ? 'Coloca el rostro dentro del óvalo' : 'Debe aparecer una sola persona')
          } else {
            const r = result.reading
            const issues = qualityIssues(r, { blur: true })
            setLive({ issues, faces: 'one' })
            const step = STEPS[samples.length]
            const side = turnSide(r.yaw)
            const poseOk =
              step.pose === 'front'
                ? side === 0
                : step.pose === 'turn'
                  ? side !== 0
                  : side !== 0 && side === -firstTurnSide
            if (issues.length > 0) {
              stable = 0
              setHint(QUALITY_TEXT[issues[0]])
            } else if (!poseOk) {
              stable = 0
              setHint(step.text)
            } else {
              stable += 1
              setHint(step.text)
              if (stable >= STABLE_FRAMES && r.descriptor && Date.now() - lastAccepted >= SAMPLE_GAP_MS) {
                const d = r.descriptor
                const limit = step.pose === 'front' ? SAME_PERSON_FRONT : SAME_PERSON_TURNED
                if (samples.length > 0 && descriptorDistance(samples[0], d) > limit) {
                  setHint('Mantén el mismo rostro frente a la cámara')
                  stable = 0
                } else {
                  const twin = othersRef.current.find((c) =>
                    c.descriptors.some((x) => descriptorDistance(x, d) < DUPLICATE_DISTANCE),
                  )
                  if (twin) {
                    fail(`Este rostro ya está registrado para ${twin.employee.fullName}.`)
                    return
                  }
                  if (step.pose === 'turn') firstTurnSide = side
                  samples.push(d)
                  lastAccepted = Date.now()
                  stable = 0
                  setCount(samples.length)
                  if (samples.length >= STEPS.length) {
                    saved.current = samples
                    enroll(employee.id, samples, currentUser)
                    setTestResult(null)
                    setStage('test')
                    return
                  }
                  setHint(STEPS[samples.length].text)
                }
              }
            }
          }
        } catch {
          /* skip a bad frame */
        }
        timer = window.setTimeout(loop, 130)
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
      const api = await loadFaceApi().catch(() => null)
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

  const chip = (label: string, bad: boolean, unknown: boolean) => (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
        unknown
          ? 'border-border text-muted-foreground'
          : bad
            ? 'border-warning/40 bg-warning/10 text-warning'
            : 'border-success/40 bg-success/10 text-success',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
  const noFace = live.faces !== 'one'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reconocimiento facial de {employee.firstName}</DialogTitle>
          <DialogDescription>
            {stage === 'test'
              ? testOnly
                ? 'Mira a la cámara para comprobar que el rostro guardado se reconoce.'
                : 'Rostro guardado. Comprobemos que se reconoce bien.'
              : hasFace
                ? 'Ya tiene un rostro registrado. Puedes actualizarlo o eliminarlo.'
                : 'Registra el rostro para que pueda checar con la cámara del reloj.'}
          </DialogDescription>
        </DialogHeader>

        {stage === 'intro' ? (
          <div className="space-y-4">
            <ul className="space-y-1.5 rounded-lg border border-border bg-secondary/40 p-3.5 text-[13px] leading-5 text-muted-foreground">
              <li>• Busca un lugar con buena luz de frente, sin ventanas ni focos a su espalda.</li>
              <li>• Sin lentes oscuros, gorra ni cubrebocas. Los lentes graduados están bien.</li>
              <li>• Tomará 5 muestras: de frente, sonriendo y girando un poco la cabeza a cada lado.</li>
            </ul>
            <div className="flex gap-3 rounded-lg border border-border bg-secondary/40 p-3.5 text-[13px] leading-5 text-muted-foreground">
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
          <div className="flex flex-col items-center gap-4">
            <FaceViewport
              videoRef={videoRef}
              cameraState={cameraState}
              cameraMessage={message}
              ok={stage === 'test' && !!testResult?.ok}
            />
            {stage === 'capture' ? (
              <>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {chip('Luz', live.issues.includes('dark') || live.issues.includes('bright'), noFace)}
                  {chip('Tamaño', live.issues.includes('small'), noFace)}
                  {chip('Centrado', live.issues.includes('off_center') || live.issues.includes('cut_off'), noFace)}
                  {chip('Nitidez', live.issues.includes('blurry'), noFace)}
                </div>
                <div className="w-full">
                  <div className="flex gap-1.5">
                    {STEPS.map((_, i) => (
                      <div
                        key={i}
                        className={cn('h-1.5 flex-1 rounded-full transition-colors', i < count ? 'bg-primary' : i === count ? 'bg-primary/40' : 'bg-secondary')}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-center text-sm font-medium">{hint}</p>
                  <p className="text-center text-xs text-muted-foreground">
                    Paso {Math.min(count + 1, STEPS.length)} de {STEPS.length} · se captura solo, sin tocar nada
                  </p>
                </div>
              </>
            ) : (
              <div className="w-full text-center">
                {testResult === null ? (
                  <>
                    <p className="text-sm font-medium">Mira a la cámara</p>
                    <p className="text-xs text-muted-foreground">Probando el reconocimiento…</p>
                  </>
                ) : testResult.ok ? (
                  <p className="flex items-center justify-center gap-2 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Reconocido · {testResult.percent}% de coincidencia
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="flex items-center justify-center gap-2 text-sm font-medium text-warning">
                      <TriangleAlert className="h-4 w-4" />
                      No se reconoció con claridad
                    </p>
                    <p className="text-xs text-muted-foreground">
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
              Cancelar captura
            </Button>
          ) : null}
          {stage === 'test' ? (
            <>
              {testResult && !testResult.ok && !testOnly ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCount(0)
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
              disabled={!consent}
              onClick={() => {
                setError('')
                setCount(0)
                setStage('capture')
              }}
            >
              {hasFace ? 'Actualizar rostro' : 'Iniciar registro'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
