import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlarmClock,
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Clock3,
  Download,
  LayoutList,
  ListChecks,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  SquarePen,
  TrendingUp,
  UserRound,
  Utensils,
  X,
} from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/misc'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AttendanceStatusBadge, IncidenciaBadge, IncidenciaStatusBadge, METHOD_META } from '@/components/shared/badges'
import { AttendanceDetailDialog } from '@/components/attendance/AttendanceDetailDialog'
import { DayEditDialog } from '@/components/attendance/DayEditDialog'
import { IncidenciaFormDialog } from '@/components/attendance/IncidenciaFormDialog'
import { PunchLogTable } from '@/components/attendance/PunchLogTable'
import { PunchPill } from '@/components/attendance/PunchPill'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { buildWorkbookPayload, downloadCSV } from '@/services/exportService'
import { buildReport } from '@/services/reportService'
import { toast } from '@/components/ui/toast'
import { INCIDENCIA_META, INCIDENCIA_TYPES } from '@/data/incidencias'
import { PUNCH_TYPE_LABEL, WEEKDAY_LABEL, lunchMinutes, weekdayFromISO } from '@/lib/attendance'
import { PUNCH_LOG_TABS, buildPunchLog, matchesEmployee, type PunchLogTab } from '@/lib/punchLog'
import { PUNCH_STYLE, compactDuration } from '@/lib/punchStyle'
import { restoreSession } from '@/services/live/liveApi'
import { addDaysISO } from '@/lib/vacations'
import { locationSource } from '@/lib/geo'
import { cn, formatShortDate } from '@/lib/utils'
import { useToday } from '@/hooks/useToday'
import type { AttendanceRecord, AttendanceStatus, Incidencia, PunchType } from '@/types'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'present', label: 'Presente' },
  { value: 'late', label: 'Retardo' },
  { value: 'absent', label: 'Falta' },
  { value: 'incomplete', label: 'Incompleto' },
  { value: 'overtime', label: 'Hora extra' },
]

type View = 'resumen' | 'checadas'
const PAGE = 150

/** Each kind of movement keeps its colour everywhere: green in, red out, orange lunch. */
const LOG_TAB_STYLE: Record<PunchLogTab, { Icon: typeof LogIn; active: string; idle: string }> = {
  entries: {
    Icon: LogIn,
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
    idle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300',
  },
  exits: {
    Icon: LogOut,
    active: 'border-rose-600 bg-rose-600 text-white shadow-md shadow-rose-600/30',
    idle: 'border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300',
  },
  lunch: {
    Icon: Utensils,
    active: 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/30',
    idle: 'border-orange-500/40 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-300',
  },
  all: {
    Icon: LayoutList,
    active: 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/30',
    idle: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300',
  },
}

export function AttendancePage() {
  const { employees, attendance, allBranches, schedules, incidencias } = useScopedData()
  const cancelIncidencia = useDataStore((s) => s.cancelIncidencia)
  const currentUser = useDataStore((s) => s.currentUser)
  const mode = useDataStore((s) => s.mode)
  const hydrateLive = useDataStore((s) => s.hydrateLive)
  const { can } = usePermissions()
  const canEdit = can('attendance.edit')
  const [params, setParams] = useSearchParams()
  const view: View = params.get('vista') === 'checadas' ? 'checadas' : 'resumen'

  const today = useToday()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [query, setQuery] = useState('')
  const [branchId, setBranchId] = useState('all')
  const [status, setStatus] = useState('all')
  const [department, setDepartment] = useState('all')
  const [incType, setIncType] = useState('all')
  const [logTab, setLogTab] = useState<PunchLogTab>('entries')
  const [limit, setLimit] = useState(PAGE)
  const [loading, setLoading] = useState(false)
  /** Bumped by "Cargar": the photo thumbnails load right away and retry the ones that failed. */
  const [reloadKey, setReloadKey] = useState(0)
  const [detail, setDetail] = useState<AttendanceRecord | undefined>()
  const [editing, setEditing] = useState<{ employeeId: string; date: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [incidenciaOpen, setIncidenciaOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Incidencia | undefined>()

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules])
  const branchName = (id: string) => allBranches.find((b) => b.id === id)?.name ?? '—'
  const branchPoint = (id: string) => {
    const b = allBranches.find((x) => x.id === id)
    return b?.lat != null && b?.lng != null ? { lat: b.lat, lng: b.lng } : undefined
  }

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees],
  )

  // A range typed backwards still works: nobody should get an empty screen for that.
  const [start, end] = from <= to ? [from, to] : [to, from]
  const oneDay = start === end
  const setRange = (a: string, b: string) => {
    setFrom(a)
    setTo(b)
    setLimit(PAGE)
  }
  const ranges: Array<{ label: string; from: string; to: string }> = [
    { label: 'Hoy', from: today, to: today },
    { label: 'Ayer', from: addDaysISO(today, -1), to: addDaysISO(today, -1) },
    { label: 'Últimos 7 días', from: addDaysISO(today, -6), to: today },
    { label: 'Este mes', from: `${today.slice(0, 7)}-01`, to: today },
  ]

  const rows = useMemo(() => {
    const withIncType = (r: AttendanceRecord) =>
      incidencias.some((i) => i.type === incType && i.employeeId === r.employeeId && r.date >= i.from && r.date <= i.to)
    return attendance
      .filter((r) => r.date >= start && r.date <= end)
      .filter((r) => {
        const emp = empById.get(r.employeeId)
        return !!emp && matchesEmployee(emp, query) && (department === 'all' || emp.department === department)
      })
      .filter((r) => (incType === 'all' ? true : withIncType(r)))
      .filter((r) => (branchId === 'all' ? true : r.branchId === branchId))
      .filter((r) => (status === 'all' ? true : r.status === status))
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        const ea = a.punches.find((p) => p.type === 'entry')?.time ?? '99:99'
        const eb = b.punches.find((p) => p.type === 'entry')?.time ?? '99:99'
        return ea.localeCompare(eb)
      })
  }, [attendance, incidencias, start, end, query, branchId, status, department, incType, empById])

  const logRows = useMemo(
    () => buildPunchLog(attendance, employees, { from: start, to: end, tab: logTab, query, branchId }),
    [attendance, employees, start, end, logTab, query, branchId],
  )
  const logCounts = useMemo(() => {
    const count = (tab: PunchLogTab) =>
      buildPunchLog(attendance, employees, { from: start, to: end, tab, query, branchId }).length
    return { entries: count('entries'), exits: count('exits'), lunch: count('lunch'), all: count('all') }
  }, [attendance, employees, start, end, query, branchId])

  /** "Cargar": bring what was registered at the relojes and phones since this page opened, and the photos. */
  const reload = async () => {
    setLoading(true)
    try {
      if (mode === 'live') {
        const bundle = await restoreSession()
        if (bundle) hydrateLive(bundle)
      }
      setReloadKey((k) => k + 1)
      toast.success('Registros actualizados', 'Se cargaron las checadas y las fotos más recientes.')
    } catch {
      toast.error('No se pudo cargar', 'Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const incidenciasInRange = useMemo(() => {
    return incidencias
      .filter((i) => i.from <= end && i.to >= start)
      .filter((i) => {
        const emp = empById.get(i.employeeId)
        return (
          !!emp &&
          matchesEmployee(emp, query) &&
          (department === 'all' || emp.department === department) &&
          (branchId === 'all' || emp.branchId === branchId)
        )
      })
      .filter((i) => (incType === 'all' ? true : i.type === incType))
      .sort((a, b) => a.from.localeCompare(b.from))
  }, [incidencias, start, end, query, branchId, department, incType, empById])

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      present: 0,
      late: 0,
      absent: 0,
      incomplete: 0,
      overtime: 0,
      rest: 0,
    }
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])

  const periodLabel = oneDay ? formatShortDate(start) : `${formatShortDate(start)} – ${formatShortDate(end)}`
  const fileSuffix = oneDay ? start : `${start}_a_${end}`

  const handleExport = () => {
    if (view === 'checadas') {
      const payload = buildWorkbookPayload(
        'Registro de checadas',
        [
          { key: 'number', header: 'ID' },
          { key: 'name', header: 'Empleado' },
          { key: 'date', header: 'Fecha' },
          { key: 'time', header: 'Hora' },
          { key: 'type', header: 'Tipo' },
          { key: 'method', header: 'Medio' },
          { key: 'lat', header: 'Latitud' },
          { key: 'lng', header: 'Longitud' },
          { key: 'accuracy', header: 'Precisión (m)' },
          { key: 'source', header: 'Origen de la ubicación' },
          { key: 'distance', header: 'Distancia a la sucursal (m)' },
          { key: 'outside', header: 'Fuera de zona' },
          { key: 'photo', header: 'Foto' },
          { key: 'branch', header: 'Sucursal' },
        ],
        logRows.map(({ record, employee, punch }) => ({
          number: employee.employeeNumber,
          name: employee.fullName,
          date: record.date,
          time: punch.time,
          type: PUNCH_TYPE_LABEL[punch.type],
          method: punch.edited ? 'Ajuste manual' : METHOD_META[punch.method].label,
          lat: punch.location?.lat ?? '',
          lng: punch.location?.lng ?? '',
          accuracy: punch.location?.accuracy ?? '',
          source: punch.location ? (locationSource(punch.location) === 'gps' ? 'GPS del equipo' : 'Punto fijo de la sucursal') : '',
          distance: punch.location?.distance ?? '',
          outside: punch.location?.outside ? 'Sí' : '',
          photo: punch.photoEvidence ? 'Sí' : 'No',
          branch: branchName(record.branchId),
        })),
        { desde: start, hasta: end },
      )
      downloadCSV(payload, `nexotime-checadas-${fileSuffix}`)
      toast.success('Exportación lista', `${logRows.length} checadas · ${periodLabel}`)
      return
    }
    const result = buildReport('attendance_general', {
      records: rows,
      employees,
      schedules,
      branches: allBranches,
      from: start,
      to: end,
    })
    downloadCSV(
      buildWorkbookPayload(result.title, result.columns, result.rows, { desde: start, hasta: end }),
      `nexotime-asistencia-${fileSuffix}`,
    )
    toast.success('Exportación lista', `${rows.length} registros · ${periodLabel}`)
  }

  const time = (r: AttendanceRecord, type: PunchType) => r.punches.find((p) => p.type === type)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencia"
        description="Consulta y administra los registros de todos los empleados."
        actions={
          <>
            {canEdit ? (
              <Button onClick={() => setAddOpen(true)}>
                <SquarePen className="h-4 w-4" />
                Capturar día
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </>
        }
      />

      <Tabs
        value={view}
        onValueChange={(v) => {
          setParams(v === 'checadas' ? { vista: 'checadas' } : {}, { replace: true })
          setLimit(PAGE)
        }}
      >
        <TabsList>
          <TabsTrigger value="resumen" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Resumen diario
          </TabsTrigger>
          <TabsTrigger value="checadas" className="gap-1.5">
            <ListChecks className="h-4 w-4" />
            Registro de checadas
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[150px_150px_minmax(0,1fr)_220px]">
          <label className="relative block">
            <span className="sr-only">Desde</span>
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" value={from} max={today} onChange={(e) => setRange(e.target.value || today, to)} className="pl-9" />
          </label>
          <label className="relative block">
            <span className="sr-only">Hasta</span>
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" value={to} max={today} onChange={(e) => setRange(from, e.target.value || today)} className="pl-9" />
          </label>
          <div className="relative col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE)
              }}
              placeholder="Buscar por nombre o número de empleado"
              className="pl-9"
            />
          </div>
          <Select
            className="col-span-2 lg:col-span-1"
            value={branchId}
            onValueChange={setBranchId}
            options={[
              { value: 'all', label: 'Todas las sucursales' },
              ...allBranches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {ranges.map((r) => {
            const active = r.from === start && r.to === end
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => setRange(r.from, r.to)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            )
          })}
        </div>

        {view === 'resumen' ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select
                value={department}
                onValueChange={setDepartment}
                options={[
                  { value: 'all', label: 'Todos los departamentos' },
                  ...departments.map((d) => ({ value: d, label: d })),
                ]}
              />
              <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
              <Select
                value={incType}
                onValueChange={setIncType}
                options={[
                  { value: 'all', label: 'Cualquier incidencia' },
                  ...INCIDENCIA_TYPES.map((t) => ({ value: t, label: INCIDENCIA_META[t].label })),
                ]}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Chip icon={CircleCheck} label="Presentes" value={counts.present} tone="bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" />
              <Chip icon={AlarmClock} label="Retardos" value={counts.late} tone="bg-amber-400/20 text-amber-800 dark:text-amber-200" />
              <Chip icon={CircleX} label="Faltas" value={counts.absent} tone="bg-rose-500/12 text-rose-700 dark:text-rose-300" />
              <Chip icon={CircleDashed} label="Incompletos" value={counts.incomplete} tone="bg-sky-500/12 text-sky-700 dark:text-sky-300" />
              <Chip icon={TrendingUp} label="Horas extra" value={counts.overtime} tone="bg-violet-500/12 text-violet-700 dark:text-violet-300" />
              <LoadButton loading={loading} onClick={() => void reload()} className="ml-auto" />
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {PUNCH_LOG_TABS.map((t) => {
              const active = logTab === t.value
              const style = LOG_TAB_STYLE[t.value]
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setLogTab(t.value)
                    setLimit(PAGE)
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition-all active:scale-95',
                    active ? style.active : style.idle,
                  )}
                >
                  <style.Icon className="h-4 w-4" />
                  {t.label}
                  <span className={cn('rounded-full px-1.5 text-[11px] font-bold tabular-nums', active ? 'bg-white/25' : 'bg-black/5 dark:bg-white/10')}>
                    {logCounts[t.value]}
                  </span>
                </button>
              )
            })}
            <LoadButton loading={loading} onClick={() => void reload()} />
            <span className="ml-auto text-xs text-muted-foreground">
              {logRows.length} {logRows.length === 1 ? 'checada' : 'checadas'} · {periodLabel}
            </span>
          </div>
        )}
      </Card>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="space-y-6"
        >
          {view === 'checadas' ? (
            logRows.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Sin checadas"
                description="No hay movimientos que coincidan con el periodo y la búsqueda."
              />
            ) : (
              <PunchLogTable rows={logRows.slice(0, limit)} branchName={branchName} branchPoint={branchPoint} reloadKey={reloadKey} />
            )
          ) : (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">Incidencias</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vacaciones, permisos e incapacidades vigentes {oneDay ? `el ${periodLabel}` : `del ${periodLabel}`} — no
                      cuentan como falta.
                    </p>
                  </div>
                  {can('incidencias.view') ? (
                    <Button variant="secondary" size="sm" onClick={() => setIncidenciaOpen(true)}>
                      <CalendarPlus className="h-4 w-4" />
                      Registrar incidencia
                    </Button>
                  ) : null}
                </CardHeader>
                {incidenciasInRange.length > 0 ? (
                  <CardContent className="divide-y divide-border pt-0">
                    {incidenciasInRange.map((i) => {
                      const emp = empById.get(i.employeeId)!
                      return (
                        <div key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <Avatar name={emp.fullName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{emp.fullName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {i.from === i.to ? formatShortDate(i.from) : `${formatShortDate(i.from)} – ${formatShortDate(i.to)}`}
                              {i.reason ? ` · ${i.reason}` : ''}
                            </p>
                          </div>
                          <IncidenciaBadge type={i.type} />
                          <IncidenciaStatusBadge status={i.status} />
                          {can('incidencias.review') ? (
                            <Button variant="ghost" size="icon" onClick={() => setCancelTarget(i)}>
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      )
                    })}
                  </CardContent>
                ) : null}
              </Card>

              {rows.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="Sin registros"
                  description="No hay asistencia que coincida con los filtros seleccionados."
                  action={
                    canEdit ? (
                      <Button variant="secondary" onClick={() => setAddOpen(true)}>
                        <SquarePen className="h-4 w-4" />
                        Capturar un día a mano
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead><HeadLabel icon={UserRound}>Empleado</HeadLabel></TableHead>
                        <TableHead><HeadLabel icon={CalendarDays}>Fecha</HeadLabel></TableHead>
                        <TableHead className="text-center"><HeadLabel icon={PUNCH_STYLE.entry.Icon} tone={PUNCH_STYLE.entry.text}>Entrada</HeadLabel></TableHead>
                        <TableHead className="hidden text-center md:table-cell"><HeadLabel icon={PUNCH_STYLE.lunch_out.Icon} tone={PUNCH_STYLE.lunch_out.text}>Salida a comer</HeadLabel></TableHead>
                        <TableHead className="hidden text-center md:table-cell"><HeadLabel icon={PUNCH_STYLE.lunch_in.Icon} tone={PUNCH_STYLE.lunch_in.text}>Regreso</HeadLabel></TableHead>
                        <TableHead className="text-center"><HeadLabel icon={PUNCH_STYLE.exit.Icon} tone={PUNCH_STYLE.exit.text}>Salida</HeadLabel></TableHead>
                        <TableHead className="text-center"><HeadLabel icon={Clock3} tone="text-blue-600 dark:text-blue-400">Horas</HeadLabel></TableHead>
                        <TableHead className="hidden text-center 2xl:table-cell">Comida</TableHead>
                        <TableHead><HeadLabel icon={Activity}>Estado</HeadLabel></TableHead>
                        {canEdit ? <TableHead className="sticky right-0 bg-card text-right">Acciones</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, limit).map((r) => {
                        const emp = empById.get(r.employeeId)!
                        const inProgress =
                          r.date === today && r.punches.some((x) => x.type === 'entry') && !time(r, 'exit')
                        return (
                          <TableRow
                            key={r.id}
                            className={cn('cursor-pointer', r.status === 'incomplete' && 'bg-amber-400/10 hover:bg-amber-400/15')}
                            onClick={() => setDetail(r)}
                          >
                            <TableCell>
                              <div className="flex min-w-[150px] items-center gap-3">
                                <Avatar name={emp.fullName} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{emp.fullName}</p>
                                  <p className="text-xs text-muted-foreground">{emp.employeeNumber}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              <span className="tabular-nums">{formatShortDate(r.date)}</span>
                              <span className="block text-xs italic text-muted-foreground">
                                {WEEKDAY_LABEL[weekdayFromISO(r.date)]}
                              </span>
                            </TableCell>
                            <TableCell className="px-1.5 text-center">
                              <PunchPill type="entry" time={time(r, 'entry')?.time} edited={time(r, 'entry')?.edited} />
                            </TableCell>
                            <TableCell className="hidden px-1.5 text-center md:table-cell">
                              <PunchPill type="lunch_out" time={time(r, 'lunch_out')?.time} edited={time(r, 'lunch_out')?.edited} />
                            </TableCell>
                            <TableCell className="hidden px-1.5 text-center md:table-cell">
                              <PunchPill type="lunch_in" time={time(r, 'lunch_in')?.time} edited={time(r, 'lunch_in')?.edited} />
                            </TableCell>
                            <TableCell className="px-1.5 text-center">
                              <PunchPill type="exit" time={time(r, 'exit')?.time} edited={time(r, 'exit')?.edited} />
                            </TableCell>
                            <TableCell className="text-center">
                              {inProgress ? (
                                <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">
                                  En curso
                                </span>
                              ) : (
                                <span className="inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-full bg-blue-600 px-2.5 text-xs font-semibold tabular-nums text-white">
                                  {compactDuration(r.workedMinutes)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-center 2xl:table-cell">
                              <span className="inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-full bg-amber-400/25 px-2.5 text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                                {compactDuration(lunchMinutes(r.punches))}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <AttendanceStatusBadge status={r.status} />
                            </TableCell>
                            {canEdit ? (
                              <TableCell className="sticky right-0 bg-card text-right shadow-[-10px_0_10px_-10px_rgb(16_24_40/0.18)]" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 text-primary"
                                  title="Editar día completo"
                                  aria-label={`Editar el día de ${emp.fullName}`}
                                  onClick={() => setEditing({ employeeId: r.employeeId, date: r.date })}
                                >
                                  <SquarePen className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          )}

          {(view === 'checadas' ? logRows.length : rows.length) > limit ? (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                Mostrar más ({(view === 'checadas' ? logRows.length : rows.length) - limit} restantes)
              </Button>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <AttendanceDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(undefined)}
        record={detail}
        employee={detail ? empById.get(detail.employeeId) : undefined}
        schedule={detail ? scheduleById.get(detail.scheduleId) : undefined}
      />
      <DayEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        employeeId={editing?.employeeId}
        date={editing?.date}
      />
      <DayEditDialog open={addOpen} onOpenChange={setAddOpen} pick date={oneDay ? start : today} />
      <IncidenciaFormDialog open={incidenciaOpen} onOpenChange={setIncidenciaOpen} />
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(undefined)}
        title="¿Cancelar esta incidencia?"
        description="El empleado volverá a contar como falta si no registra asistencia ese día."
        confirmLabel="Cancelar incidencia"
        destructive
        onConfirm={() => cancelTarget && cancelIncidencia(cancelTarget.id, currentUser)}
      />
    </div>
  )
}

function Chip({ icon: Icon, label, value, tone }: { icon: typeof LogIn; label: string; value: number; tone: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium', tone)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-bold tabular-nums">{value}</span>
      {label}
    </span>
  )
}

function HeadLabel({ icon: Icon, tone, children }: { icon: typeof LogIn; tone?: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn('h-3.5 w-3.5', tone)} />
      {children}
    </span>
  )
}

/** "Cargar": brings the newest movements (from the relojes and the phones) and their photos. */
function LoadButton({ loading, onClick, className }: { loading: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-md shadow-teal-600/25 transition-all hover:bg-teal-700 active:scale-95 disabled:opacity-70',
        className,
      )}
    >
      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
      {loading ? 'Cargando…' : 'Cargar'}
    </button>
  )
}
