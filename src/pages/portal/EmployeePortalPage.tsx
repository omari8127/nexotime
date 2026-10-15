import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Loader2,
  LogOut,
  MapPin,
  MapPinCheck,
  MapPinOff,
  MapPinX,
  Plane,
  RefreshCw,
  ScanFace,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { NexotimeMark } from '@/components/shared/Logo'
import { FullScreenLoader } from '@/components/shared/Loaders'
import { AnimatedCheck } from '@/components/shared/SuccessDialog'
import { AttendanceStatusBadge, IncidenciaStatusBadge } from '@/components/shared/badges'
import { PunchPill } from '@/components/attendance/PunchPill'
import { FaceVerifyFlow } from '@/components/clock/FaceVerifyFlow'
import { MiniMap } from '@/components/shared/MiniMap'
import { ColorStrip, PUBLIC_VARS } from '@/components/shared/PublicChrome'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useLightTheme } from '@/hooks/useLightTheme'
import { PUNCH_TYPE_LABEL, WEEKDAY_LABEL, canRegisterPunch, presenceOf, weekdayFromISO } from '@/lib/attendance'
import { PUNCH_ORDER } from '@/lib/dayEdit'
import { faceCandidates } from '@/lib/face'
import { formatDistance } from '@/lib/geo'
import { resolveKiosk } from '@/lib/kiosk'
import { buildPortalPunch } from '@/lib/portalPunch'
import { checkPortalZone, portalPunchLocation, portalZoneProblem, resolvePortalZone, type PortalZoneCheck } from '@/lib/portalZone'
import { PUNCH_STYLE, compactDuration } from '@/lib/punchStyle'
import { inTimezone } from '@/lib/today'
import { countVacationDays, vacationBalance } from '@/lib/vacations'
import { cn, formatClock24, formatLongDate, formatShortDate, formatTime12 } from '@/lib/utils'
import type { PhotoCapture } from '@/lib/photoEvidence'
import { PortalSessionError, PortalStaleError, portalApi, type PortalState } from '@/services/portal/portalApi'
import { readPortalToken, savePortalToken } from '@/services/portal/portalSession'
import type { AttendanceRecord, Incidencia, PunchLocation, PunchType } from '@/types'

type Tab = 'checar' | 'asistencia' | 'vacaciones'

const TABS: Array<{ value: Tab; label: string; icon: typeof Clock3 }> = [
  { value: 'checar', label: 'Checar', icon: Clock3 },
  { value: 'asistencia', label: 'Mi asistencia', icon: CalendarDays },
  { value: 'vacaciones', label: 'Vacaciones', icon: Plane },
]

const PRESENCE = {
  none: { label: 'Sin entrada hoy', variant: 'muted' as const },
  working: { label: 'Trabajando', variant: 'success' as const },
  lunch: { label: 'En comida', variant: 'warning' as const },
  done: { label: 'Jornada terminada', variant: 'default' as const },
}

/** An old link with the company code in the path still works: it lands on the entry screen. */
export function EmployeePortalLink() {
  const { code = '' } = useParams()
  return <Navigate to={`/activar?modo=empleado&empresa=${encodeURIComponent(code)}`} replace />
}

/**
 * The employee's own portal, made for a phone: register the day's movements (each one with a photo
 * taken at that moment), see the recent days and ask for vacations.
 */
export function EmployeePortalPage() {
  useLightTheme()
  const navigate = useNavigate()
  const [token] = useState(readPortalToken)
  const [state, setState] = useState<PortalState | null>(null)
  const [failure, setFailure] = useState('')
  const [tab, setTab] = useState<Tab>('checar')
  const [capture, setCapture] = useState<PunchType | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ type: PunchType; time: string; photo: string; location?: PunchLocation } | null>(null)
  /** Server clock − phone clock, so the hour shown and stamped is the company's, not the phone's. */
  const offset = useRef(0)
  const { location, denied: locationDenied, refresh: refreshLocation } = useGeolocation()

  const leave = useCallback(
    (message?: string) => {
      savePortalToken(null)
      if (message) toast.info('Sesión terminada', message)
      navigate('/activar?modo=empleado', { replace: true })
    },
    [navigate],
  )

  const load = useCallback(async (): Promise<PortalState | null> => {
    if (!token) return null
    try {
      const next = await portalApi.state(token)
      offset.current = Date.parse(next.serverNow) - Date.now()
      setState(next)
      setFailure('')
      return next
    } catch (e) {
      if (e instanceof PortalSessionError) leave(e.message)
      else setFailure(e instanceof Error ? e.message : 'No se pudo cargar tu información.')
      return null
    }
  }, [token, leave])

  useEffect(() => {
    void load()
    // Coming back to the tab (the phone was locked, another app was used): what is on screen may be old.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const now = useCallback(
    () => inTimezone(new Date(Date.now() + offset.current), state?.company.timezone ?? null),
    [state?.company.timezone],
  )

  if (!token) return <Navigate to="/activar?modo=empleado" replace />
  if (!state) {
    return failure ? (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">{failure}</p>
        <div className="flex gap-2">
          <Button onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
          <Button variant="secondary" onClick={() => leave()}>
            Salir
          </Button>
        </div>
      </div>
    ) : (
      <FullScreenLoader />
    )
  }

  const { employee, company } = state
  const todayRecord = state.attendance.find((r) => r.date === state.today)
  const kiosk = resolveKiosk(company.attendanceSettings)
  const enrolled = faceCandidates([employee]).length > 0
  // Where they are against their branch's allowed zone: the database checks it again on every punch.
  const branchPoint =
    state.branch?.lat != null && state.branch?.lng != null ? { lat: state.branch.lat, lng: state.branch.lng } : undefined
  const zoneCheck = checkPortalZone(location, branchPoint, resolvePortalZone(company.attendanceSettings), !!employee.remotePunch)
  const zoneProblem = portalZoneProblem(zoneCheck, state.branch?.name)

  const submit = async (type: PunchType, photo: PhotoCapture) => {
    if (saving) return
    setSaving(true)
    try {
      let current = state
      let saved: AttendanceRecord | undefined
      for (let attempt = 0; attempt < 2 && !saved; attempt++) {
        const record = buildPortalPunch({
          existing: current.attendance.find((r) => r.date === current.today),
          employee,
          schedule: current.schedule,
          settings: current.company.attendanceSettings,
          punch: {
            type,
            time: formatClock24(now()),
            method: 'app',
            photoEvidence: { id: photo.id, capturedAt: photo.capturedAt },
            location: location ? portalPunchLocation(location, zoneCheck) : undefined,
          },
          today: current.today,
        })
        try {
          saved = await portalApi.punch(token, record, photo)
        } catch (e) {
          // The day changed under us (a punch at the reloj, midnight, a corrected clock): read it again, once.
          if (!(e instanceof PortalStaleError) || attempt === 1) throw e
          const fresh = await load()
          if (!fresh) throw e
          current = fresh
        }
      }
      if (!saved) return
      const record = saved
      setState((s) =>
        s ? { ...s, attendance: [record, ...s.attendance.filter((r) => r.id !== record.id && r.date !== record.date)] } : s,
      )
      const made = record.punches.find((p) => p.type === type)
      setDone({ type, time: made?.time ?? formatClock24(now()), photo: photo.dataUrl, location: made?.location })
    } catch (e) {
      if (e instanceof PortalSessionError) leave(e.message)
      else toast.error('No se registró', e instanceof Error ? e.message : 'Inténtalo de nuevo.')
    } finally {
      setSaving(false)
      setCapture(null)
    }
  }

  return (
    <div className="min-h-dvh bg-white pb-28 font-sans text-slate-900 antialiased" style={PUBLIC_VARS}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3.5">
          <NexotimeMark className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">{employee.fullName}</p>
            <p className="truncate text-xs text-slate-500">
              {employee.employeeNumber} · {company.name}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            onClick={() => {
              void portalApi.logout(token)
              leave()
            }}
          >
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-5">
        {portalApi.demo ? (
          <p className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Demostración: los movimientos se guardan solo en este navegador.
          </p>
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'checar' ? (
              <PunchPanel
                state={state}
                todayRecord={todayRecord}
                now={now}
                zone={zoneCheck}
                zoneProblem={zoneProblem}
                anywhere={!!employee.remotePunch}
                onRefreshLocation={refreshLocation}
                locationDenied={locationDenied}
                enrolled={enrolled}
                onPick={(type) => {
                  // A fresh reading while the photo is taken: the movement carries where they are now.
                  refreshLocation()
                  if (zoneProblem) toast.error('Todavía no puedes checar', zoneProblem)
                  else setCapture(type)
                }}
              />
            ) : tab === 'asistencia' ? (
              <HistoryPanel state={state} />
            ) : (
              <VacationPanel
                state={state}
                token={token}
                onChange={(incidencias) => setState((s) => (s ? { ...s, incidencias } : s))}
                onSessionEnd={leave}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {TABS.map((t) => {
            const active = tab === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 px-2 pb-3 pt-2.5 text-[11px] font-semibold transition-colors',
                  active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {active ? (
                  <motion.span layoutId="portal-tab" className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-slate-900" />
                ) : null}
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Camera step: always on white, the way the capture screen was designed and tested. */}
      <AnimatePresence>
        {capture ? (
          <motion.div
            key="capture"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 overflow-y-auto bg-white text-slate-900"
          >
            <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-6">
              {saving ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-lg font-semibold">Registrando tu {PUNCH_STYLE[capture].label.toLowerCase()}…</p>
                </div>
              ) : (
                <FaceVerifyFlow
                  employee={employee}
                  employees={[employee]}
                  settings={{ ...kiosk, faceDistance: 'near', faceZoom: 1 }}
                  mode={enrolled && kiosk.faceCheckOnPin ? 'verify' : 'evidence'}
                  keepPhoto
                  stepLabel={`${PUNCH_STYLE[capture].label} · ${enrolled && kiosk.faceCheckOnPin ? 'verificación de identidad' : 'foto de verificación'}`}
                  photoNote="La foto se guarda con este movimiento: tu empresa la usa para comprobar que fuiste tú."
                  onCancel={() => setCapture(null)}
                  onVerified={({ photo }) => void submit(capture, photo)}
                />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5"
            onClick={() => setDone(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-2xl ring-1 ring-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatedCheck className="mx-auto h-20 w-20" />
              <h2 className="mt-3 font-display text-xl font-semibold tracking-[-0.02em]">¡{PUNCH_STYLE[done.type].label} registrada!</h2>
              <p className="mt-1 font-display text-4xl font-semibold tabular-nums tracking-[-0.03em]">{formatTime12(done.time)}</p>
              <div className={cn('mt-4 grid gap-2.5', done.location ? 'grid-cols-2' : 'grid-cols-1')}>
                <img src={done.photo} alt="Tu foto de verificación" className="h-32 w-full rounded-xl border border-border object-cover" />
                {done.location ? (
                  <MiniMap location={done.location} link className="h-32 w-full rounded-xl border border-border" />
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Foto guardada con el movimiento{done.location ? ' y tu ubicación' : ''}. Tu empresa puede revisarla.
              </p>
              <Button variant="success" size="lg" className="mt-5 w-full" autoFocus onClick={() => setDone(null)}>
                Listo
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Checar                                                                     */
/* -------------------------------------------------------------------------- */

function LiveClock({ now }: { now: () => Date }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const date = now()
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return (
    <p className="font-display text-[3.25rem] font-semibold leading-none tabular-nums tracking-[-0.04em] text-slate-900">
      {formatTime12(formatClock24(date)).replace(/ [ap]\.m\.$/, '')}
      <span className="text-2xl font-medium tracking-normal text-slate-400">:{seconds}</span>
      <span className="ml-2 text-xl font-semibold tracking-normal text-slate-500">{date.getHours() < 12 ? 'a.m.' : 'p.m.'}</span>
    </p>
  )
}

function PunchPanel({
  state,
  todayRecord,
  now,
  zone,
  zoneProblem,
  anywhere,
  onRefreshLocation,
  locationDenied,
  enrolled,
  onPick,
}: {
  state: PortalState
  todayRecord?: AttendanceRecord
  now: () => Date
  /** Where the phone is against the branch's allowed zone. */
  zone: PortalZoneCheck
  /** Why they cannot check in right now (no GPS, imprecise, too far); null when they can. */
  zoneProblem: string | null
  anywhere: boolean
  onRefreshLocation: () => void
  locationDenied: boolean
  enrolled: boolean
  onPick: (type: PunchType) => void
}) {
  const settings = state.company.attendanceSettings
  const punches = todayRecord?.punches ?? []
  const presence = presenceOf(punches)
  const types = PUNCH_ORDER.filter((t) => settings.trackLunch || (t !== 'lunch_out' && t !== 'lunch_in'))

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-white text-center shadow-sm ring-1 ring-slate-200">
        <ColorStrip />
        <div className="px-5 pb-5 pt-5">
          <LiveClock now={now} />
          <p className="mt-2 text-sm text-slate-500">{formatLongDate(new Date(`${state.today}T00:00:00`))}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Badge variant={PRESENCE[presence].variant} className="rounded-full px-3 py-1 text-xs font-semibold">
              {PRESENCE[presence].label}
            </Badge>
            <ZoneChip zone={zone} anywhere={anywhere} denied={locationDenied} />
          </div>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {zoneProblem ? (
          <motion.div
            key="zone-problem"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'flex items-start gap-3 overflow-hidden rounded-2xl px-4 py-3.5 text-sm leading-snug ring-1',
              zone.kind === 'outside'
                ? 'bg-rose-50 text-rose-900 ring-rose-200'
                : 'bg-amber-50 text-amber-900 ring-amber-200',
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1',
                zone.kind === 'outside' ? 'text-rose-600 ring-rose-200' : 'text-amber-600 ring-amber-200',
              )}
            >
              {zone.kind === 'outside' ? <MapPinX className="h-5 w-5" /> : <MapPinOff className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p>{zoneProblem}</p>
              {locationDenied ? null : (
                <button
                  type="button"
                  onClick={onRefreshLocation}
                  className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 transition-transform active:scale-95"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Volver a leer mi ubicación
                </button>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="grid grid-cols-2 gap-3">
        {types.map((type, index) => {
          const style = PUNCH_STYLE[type]
          const made = punches.find((p) => p.type === type)
          const notNow = canRegisterPunch(punches, type, settings)
          // Not possible today, or not from where the phone is right now.
          const blocked = notNow || (!made && zoneProblem)
          return (
            <motion.button
              key={type}
              type="button"
              disabled={!!blocked}
              onClick={() => onPick(type)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.25 }}
              whileTap={blocked ? undefined : { scale: 0.96 }}
              className={cn(
                'flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-2xl px-3 py-4 text-center transition-shadow',
                made
                  ? cn('ring-1 ring-inset ring-black/5', style.soft)
                  : blocked
                    ? 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200'
                    : cn(style.solid, 'shadow-md shadow-slate-900/10 hover:shadow-lg'),
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl',
                  made ? 'bg-white/70' : blocked ? cn('bg-white ring-1 ring-slate-200', style.text) : 'bg-white/20',
                )}
              >
                {made ? <Check className="h-6 w-6" strokeWidth={3} /> : <style.Icon className="h-6 w-6" />}
              </span>
              <span className="text-[15px] font-semibold leading-tight">{style.label}</span>
              <span className="text-xs font-medium tabular-nums opacity-90">
                {made ? formatTime12(made.time) : notNow ? 'No disponible' : blocked ? 'Revisa tu ubicación' : 'Tocar para registrar'}
              </span>
            </motion.button>
          )
        })}
      </section>

      <p className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
        {enrolled ? <ScanFace className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" /> : <Camera className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />}
        {enrolled
          ? 'Antes de registrar, la cámara compara tu rostro con el que tienes registrado y guarda la foto.'
          : 'Antes de registrar se toma una foto tuya. Se guarda con el movimiento y la revisa tu empresa.'}
        {' Cada movimiento guarda tu ubicación real (GPS del celular).'}
      </p>
    </div>
  )
}

/** One glance: can I check in from here? Green in the zone, amber waiting for GPS, red too far. */
function ZoneChip({ zone, anywhere, denied }: { zone: PortalZoneCheck; anywhere: boolean; denied: boolean }) {
  const look =
    zone.kind === 'inside'
      ? { Icon: MapPinCheck, tone: 'bg-emerald-50 text-emerald-700' }
      : zone.kind === 'outside'
        ? zone.blocked
          ? { Icon: MapPinX, tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-300' }
          : { Icon: MapPinX, tone: 'bg-amber-400/20 text-amber-800 dark:text-amber-200' }
        : zone.kind === 'imprecise' || denied
          ? { Icon: MapPinOff, tone: 'bg-amber-400/20 text-amber-800 dark:text-amber-200' }
          : { Icon: MapPin, tone: 'bg-slate-100 text-slate-600' }
  const text =
    zone.kind === 'no_location'
      ? denied
        ? 'Ubicación bloqueada'
        : 'Buscando tu ubicación…'
      : zone.kind === 'imprecise'
        ? `Esperando GPS preciso${zone.accuracy != null ? ` · ±${formatDistance(zone.accuracy)}` : ''}`
        : zone.kind === 'outside'
          ? `Fuera de tu zona · a ${formatDistance(zone.distance)}${zone.blocked ? '' : ' (se marcará)'}`
          : anywhere
            ? 'Puedes checar desde cualquier lugar'
            : zone.checked && zone.distance != null
              ? `En tu zona · a ${formatDistance(zone.distance)} de tu sucursal`
              : 'Ubicación lista'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', look.tone)}>
      {zone.kind === 'no_location' && !denied ? <Loader2 className="h-3 w-3 animate-spin" /> : <look.Icon className="h-3 w-3" />}
      {text}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Mi asistencia                                                              */
/* -------------------------------------------------------------------------- */

function HistoryPanel({ state }: { state: PortalState }) {
  const records = useMemo(
    () => [...state.attendance].filter((r) => r.punches.length > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31),
    [state.attendance],
  )
  const month = state.today.slice(0, 7)
  const inMonth = records.filter((r) => r.date.startsWith(month))
  const worked = inMonth.reduce((n, r) => n + r.workedMinutes, 0)
  const late = inMonth.filter((r) => r.lateMinutes > 0).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Mini label="Días este mes" value={String(inMonth.length)} />
        <Mini label="Horas" value={compactDuration(worked)} />
        <Mini label="Retardos" value={String(late)} tone={late > 0 ? 'text-warning' : undefined} />
      </div>

      {records.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Todavía no tienes registros.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {records.map((r, index) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.2 }}
              className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {WEEKDAY_LABEL[weekdayFromISO(r.date)]} <span className="font-normal text-muted-foreground">{formatShortDate(r.date)}</span>
                </p>
                <AttendanceStatusBadge status={r.status} />
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {PUNCH_ORDER.map((type) => {
                  const punch = r.punches.find((p) => p.type === type)
                  return (
                    <div key={type} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 sm:flex-col sm:items-start">
                      <span className="text-[11px] text-muted-foreground">{PUNCH_TYPE_LABEL[type]}</span>
                      <PunchPill type={type} time={punch?.time} edited={punch?.edited} className="min-w-[4.75rem]" />
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {r.date === state.today && !r.punches.some((p) => p.type === 'exit')
                  ? 'Jornada en curso'
                  : `${compactDuration(r.workedMinutes)} h trabajadas`}
                {r.lateMinutes > 0 ? ` · retardo de ${r.lateMinutes} min` : ''}
              </p>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 text-center shadow-sm ring-1 ring-slate-200">
      <p className={cn('font-display text-2xl font-semibold tabular-nums tracking-tight', tone)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Vacaciones                                                                 */
/* -------------------------------------------------------------------------- */

function VacationPanel({
  state,
  token,
  onChange,
  onSessionEnd,
}: {
  state: PortalState
  token: string
  onChange: (incidencias: Incidencia[]) => void
  onSessionEnd: (message?: string) => void
}) {
  const [from, setFrom] = useState(state.today)
  const [to, setTo] = useState(state.today)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const balance = vacationBalance(state.employee, state.incidencias, state.schedule, state.today)
  const mine = state.incidencias
    .filter((i) => i.type === 'vacaciones')
    .sort((a, b) => b.from.localeCompare(a.from))
  const asking = to >= from ? countVacationDays(from, to, state.schedule) : 0

  const guard = (e: unknown) => {
    if (e instanceof PortalSessionError) onSessionEnd(e.message)
    else setError(e instanceof Error ? e.message : 'No se pudo completar.')
  }

  const send = async () => {
    setError('')
    if (to < from) {
      setError('El regreso no puede ser antes de la salida.')
      return
    }
    setBusy(true)
    try {
      const created = await portalApi.requestVacation(token, from, to, reason)
      onChange([created, ...state.incidencias])
      setReason('')
      setSent(true)
      window.setTimeout(() => setSent(false), 2600)
    } catch (e) {
      guard(e)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: string) => {
    setError('')
    try {
      await portalApi.cancelVacation(token, id)
      onChange(state.incidencias.filter((i) => i.id !== id))
    } catch (e) {
      guard(e)
    }
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl bg-slate-900 p-5 text-white shadow-md">
        <p className="flex items-center gap-2 text-sm font-medium text-white/85">
          <Plane className="h-4 w-4" />
          Días de vacaciones
        </p>
        {balance.entitled > 0 ? (
          <>
            <p className="mt-2 text-5xl font-bold tabular-nums leading-none">
              {balance.available}
              <span className="ml-2 text-base font-medium text-white/80">disponibles de {balance.entitled}</span>
            </p>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/25">
              <motion.div
                className="h-full rounded-full bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (balance.taken / balance.entitled) * 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <p className="mt-2 text-xs text-white/80">
              {balance.taken} tomados{balance.pending > 0 ? ` · ${balance.pending} en revisión` : ''} · hasta el{' '}
              {formatShortDate(balance.periodEnd)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-white/90">
            Tus primeros 12 días por ley llegan al cumplir un año: el {formatShortDate(balance.nextAnniversary)}. Puedes
            pedir días desde ahora si tu empresa lo permite.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold">Pedir vacaciones</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Salgo el</Label>
            <Input
              type="date"
              value={from}
              min={state.today}
              onChange={(e) => {
                const value = e.target.value || state.today
                setFrom(value)
                if (to < value) setTo(value)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Último día</Label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value || from)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Comentario (opcional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} className="min-h-[60px]" placeholder="Ej. Viaje familiar" />
        </div>
        <p className="text-xs text-muted-foreground">
          {asking} {asking === 1 ? 'día laborable' : 'días laborables'} según tu horario.
          {balance.entitled > 0 && asking > balance.available ? ' Son más de los que te quedan este año.' : ''}
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" size="lg" disabled={busy || asking === 0} onClick={() => void send()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plane className="h-4 w-4" />}
          Enviar solicitud
        </Button>
        <AnimatePresence>
          {sent ? (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg bg-success/12 px-3 py-2 text-center text-sm font-medium text-success"
            >
              Solicitud enviada. Tu empresa la revisará.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold">Mis solicitudes</h2>
        {mine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Aún no has pedido vacaciones.
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {mine.map((i) => (
                <motion.li
                  key={i.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {i.from === i.to ? formatShortDate(i.from) : `${formatShortDate(i.from)} – ${formatShortDate(i.to)}`}
                    </p>
                    <IncidenciaStatusBadge status={i.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {countVacationDays(i.from, i.to, state.schedule)} días laborables
                    {i.reason ? ` · ${i.reason}` : ''}
                  </p>
                  {i.reviewedByName ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i.status === 'rejected' ? 'Rechazó' : 'Revisó'} {i.reviewedByName}
                      {i.reviewNote ? `: ${i.reviewNote}` : ''}
                    </p>
                  ) : null}
                  {i.status === 'pending' ? (
                    <Button variant="ghost" size="sm" className="mt-1.5 -ml-2 text-destructive" onClick={() => void cancel(i.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Cancelar solicitud
                    </Button>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  )
}
