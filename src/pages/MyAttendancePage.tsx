import { useMemo, useState } from 'react'
import {
  AlarmClockOff,
  CalendarCheck2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  LogIn,
  LogOut,
  PencilLine,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import {
  AttendanceStatusBadge,
  CorrectionStatusBadge,
  IncidenciaBadge,
  IncidenciaStatusBadge,
  MethodBadge,
} from '@/components/shared/badges'
import { CorrectionRequestDialog } from '@/components/attendance/CorrectionRequestDialog'
import { useDataStore } from '@/store/dataStore'
import { useLiveClock, formatClockTime } from '@/hooks/useLiveClock'
import { useToday } from '@/hooks/useToday'
import {
  PUNCH_TYPE_LABEL,
  canRegisterPunch,
  getRecordFlags,
  presenceOf,
  scheduleDayFor,
  weekdayFromISO,
} from '@/lib/attendance'
import { formatClock24, formatDuration, formatShortDate, formatTime12, cn } from '@/lib/utils'
import { JUSTIFYING_TYPES } from '@/data/incidencias'
import type { AttendanceRecord, PunchType } from '@/types'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const WEEK_HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const PUNCH_BUTTONS: Array<{ type: PunchType; label: string; Icon: typeof LogIn }> = [
  { type: 'entry', label: 'Entrada', Icon: LogIn },
  { type: 'lunch_out', label: 'Salida a comida', Icon: Utensils },
  { type: 'lunch_in', label: 'Regreso de comida', Icon: UtensilsCrossed },
  { type: 'exit', label: 'Salida', Icon: LogOut },
]

const PRESENCE_LABEL = {
  none: { label: 'Sin entrada hoy', variant: 'muted' as const },
  working: { label: 'Trabajando', variant: 'success' as const },
  lunch: { label: 'En comida', variant: 'warning' as const },
  done: { label: 'Jornada terminada', variant: 'default' as const },
}

type DayKind =
  | 'blank'
  | 'future'
  | 'pending'
  | 'rest'
  | 'incidencia'
  | 'present'
  | 'late'
  | 'absent'
  | 'incomplete'
  | 'overtime'

const KIND_STYLE: Record<DayKind, string> = {
  blank: 'text-muted-foreground/40',
  future: 'text-muted-foreground',
  pending: 'border-primary/40 text-foreground',
  rest: 'bg-muted/60 text-muted-foreground',
  incidencia: 'bg-primary/10 text-primary',
  present: 'bg-success/15 text-success',
  late: 'bg-warning/15 text-warning',
  absent: 'bg-destructive/15 text-destructive',
  incomplete: 'bg-primary/10 text-primary',
  overtime: 'bg-success/15 text-success',
}

export function MyAttendancePage() {
  const now = useLiveClock()
  const today = useToday()
  const currentUser = useDataStore((s) => s.currentUser)
  const employees = useDataStore((s) => s.employees)
  const schedules = useDataStore((s) => s.schedules)
  const attendance = useDataStore((s) => s.attendance)
  const incidencias = useDataStore((s) => s.incidencias)
  const corrections = useDataStore((s) => s.corrections)
  const company = useDataStore((s) => s.company)
  const registerPunch = useDataStore((s) => s.registerPunch)

  const employee = employees.find((e) => e.id === currentUser.employeeId)
  const schedule = schedules.find((s) => s.id === employee?.scheduleId)

  const [month, setMonth] = useState(() => today.slice(0, 7)) // "YYYY-MM"
  const [selected, setSelected] = useState(today)
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestType, setRequestType] = useState<PunchType | undefined>()

  const mine = useMemo(
    () => attendance.filter((r) => r.employeeId === employee?.id),
    [attendance, employee?.id],
  )
  const myIncidencias = useMemo(
    () => incidencias.filter((i) => i.employeeId === employee?.id),
    [incidencias, employee?.id],
  )
  const myCorrections = useMemo(
    () =>
      corrections
        .filter((c) => c.employeeId === employee?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [corrections, employee?.id],
  )
  const recordByDate = useMemo(() => new Map(mine.map((r) => [r.date, r])), [mine])

  const todayRecord = recordByDate.get(today)
  const presence = presenceOf(todayRecord?.punches)

  const [year, monthIndex] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthIndex, 0).getDate()
  const firstWeekday = (new Date(year, monthIndex - 1, 1).getDay() + 6) % 7 // Monday = 0

  const classify = (iso: string, record: AttendanceRecord | undefined): DayKind => {
    if (!employee || !schedule) return 'blank'
    if (iso < employee.hireDate) return 'blank'
    const day = scheduleDayFor(schedule, weekdayFromISO(iso))
    const excused = myIncidencias.some(
      (i) =>
        i.status === 'approved' && JUSTIFYING_TYPES.includes(i.type) && iso >= i.from && iso <= i.to,
    )
    if (excused) return 'incidencia'
    if (record && record.punches.length > 0) return record.status === 'rest' ? 'present' : (record.status as DayKind)
    if (!day?.enabled) return 'rest'
    if (iso > today) return 'future'
    if (iso === today) return 'pending'
    return 'absent'
  }

  const monthStats = useMemo(() => {
    let worked = 0
    let overtime = 0
    let late = 0
    let absent = 0
    let days = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${month}-${String(d).padStart(2, '0')}`
      const record = recordByDate.get(iso)
      const kind = classify(iso, record)
      if (record?.punches.some((p) => p.type === 'entry')) days += 1
      if (record) {
        worked += record.workedMinutes
        overtime += record.overtimeMinutes
      }
      if (kind === 'late') late += 1
      if (kind === 'absent') absent += 1
    }
    return { worked, overtime, late, absent, days }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, recordByDate, myIncidencias, employee, schedule, today, daysInMonth])

  if (!employee || !schedule) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="Tu acceso no está ligado a un empleado"
        description="Pide a Recursos Humanos que vincule tu usuario con tu ficha de empleado."
      />
    )
  }

  const shiftMonth = (delta: number) => {
    const d = new Date(year, monthIndex - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const doPunch = (type: PunchType) => {
    try {
      registerPunch({
        employeeId: employee.id,
        type,
        time: formatClock24(now),
        method: 'app',
        date: today,
      })
      toast.success(`${PUNCH_TYPE_LABEL[type]} registrada`, formatTime12(formatClock24(now)))
    } catch (e) {
      toast.error('No se pudo registrar', e instanceof Error ? e.message : undefined)
    }
  }

  const selectedRecord = recordByDate.get(selected)
  const selectedFlags = selectedRecord
    ? getRecordFlags(selectedRecord, schedule, company.attendanceSettings, today)
    : undefined
  const selectedIncidencias = myIncidencias.filter((i) => selected >= i.from && selected <= i.to)
  const selectedCorrections = myCorrections.filter((c) => c.date === selected)
  const monthIncidencias = myIncidencias.filter((i) => i.from.slice(0, 7) <= month && i.to.slice(0, 7) >= month)

  const openRequest = (type?: PunchType) => {
    setRequestType(type)
    setRequestOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi asistencia"
        description={`${employee.fullName} · ${employee.employeeNumber} · ${employee.position}`}
      />

      {/* --- Registrar ---------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-3xl font-bold tabular-nums">{formatClockTime(now)}</p>
              <p className="text-sm text-muted-foreground">Hoy · {formatShortDate(today)}</p>
            </div>
            <Badge variant={PRESENCE_LABEL[presence].variant}>{PRESENCE_LABEL[presence].label}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {PUNCH_BUTTONS.map(({ type, label, Icon }) => {
              const blocked = canRegisterPunch(todayRecord?.punches ?? [], type, company.attendanceSettings)
              const done = todayRecord?.punches.find((p) => p.type === type)
              return (
                <Button
                  key={type}
                  size="xl"
                  variant={blocked ? 'secondary' : 'default'}
                  disabled={!!blocked}
                  title={blocked ?? undefined}
                  onClick={() => doPunch(type)}
                  className="h-auto flex-col gap-1 py-4 text-base"
                >
                  <Icon className="h-6 w-6" />
                  {label}
                  <span className="text-xs font-normal opacity-80">
                    {done ? formatTime12(done.time) : blocked ? 'No disponible' : 'Registrar ahora'}
                  </span>
                </Button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Solo puedes registrar tus propios movimientos. Si olvidaste uno, solicita una corrección: un
            revisor autorizado la aprueba y queda en auditoría.
          </p>
        </CardContent>
      </Card>

      {/* --- Mes ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[10rem] text-center text-lg font-semibold">
            {MONTHS[monthIndex - 1]} {year}
          </p>
          <Button variant="secondary" size="icon" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="secondary" onClick={() => openRequest()}>
          <PencilLine className="h-4 w-4" />
          Solicitar corrección
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={CalendarCheck2} label="Días trabajados" value={String(monthStats.days)} />
        <Stat icon={AlarmClockOff} label="Retardos" value={String(monthStats.late)} tone="text-warning" />
        <Stat icon={CalendarX2} label="Faltas" value={String(monthStats.absent)} tone="text-destructive" />
        <Stat icon={Clock3} label="Horas trabajadas" value={formatDuration(monthStats.worked)} />
        <Stat icon={Hourglass} label="Horas extra" value={formatDuration(monthStats.overtime)} tone="text-success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
              {WEEK_HEAD.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const iso = `${month}-${String(idx + 1).padStart(2, '0')}`
                const kind = classify(iso, recordByDate.get(iso))
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelected(iso)}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center rounded-lg border border-transparent text-sm font-medium tabular-nums transition-colors hover:border-primary/50',
                      KIND_STYLE[kind],
                      selected === iso && 'ring-2 ring-primary',
                      iso === today && 'border-primary/60',
                    )}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <Legend className="bg-success/30" label="Presente / extra" />
              <Legend className="bg-warning/30" label="Retardo" />
              <Legend className="bg-destructive/30" label="Falta" />
              <Legend className="bg-primary/20" label="Incompleto / incidencia" />
              <Legend className="bg-muted" label="Descanso" />
            </div>
          </CardContent>
        </Card>

        {/* --- Detalle del día ------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{formatShortDate(selected)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedRecord && selectedRecord.punches.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <AttendanceStatusBadge status={selectedRecord.status} />
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(selectedRecord.workedMinutes)} trabajadas
                  </span>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {selectedRecord.punches.map((p) => (
                    <div key={p.type} className="flex items-center justify-between px-3 py-2">
                      <span>{PUNCH_TYPE_LABEL[p.type]}</span>
                      <span className="flex items-center gap-3">
                        <MethodBadge method={p.method} />
                        <span className="font-semibold tabular-nums">{formatTime12(p.time)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRecord.lateMinutes > 0 ? (
                    <Badge variant="warning">Retardo {selectedRecord.lateMinutes} min</Badge>
                  ) : null}
                  {selectedRecord.overtimeMinutes > 0 ? (
                    <Badge variant="success">Extra {formatDuration(selectedRecord.overtimeMinutes)}</Badge>
                  ) : null}
                  {selectedFlags && selectedFlags.earlyLeaveMinutes > 0 ? (
                    <Badge variant="warning">Salida anticipada {selectedFlags.earlyLeaveMinutes} min</Badge>
                  ) : null}
                  {selectedFlags && selectedFlags.lunchExcessMinutes > 0 ? (
                    <Badge variant="warning">Comida excedida {selectedFlags.lunchExcessMinutes} min</Badge>
                  ) : null}
                  {selectedFlags?.missingExit ? <Badge variant="destructive">Falta salida</Badge> : null}
                  {selectedFlags && selectedFlags.lunchMinutes > 0 ? (
                    <Badge variant="muted">Comida {formatDuration(selectedFlags.lunchMinutes)}</Badge>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                {selected > today ? 'Día futuro.' : 'Sin registros este día.'}
              </p>
            )}

            {selectedIncidencias.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                <IncidenciaBadge type={i.type} />
                <IncidenciaStatusBadge status={i.status} />
              </div>
            ))}
            {selectedCorrections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                <span className="text-xs">
                  Corrección: {PUNCH_TYPE_LABEL[c.punchType]} → {formatTime12(c.requestedTime)}
                </span>
                <CorrectionStatusBadge status={c.status} />
              </div>
            ))}

            {selected <= today ? (
              <Button variant="secondary" className="w-full" onClick={() => openRequest()}>
                <PencilLine className="h-4 w-4" />
                Solicitar corrección de este día
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* --- Solicitudes e incidencias ------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mis solicitudes de corrección</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myCorrections.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aún no has enviado solicitudes.
              </p>
            ) : (
              myCorrections.map((c) => (
                <div key={c.id} className="space-y-1 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {formatShortDate(c.date)} · {PUNCH_TYPE_LABEL[c.punchType]} →{' '}
                      {formatTime12(c.requestedTime)}
                    </p>
                    <CorrectionStatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{c.reason}</p>
                  {c.reviewedByName ? (
                    <p className="text-xs text-muted-foreground">
                      {c.status === 'approved' ? 'Aprobada' : 'Rechazada'} por {c.reviewedByName}
                      {c.reviewedAt
                        ? ` · ${new Date(c.reviewedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`
                        : ''}
                      {c.reviewNote ? ` — ${c.reviewNote}` : ''}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidencias de {MONTHS[monthIndex - 1].toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthIncidencias.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin incidencias este mes.</p>
            ) : (
              monthIncidencias.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {i.from === i.to
                        ? formatShortDate(i.from)
                        : `${formatShortDate(i.from)} – ${formatShortDate(i.to)}`}
                    </p>
                    {i.reason ? <p className="truncate text-xs text-muted-foreground">{i.reason}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <IncidenciaBadge type={i.type} />
                    <IncidenciaStatusBadge status={i.status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <CorrectionRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        employeeId={employee.id}
        date={selected <= today ? selected : today}
        type={requestType}
      />
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'text-foreground',
}: {
  icon: typeof Clock3
  label: string
  value: string
  tone?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', tone)}>{value}</p>
    </Card>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded', className)} />
      {label}
    </span>
  )
}
