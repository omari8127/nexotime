import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  TriangleAlert,
  Barcode,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LogIn,
  LogOut,
  Maximize,
  MapPin,
  Minimize,
  QrCode,
  ScanFace,
  UserRound,
  Utensils,
  UtensilsCrossed,
  WifiOff,
} from 'lucide-react'
import { NexotimeLogo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/button'
import { Avatar, Progress } from '@/components/ui/misc'
import { Dropdown, DropdownItem, DropdownLabel } from '@/components/ui/dropdown'
import { AnalogClock } from '@/components/clock/AnalogClock'
import { FaceScanFlow } from '@/components/clock/FaceScanFlow'
import { ScanFlow } from '@/components/clock/ScanFlow'
import { NumberPinFlow } from '@/components/clock/NumberPinFlow'
import { KioskExitGate } from '@/components/clock/KioskExitGate'
import { METHOD_META } from '@/components/shared/badges'
import { useFeature } from '@/lib/license/features'
import { copyrightLine } from '@/data/legal'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { useSyncStore } from '@/store/syncStore'
import { applyTheme, useUIStore } from '@/store/uiStore'
import { resolveKiosk } from '@/lib/kiosk'
import { CODE_ERROR_TEXT, credentialValue, findEmployeeByCode } from '@/lib/credentials'
import { useLiveClock, formatClockTime } from '@/hooks/useLiveClock'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useToday } from '@/hooks/useToday'
import { useGeolocation } from '@/hooks/useGeolocation'
import {
  calculateWeeklyHours,
  canRegisterPunch,
  detectNextPunch,
  getRecordFlags,
  PUNCH_TYPE_LABEL,
} from '@/lib/attendance'
import { weekDates } from '@/lib/week'
import { formatClock24, formatDuration, formatLongDate, formatTime12 } from '@/lib/utils'
import type { CaptureMethod, Employee, Punch, PunchLocation, PunchType } from '@/types'

type Phase = 'idle' | 'method' | 'face' | 'qr' | 'barcode' | 'number' | 'confirm' | 'punch' | 'success'

const METHODS: Array<{ key: Phase; method: CaptureMethod; title: string; text: string; Icon: typeof QrCode; soon?: boolean }> = [
  { key: 'face', method: 'face', title: 'Reconocimiento facial', text: 'Mira a la cámara y parpadea', Icon: ScanFace, soon: true },
  { key: 'qr', method: 'qr', title: 'Escanear código QR', text: 'Muestra tu credencial a la cámara', Icon: QrCode },
  { key: 'barcode', method: 'barcode', title: 'Código de barras', text: 'Acerca tu credencial a la cámara o lector', Icon: Barcode },
  { key: 'number', method: 'employee_number', title: 'Número de empleado', text: 'Escribe tu número y tu PIN', Icon: UserRound },
]

const PUNCH_TYPE_ICON: Record<PunchType, typeof LogIn> = {
  entry: LogIn,
  lunch_out: Utensils,
  lunch_in: UtensilsCrossed,
  exit: LogOut,
}

const PUNCH_TYPE_ORDER: PunchType[] = ['entry', 'lunch_out', 'lunch_in', 'exit']

export function ClockPage() {
  const navigate = useNavigate()
  const company = useDataStore((s) => s.company)
  const branches = useDataStore((s) => s.branches)
  const devices = useDataStore((s) => s.devices)
  const allEmployees = useDataStore((s) => s.employees)
  const mode = useDataStore((s) => s.mode)
  const panelTheme = useUIStore((s) => s.theme)
  const attendance = useDataStore((s) => s.attendance)
  const schedules = useDataStore((s) => s.schedules)
  const registerPunch = useDataStore((s) => s.registerPunch)
  const now = useLiveClock()
  const faceAllowed = useFeature('face')
  const today = useToday()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const isOnline = useOnlineStatus()
  const { location: deviceLocation } = useGeolocation()

  const [branchId, setBranchId] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [selectedPunchType, setSelectedPunchType] = useState<PunchType | null>(null)
  const [method, setMethod] = useState<CaptureMethod>('qr')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [lastPunch, setLastPunch] = useState<
    { type: PunchType; time: string; location?: PunchLocation; photo?: string } | null
  >(null)
  // Fleeting face-verification snapshot: lives only in memory from the moment someone
  // is recognized until the success screen closes — never persisted or sent anywhere.
  const [pendingPhoto, setPendingPhoto] = useState<string | undefined>(undefined)
  const [showWeekSummary, setShowWeekSummary] = useState(false)
  const [notices, setNotices] = useState<Array<{ title: string; detail: string }>>([])
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [showExitGate, setShowExitGate] = useState(false)
  const pendingSync = useSyncStore((s) => s.pending)

  // No hay botón visible para salir del reloj checador (lo debe usar cualquier
  // empleado). Mantener presionado el logo 3 segundos pide el código de salida.
  const holdTimer = useRef<number | null>(null)
  const startHold = () => {
    holdTimer.current = window.setTimeout(() => setShowExitGate(true), 3000)
  }
  const cancelHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  // Falls back to the first branch once real data loads — a brand-new live
  // company has no "br_centro" (that id only exists in the demo seed).
  const effectiveBranchId = branches.some((b) => b.id === branchId) ? branchId : (branches[0]?.id ?? '')

  const branch = branches.find((b) => b.id === effectiveBranchId)
  // The branch's own address (fixed once by an admin) is the real source of truth for a
  // kiosk that never moves — instant and reliable, unlike the device's own GPS. Only
  // fall back to the device's location while the branch has none configured yet.
  const effectiveLocation: PunchLocation | undefined =
    branch?.lat != null && branch?.lng != null ? { lat: branch.lat, lng: branch.lng } : (deviceLocation ?? undefined)
  const device =
    devices.find((d) => d.branchId === effectiveBranchId && d.status === 'online') ?? devices[0]
  const branchEmployees = useMemo(
    () => allEmployees.filter((e) => e.branchId === effectiveBranchId && e.status === 'active'),
    [allEmployees, effectiveBranchId],
  )

  // Rotating demo candidate for the "scan" methods; Juan Pérez leads.
  const candidate = useMemo(() => {
    const preferred = branchEmployees.find((e) => e.employeeNumber === 'EMP-001')
    return preferred ?? branchEmployees[0]
  }, [branchEmployees])

  /** Badge codes work at any branch of the company, not only this kiosk's. */
  function handleCode(kind: 'qr' | 'barcode', code: string): string | null {
    const match = findEmployeeByCode(allEmployees, code)
    if (!match.ok) return CODE_ERROR_TEXT[match.reason]
    identify(match.employee, kind)
    return null
  }

  const todayRecord = employee
    ? attendance.find((r) => r.employeeId === employee.id && r.date === today)
    : undefined
  const punches: Punch[] = todayRecord?.punches ?? []
  const nextPunch = detectNextPunch(punches, company.attendanceSettings.trackLunch)
  // What the confirm/registration screens act on: the movement the employee explicitly
  // chose on the first screen, falling back to auto-detection only if none was set.
  const confirmPunch = selectedPunchType
    ? { type: selectedPunchType, label: `Registrar ${PUNCH_TYPE_LABEL[selectedPunchType].toLowerCase()}` }
    : nextPunch
  const kiosk = resolveKiosk(company.attendanceSettings)

  const weekSummary = useMemo(() => {
    if (!employee) return null
    const week = weekDates(today)
    const records = attendance.filter(
      (r) => r.employeeId === employee.id && r.date >= week[0] && r.date <= week[6],
    )
    const schedule = schedules.find((s) => s.id === employee.scheduleId)
    return calculateWeeklyHours(records, schedule?.weeklyTargetHours ?? 40)
  }, [employee, attendance, schedules, today])

  useEffect(() => {
    setShowWeekSummary(false)
  }, [employee])

  // The kiosk is designed for a bright, fixed look; the panel's dark mode does not apply here.
  useEffect(() => {
    applyTheme('light')
    return () => applyTheme(panelTheme)
  }, [panelTheme])

  // Auto-register: when the cancel window ends, register the proposed movement.
  useEffect(() => {
    if (phase !== 'confirm' || !confirmPunch) return
    const id = setTimeout(() => doPunch(confirmPunch.type), kiosk.autoRegisterSeconds * 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Visible seconds countdown for the confirm screen's "se registra en…" caption.
  useEffect(() => {
    if (phase !== 'confirm') return
    setSecondsLeft(kiosk.autoRegisterSeconds)
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (phase !== 'success') return
    const id = setTimeout(() => reset(), 4500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function reset() {
    setPhase('idle')
    setSelectedPunchType(null)
    setEmployee(null)
    setLastPunch(null)
    setNotices([])
    setPendingPhoto(undefined)
  }

  function backToMethod() {
    setPhase('method')
  }

  /**
   * Once someone is identified: validate the movement they picked on the first screen
   * against today's record, then go to a short confirmation before registering it.
   * `photo` only ever comes from face recognition — a fleeting snapshot for the
   * success screen, never stored.
   */
  function identify(emp: Employee, capture: CaptureMethod, photo?: string) {
    setEmployee(emp)
    setMethod(capture)
    setPendingPhoto(photo)
    const record = attendance.find((r) => r.employeeId === emp.id && r.date === today)
    const type = selectedPunchType ?? detectNextPunch(record?.punches ?? [], company.attendanceSettings.trackLunch)?.type
    if (type) {
      const blocked = canRegisterPunch(record?.punches ?? [], type, company.attendanceSettings, {
        minutes: kiosk.minGapMinutes,
        now: formatClock24(now),
      })
      if (blocked) {
        toast.error(`${emp.firstName}, no se pudo registrar`, blocked)
        reset()
        return
      }
    }
    setPhase(kiosk.autoRegister && type ? 'confirm' : 'punch')
  }

  function doPunch(type: PunchType) {
    if (!employee) return
    const time = formatClock24(now)
    try {
      const { record } = registerPunch({
        employeeId: employee.id,
        type,
        time,
        method,
        deviceId: device?.id,
        date: today,
        location: effectiveLocation,
      })
      // Friendly heads-up when the punch reveals something worth knowing.
      const found: Array<{ title: string; detail: string }> = []
      const schedule = schedules.find((s) => s.id === record.scheduleId)
      const flags = getRecordFlags(record, schedule, company.attendanceSettings, today)
      if (type === 'entry' && record.lateMinutes > 0) {
        found.push({
          title: 'Entrada con retardo',
          detail: `Llegaste ${humanMinutes(record.lateMinutes)} después de tu hora de entrada.`,
        })
      }
      if (type === 'lunch_in' && flags.lunchExcessMinutes > 0) {
        found.push({
          title: 'Comida excedida',
          detail: `Tu comida duró ${humanMinutes(flags.lunchExcessMinutes)} más de lo programado.`,
        })
      }
      if (type === 'exit' && flags.earlyLeaveMinutes > 0) {
        found.push({
          title: 'Salida anticipada',
          detail: `Saliste ${humanMinutes(flags.earlyLeaveMinutes)} antes de tu hora de salida.`,
        })
      }
      setNotices(found)
    } catch (e) {
      // Impossible sequences (doble entrada, regreso sin comida…) are refused with a clear reason.
      toast.error('No se pudo registrar', e instanceof Error ? e.message : undefined)
      setPhase('punch')
      return
    }
    // El registro siempre queda guardado localmente de inmediato; si no hay
    // conexión se encola en este dispositivo y se sincroniza al reconectar.
    setLastPunch({ type, time, location: effectiveLocation, photo: pendingPhoto })
    setPhase('success')
  }

  return (
    <div className="grid min-h-dvh bg-slate-100 text-slate-900 lg:grid-cols-[minmax(340px,40%)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------- side panel */}
      <aside className="relative flex flex-col justify-between gap-6 overflow-hidden bg-sidebar px-8 py-6 text-white lg:min-h-dvh lg:gap-8 lg:py-10">
        <button
          type="button"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          className="w-fit select-none"
          aria-label="Nexotime"
        >
          <NexotimeLogo tone="light" size="lg" />
        </button>

        <div className="flex flex-col items-start gap-6 lg:items-center lg:text-center">
          <AnalogClock now={now} className="hidden h-56 w-56 lg:block xl:h-64 xl:w-64" />
          <div className="lg:text-center">
            <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl xl:text-6xl">
              {formatClockTime(now)}
            </p>
            <p className="mt-2 text-sm text-slate-300">{formatLongDate(now)}</p>
          </div>
        </div>

        <div className="hidden space-y-3 border-t border-white/10 pt-5 text-[13px] lg:block">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">
            {company.legalName || company.name}
          </p>
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Punto de registro</dt>
              <dd className="truncate font-medium text-slate-100">{device?.name ?? branch?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Sucursal</dt>
              <dd className="truncate font-medium text-slate-100">{branch?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Conexión</dt>
              <dd className="flex items-center gap-1.5 font-medium text-slate-100">
                <span
                  className={`h-2 w-2 rounded-full ${
                    !isOnline ? 'bg-amber-400' : pendingSync > 0 ? 'bg-sky-400' : 'bg-emerald-400'
                  }`}
                />
                {!isOnline
                  ? 'Sin conexión'
                  : pendingSync > 0
                    ? `Sincronizando (${pendingSync})`
                    : mode === 'live'
                      ? 'En línea'
                      : 'Demostración'}
              </dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* ------------------------------------------------------------ main panel */}
      <section className="flex min-h-[70dvh] flex-col">
        <div className="flex items-center justify-end px-6 pt-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Modo kiosco (pantalla completa)'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
          <Dropdown
            align="end"
            trigger={
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium shadow-xs"
              >
                {branch?.name}
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
            }
          >
            <DropdownLabel>Punto de registro</DropdownLabel>
            {branches.map((b) => (
              <DropdownItem key={b.id} onSelect={() => setBranchId(b.id)}>
                {b.name}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
        </div>

      <AnimatePresence>
        {!isOnline ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              <WifiOff className="h-4 w-4 shrink-0" />
              Sin conexión — los registros se guardan en este dispositivo y se sincronizan
              automáticamente al reconectar
              {pendingSync > 0 ? ` (${pendingSync} pendiente${pendingSync === 1 ? '' : 's'})` : ''}.
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isOnline && pendingSync > 0 ? (
        <div className="mx-6 mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          Enviando {pendingSync} {pendingSync === 1 ? 'registro pendiente' : 'registros pendientes'} al servidor…
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div
                key="idle"
                initial={{ y: 12 }}
                animate={{ y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-7"
              >
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Registra tu asistencia
                  </h1>
                  <p className="mt-1.5 text-[15px] text-slate-500">¿Qué movimiento quieres registrar?</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {PUNCH_TYPE_ORDER.filter(
                    (t) => company.attendanceSettings.trackLunch || (t !== 'lunch_out' && t !== 'lunch_in'),
                  ).map((t) => {
                    const Icon = PUNCH_TYPE_ICON[t]
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setSelectedPunchType(t)
                          setPhase('method')
                        }}
                        className="group flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-primary/40 hover:bg-slate-50 active:bg-slate-100"
                      >
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-7 w-7" />
                        </span>
                        <span className="text-base font-semibold text-slate-900">{PUNCH_TYPE_LABEL[t]}</span>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {phase === 'method' && (
              <motion.div
                key="method"
                initial={{ y: 12 }}
                animate={{ y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-7"
              >
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Volver
                  </button>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                      Registra tu asistencia
                    </h1>
                    <p className="mt-1.5 text-[15px] text-slate-500">Elige cómo quieres identificarte.</p>
                  </div>
                  {selectedPunchType ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {(() => {
                        const Icon = PUNCH_TYPE_ICON[selectedPunchType]
                        return <Icon className="h-3.5 w-3.5" />
                      })()}
                      {PUNCH_TYPE_LABEL[selectedPunchType]}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {METHODS.filter((m) => m.key !== 'face' || faceAllowed).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPhase(m.key)}
                      className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <m.Icon className="h-7 w-7" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
                          {m.title}
                          {m.soon ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              Demo
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-500">{m.text}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {phase === 'face' && (
              <FlowCard key="face" onBack={backToMethod} title="Reconocimiento facial">
                <FaceScanFlow
                  employees={allEmployees}
                  settings={kiosk}
                  onCancel={backToMethod}
                  onConfirmed={(emp, photo) => identify(emp, 'face', photo)}
                />
              </FlowCard>
            )}

            {(phase === 'qr' || phase === 'barcode') && (
              <FlowCard key={phase} onBack={backToMethod} title={phase === 'qr' ? 'Código QR' : 'Código de barras'}>
                <ScanFlow
                  mode={phase}
                  onCancel={backToMethod}
                  onCode={(code) => handleCode(phase, code)}
                  demoCode={mode === 'demo' && candidate ? credentialValue(candidate, phase) : undefined}
                />
              </FlowCard>
            )}

            {phase === 'number' && (
              <FlowCard key="number" onBack={backToMethod}>
                <NumberPinFlow
                  employees={branchEmployees}
                  onCancel={backToMethod}
                  onIdentified={(emp) => identify(emp, 'employee_number')}
                />
              </FlowCard>
            )}

            {phase === 'confirm' && employee && confirmPunch && (
              <FlowCard key="confirm" onBack={reset} title="Confirmar registro">
                <div className="space-y-6">
                  <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                    <Avatar name={employee.fullName} size="lg" className="ring-2 ring-white shadow-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-900">{employee.fullName}</p>
                      <p className="truncate text-[13px] text-slate-500">
                        {employee.employeeNumber} · {employee.position}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-xs">
                      {(() => {
                        const Icon = METHOD_META[method].Icon
                        return <Icon className="h-3.5 w-3.5" />
                      })()}
                      {METHOD_META[method].label}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-3 py-1 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {(() => {
                        const Icon = PUNCH_TYPE_ICON[confirmPunch.type]
                        return <Icon className="h-7 w-7" />
                      })()}
                    </span>
                    <div>
                      <p className="text-sm text-slate-500">Se registrará automáticamente</p>
                      <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
                        {PUNCH_TYPE_LABEL[confirmPunch.type]}
                      </p>
                    </div>
                    <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-slate-900">
                      {formatTime12(formatClock24(now))}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full origin-left rounded-full bg-gradient-to-r from-success to-success/70"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: kiosk.autoRegisterSeconds, ease: 'linear' }}
                      />
                    </div>
                    <p className="text-center text-xs font-medium text-slate-400">
                      Se registra en {secondsLeft} {secondsLeft === 1 ? 'segundo' : 'segundos'}…
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <Button
                      size="xl"
                      variant="success"
                      className="w-full text-base"
                      onClick={() => doPunch(confirmPunch.type)}
                    >
                      <Check className="h-5 w-5" strokeWidth={3} />
                      Registrar ahora
                    </Button>
                    <Button size="lg" variant="destructive" className="w-full" onClick={reset}>
                      No soy yo / Cancelar
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setPhase('punch')}
                        className="rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                      >
                        Es otro movimiento
                      </button>
                    </div>
                  </div>
                </div>
              </FlowCard>
            )}

            {phase === 'punch' && employee && (
              <FlowCard key="punch" onBack={reset} title="Identificación confirmada">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3">
                    <Avatar name={employee.fullName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-slate-900">
                        {employee.fullName}
                      </p>
                      <p className="truncate text-[13px] text-slate-500">
                        {employee.employeeNumber} · {employee.position}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                      {(() => {
                        const Icon = METHOD_META[method].Icon
                        return <Icon className="h-3.5 w-3.5" />
                      })()}
                      {METHOD_META[method].label}
                    </span>
                  </div>

                  {punches.length > 0 ? (
                    <div className="rounded-lg border border-slate-200">
                      <p className="border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Registros de hoy
                      </p>
                      <ul className="divide-y divide-slate-100 text-[13px]">
                        {[...punches]
                          .sort((a, b) => a.time.localeCompare(b.time))
                          .map((p) => (
                            <li key={p.type} className="flex justify-between px-3.5 py-2">
                              <span className="text-slate-500">{PUNCH_TYPE_LABEL[p.type]}</span>
                              <span className="font-medium tabular-nums text-slate-800">
                                {formatTime12(p.time)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setShowWeekSummary((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Resumen de mi semana
                    {showWeekSummary ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {showWeekSummary && weekSummary ? (
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className="text-slate-500">Horas trabajadas</span>
                        <span className="font-semibold tabular-nums text-slate-900">
                          {formatDuration(weekSummary.workedMinutes)}{' '}
                          <span className="font-normal text-slate-400">
                            / {formatDuration(weekSummary.targetMinutes)}
                          </span>
                        </span>
                      </div>
                      <Progress
                        value={
                          weekSummary.targetMinutes
                            ? (weekSummary.workedMinutes / weekSummary.targetMinutes) * 100
                            : 0
                        }
                        className="mt-2"
                      />
                      <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-100 text-center">
                        <div>
                          <dd className="text-sm font-semibold tabular-nums text-slate-900">
                            {weekSummary.lateCount}
                          </dd>
                          <dt className="text-[11px] text-slate-500">Retardos</dt>
                        </div>
                        <div>
                          <dd className="text-sm font-semibold tabular-nums text-slate-900">
                            {weekSummary.absenceCount}
                          </dd>
                          <dt className="text-[11px] text-slate-500">Faltas</dt>
                        </div>
                        <div>
                          <dd className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatDuration(weekSummary.overtimeMinutes)}
                          </dd>
                          <dt className="text-[11px] text-slate-500">Extra</dt>
                        </div>
                      </dl>
                    </div>
                  ) : null}

                  {confirmPunch ? (
                    <div className="space-y-2 pt-1">
                      <Button size="xl" className="w-full text-base" onClick={() => doPunch(confirmPunch.type)}>
                        {confirmPunch.label}
                        <span className="ml-2 font-mono text-sm opacity-90">
                          {formatClockTime(now).replace(/:\d\d /, ' ')}
                        </span>
                      </Button>
                      <div className="flex items-center justify-between">
                        <Dropdown
                          align="start"
                          className="w-72"
                          trigger={
                            <button type="button" className="text-[13px] text-slate-500 hover:text-slate-800">
                              Registrar otro movimiento
                            </button>
                          }
                        >
                          {(['entry', 'lunch_out', 'lunch_in', 'exit'] as PunchType[]).map((t) => {
                            const blocked = canRegisterPunch(punches, t, company.attendanceSettings)
                            return (
                              <DropdownItem key={t} onSelect={() => doPunch(t)} disabled={!!blocked}>
                                <span className="flex flex-col">
                                  {PUNCH_TYPE_LABEL[t]}
                                  {blocked ? (
                                    <span className="text-[11px] font-normal text-slate-400">{blocked}</span>
                                  ) : null}
                                </span>
                              </DropdownItem>
                            )
                          })}
                        </Dropdown>
                        <button type="button" onClick={reset} className="text-[13px] text-slate-500 hover:text-slate-800">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-[13px] text-emerald-800">
                        Ya registraste todos tus movimientos de hoy.
                      </p>
                      <Button variant="secondary" size="lg" className="w-full" onClick={reset}>
                        Cerrar
                      </Button>
                    </div>
                  )}
                </div>
              </FlowCard>
            )}

            {phase === 'success' && employee && lastPunch && (
              <motion.div
                key="success"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/[0.08]"
              >
                <div className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white px-7 pb-7 pt-10 text-center">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(closest-side,rgba(16,185,129,0.18),transparent)]" />
                  <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-full bg-emerald-500/12"
                    />
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 320, damping: 16 }}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-white"
                    >
                      <Check className="h-7 w-7" strokeWidth={3} />
                    </motion.span>
                  </div>

                  <p className="relative mt-4 text-sm font-semibold uppercase tracking-wider text-emerald-700">
                    {PUNCH_TYPE_LABEL[lastPunch.type]} registrada
                  </p>
                  <p className="relative mt-1.5 font-mono text-6xl font-bold tabular-nums tracking-tight text-slate-900">
                    {formatTime12(lastPunch.time)}
                  </p>
                  <p className="relative mt-1.5 text-[13px] text-slate-400">{formatLongDate(now)}</p>
                </div>

                <div className="border-t border-slate-100 px-7 pb-7 pt-6">
                  <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
                    <Avatar name={employee.fullName} size="xl" className="h-14 w-14 text-base ring-4 ring-white shadow-sm" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {employee.fullName}
                      </p>
                      <p className="truncate text-[13px] text-slate-500">
                        {employee.employeeNumber} · {employee.position}
                      </p>
                    </div>
                  </div>

                  {lastPunch.photo ? (
                    <div className="mt-3.5 overflow-hidden rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-500">
                        <ScanFace className="h-3.5 w-3.5" />
                        Verificación facial
                      </div>
                      <img src={lastPunch.photo} alt="Verificación facial" className="h-40 w-full object-cover" />
                    </div>
                  ) : null}

                  {notices.length > 0 ? (
                    <div className="mt-3.5 space-y-2">
                      {notices.map((n) => (
                        <div
                          key={n.title}
                          className="flex gap-2.5 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50/60 px-3.5 py-2.5"
                        >
                          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          <div>
                            <p className="text-[13px] font-semibold text-amber-900">{n.title}</p>
                            <p className="text-[13px] text-amber-800/90">{n.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        {(() => {
                          const Icon = METHOD_META[method].Icon
                          return <Icon className="h-4 w-4" />
                        })()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Método</p>
                        <p className="truncate text-[13px] font-medium text-slate-800">{METHOD_META[method].label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Punto de registro</p>
                        <p className="truncate text-[13px] font-medium text-slate-800">
                          {device?.name ?? branch?.name ?? '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {lastPunch.location ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        {branch?.lat != null && branch?.lng != null ? 'Ubicación de la sucursal' : 'Ubicación del registro'}
                      </div>
                      <iframe
                        title="Mapa de la ubicación del registro"
                        className="h-36 w-full border-0 grayscale-[15%]"
                        loading="lazy"
                        src={osmEmbedUrl(lastPunch.location)}
                      />
                      <a
                        href={`https://www.google.com/maps?q=${lastPunch.location.lat},${lastPunch.location.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block px-3.5 py-2 text-center text-[12px] font-medium text-primary hover:underline"
                      >
                        Ver en el mapa · {lastPunch.location.lat.toFixed(5)}, {lastPunch.location.lng.toFixed(5)}
                      </a>
                    </div>
                  ) : null}

                  <Button className="mt-5 w-full text-base" size="xl" onClick={reset}>
                    Listo
                  </Button>
                </div>

                {/* Auto-close countdown */}
                <div className="h-1 bg-slate-100">
                  <motion.div
                    className="h-full origin-left bg-emerald-500/70"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: 4.5, ease: 'linear' }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="pb-4 text-center text-xs text-slate-400">Nexotime · Control de asistencia · {copyrightLine()}</p>
      </section>

      <KioskExitGate
        open={showExitGate}
        expectedPin={kiosk.exitPin}
        onClose={() => setShowExitGate(false)}
        onSuccess={() => navigate('/')}
      />
    </div>
  )
}

/** 146 → "2 h 26 min" */
function humanMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Free OpenStreetMap embed, no API key — close enough zoom to see the street. */
function osmEmbedUrl({ lat, lng }: PunchLocation): string {
  const dLng = 0.004
  const dLat = 0.0028
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat}%2C${lng}&layer=mapnik`
}

function FlowCard({
  children,
  onBack,
  title,
}: {
  children: React.ReactNode
  onBack: () => void
  title?: string
}) {
  return (
    <motion.div
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </button>
        {title ? <span className="text-[13px] text-slate-500">{title}</span> : null}
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  )
}
