import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlarmClockOff,
  CalendarClock,
  ChevronRight,
  Clock3,
  DoorOpen,
  FileWarning,
  Utensils,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { WeeklyHoursChart } from '@/components/dashboard/WeeklyHoursChart'
import { DailyAttendanceTable } from '@/components/dashboard/DailyAttendanceTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { AttendanceStatusBadge, METHOD_META } from '@/components/shared/badges'
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog'
import { useScopedData } from '@/hooks/useScopedData'
import { useLiveClock } from '@/hooks/useLiveClock'
import { useComplianceAlerts } from '@/hooks/useComplianceAlerts'
import { useDataStore } from '@/store/dataStore'
import { weekDates } from '@/lib/week'
import {
  calculateWeeklyHours,
  getRecordFlags,
  presenceOf,
  PUNCH_TYPE_LABEL,
  weekdayFromISO,
} from '@/lib/attendance'
import { formatDuration, formatLongDate, formatTime12, greeting, toMinutes } from '@/lib/utils'
import { useToday } from '@/hooks/useToday'
import { findIncidencia } from '@/data/incidencias'

export function DashboardPage() {
  const now = useLiveClock()
  const today = useToday()
  const navigate = useNavigate()
  const { employees, attendance, incidencias, corrections } = useScopedData()
  const currentUser = useDataStore((s) => s.currentUser)
  const company = useDataStore((s) => s.company)
  const mode = useDataStore((s) => s.mode)
  const [addOpen, setAddOpen] = useState(false)

  const schedules = useDataStore((s) => s.schedules)
  // Coarsened to minute granularity so this doesn't recompute every second.
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const metrics = useMemo(() => {
    const scheduleById = new Map(schedules.map((s) => [s.id, s]))
    const active = employees.filter((e) => e.status === 'active')
    const todayRecords = attendance.filter((r) => r.date === today)
    const present = todayRecords.filter((r) => r.punches.some((p) => p.type === 'entry'))
    const late = todayRecords.filter((r) => r.status === 'late')
    const working = todayRecords.filter((r) => presenceOf(r.punches) === 'working')
    const onLunch = todayRecords.filter((r) => presenceOf(r.punches) === 'lunch')
    const earlyLeaves = todayRecords.filter(
      (r) =>
        getRecordFlags(r, scheduleById.get(r.scheduleId), company.attendanceSettings, today)
          .earlyLeaveMinutes > 0,
    )

    const weekdayToday = weekdayFromISO(today)
    const expectedToday = active.filter((e) => {
      const day = scheduleById.get(e.scheduleId)?.days.find((d) => d.weekday === weekdayToday)
      return day?.enabled && toMinutes(day.entry) <= nowMinutes
    })
    const justifiedIds = new Set(
      expectedToday
        .filter((e) => findIncidencia(incidencias, e.id, today))
        .map((e) => e.id),
    )
    const absent = expectedToday.filter(
      (e) =>
        !justifiedIds.has(e.id) &&
        !todayRecords.some((r) => r.employeeId === e.id && r.punches.length > 0),
    )

    const week = weekDates(today)
    const weekRecords = attendance.filter((r) => r.date >= week[0] && r.date <= week[6])
    const weekly = calculateWeeklyHours(weekRecords, company.weeklyTargetHours * active.length || 1)

    return {
      active: active.length,
      present: present.length,
      late: late.length,
      absent: absent.length,
      working: working.length,
      onLunch: onLunch.length,
      earlyLeaves: earlyLeaves.length,
      justifiedToday: justifiedIds.size,
      presentPct: active.length ? Math.round((present.length / active.length) * 1000) / 10 : 0,
      absentPct: active.length ? Math.round((absent.length / active.length) * 1000) / 10 : 0,
      weekRecords,
      weekly,
    }
  }, [employees, attendance, schedules, incidencias, company.weeklyTargetHours, company.attendanceSettings, today, nowMinutes])

  const activity = useMemo(() => {
    const empById = new Map(employees.map((e) => [e.id, e]))
    return attendance
      .filter((r) => r.date === today)
      .flatMap((r) =>
        r.punches.map((p) => ({
          key: `${r.id}-${p.type}`,
          employee: empById.get(r.employeeId),
          type: p.type,
          time: p.time,
          method: p.method,
          status: r.status,
        })),
      )
      .filter((x) => x.employee)
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 7)
  }, [attendance, employees, today])

  const alerts = useComplianceAlerts(5)
  const pendingIncidencias = incidencias.filter((i) => i.status === 'pending').length
  const pendingCorrections = corrections.filter((c) => c.status === 'pending').length

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting(now)}, ${currentUser.name.split(' ')[0]}`}
        description={formatLongDate(now)}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Agregar empleado
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Empleados activos"
          value={metrics.active}
          icon={UserCheck}
          trend={mode === 'demo' ? { value: '+4 este mes', direction: 'up' } : undefined}
          hint="Plantilla vigente"
        />
        <StatCard
          index={1}
          label="Presentes hoy"
          value={metrics.present}
          icon={Clock3}
          accent="success"
          hint={`${metrics.presentPct}% del personal`}
        />
        <StatCard
          index={2}
          label="Retardos"
          value={metrics.late}
          icon={AlarmClockOff}
          accent="warning"
          hint="Requieren revisión"
        />
        <StatCard
          index={3}
          label="Ausentes"
          value={metrics.absent}
          icon={UserX}
          accent="destructive"
          hint={
            metrics.justifiedToday > 0
              ? `${metrics.absentPct}% del personal · ${metrics.justifiedToday} con incidencia`
              : `${metrics.absentPct}% del personal`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={4}
          label="Trabajando ahora"
          value={metrics.working}
          icon={Clock3}
          accent="success"
          hint="Con entrada, sin comida ni salida"
        />
        <StatCard
          index={5}
          label="En comida"
          value={metrics.onLunch}
          icon={Utensils}
          accent="warning"
          hint="Aún no regresan"
        />
        <StatCard
          index={6}
          label="Salidas anticipadas"
          value={metrics.earlyLeaves}
          icon={DoorOpen}
          accent="warning"
          hint="Antes de su horario de salida"
        />
        <Link to={pendingCorrections > 0 && pendingIncidencias === 0 ? '/incidencias?tab=correcciones' : '/incidencias'}>
          <StatCard
            index={7}
            label="Incidencias pendientes"
            value={pendingIncidencias + pendingCorrections}
            icon={FileWarning}
            accent="destructive"
            hint={`${pendingIncidencias} incidencias · ${pendingCorrections} correcciones`}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Horas de la semana</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Programadas vs. trabajadas · objetivo {company.weeklyTargetHours} h por empleado
              </p>
            </div>
            <Link to="/reportes">
              <Button variant="ghost" size="sm">
                Ver reportes
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <WeeklyHoursChart records={metrics.weekRecords} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Programadas" value={formatDuration(metrics.weekly.scheduledMinutes)} />
              <MiniStat label="Trabajadas" value={formatDuration(metrics.weekly.workedMinutes)} accent="text-primary" />
              <MiniStat label="Faltantes" value={formatDuration(metrics.weekly.missingMinutes)} accent="text-warning" />
              <MiniStat label="Extra" value={formatDuration(metrics.weekly.overtimeMinutes)} accent="text-success" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Actividad en tiempo real</CardTitle>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              En vivo
            </span>
          </CardHeader>
          <CardContent className="space-y-1">
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin registros todavía hoy.
              </p>
            ) : (
              activity.map((a, i) => {
                const Method = METHOD_META[a.method].Icon
                return (
                  <motion.button
                    key={a.key}
                    initial={{ x: 10 }}
                    animate={{ x: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.25 }}
                    onClick={() => navigate(`/empleados/${a.employee!.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
                  >
                    <Avatar name={a.employee!.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.employee!.fullName}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Method className="h-3 w-3" />
                        {PUNCH_TYPE_LABEL[a.type]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums">{formatTime12(a.time)}</p>
                      <AttendanceStatusBadge status={a.status} />
                    </div>
                  </motion.button>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <DailyAttendanceTable
        date={today}
        nowMinutes={nowMinutes}
        employees={employees}
        attendance={attendance}
        schedules={schedules}
        incidencias={incidencias}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Empleados con alertas</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Situaciones que requieren tu atención</p>
          </div>
          <Badge variant="warning">{alerts.length}</Badge>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todo en orden. Sin alertas activas.
            </p>
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={alert.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{alert.name}</p>
                  <p className="text-xs text-muted-foreground">{alert.detail}</p>
                </div>
                <Badge
                  variant={
                    alert.tone === 'destructive'
                      ? 'destructive'
                      : alert.tone === 'warning'
                        ? 'warning'
                        : 'default'
                  }
                >
                  {alert.label}
                </Badge>
                <Link to={alert.to}>
                  <Button variant="secondary" size="sm">
                    {alert.cta}
                  </Button>
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
        <span>
          ¿Listo para una demostración? Abre el{' '}
          <Link to="/clock" className="font-medium text-primary hover:underline">
            reloj checador
          </Link>{' '}
          en otra pestaña, registra una entrada y observa cómo aparece aquí al instante.
        </span>
      </div>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}

function MiniStat({
  label,
  value,
  accent = 'text-foreground',
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}
