import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, PencilLine, QrCode, ScanFace, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, Progress } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AttendanceStatusBadge,
  EmployeeStatusBadge,
  IncidenciaBadge,
  IncidenciaStatusBadge,
  METHOD_META,
} from '@/components/shared/badges'
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog'
import { AttendanceDetailDialog } from '@/components/attendance/AttendanceDetailDialog'
import { QrPreviewDialog } from '@/components/employees/QrPreviewDialog'
import { FaceEnrollDialog } from '@/components/employees/FaceEnrollDialog'
import { LegalEvidenceDialog } from '@/components/attendance/LegalEvidenceDialog'
import { IncidenciaFormDialog } from '@/components/attendance/IncidenciaFormDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePermissions, useScopedData } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { WEEKDAY_LABEL, calculateWeeklyHours } from '@/lib/attendance'
import { weekDates } from '@/lib/week'
import { formatDuration, formatShortDate, formatTime12 } from '@/lib/utils'
import { useToday } from '@/hooks/useToday'
import type { AttendanceRecord } from '@/types'

export function EmployeeProfilePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { allBranches, schedules, accessibleEmployees, incidencias } = useScopedData()
  const { can } = usePermissions()
  const today = useToday()
  const attendance = useDataStore((s) => s.attendance)
  const audit = useDataStore((s) => s.audit)
  const company = useDataStore((s) => s.company)

  // Only employees this user is allowed to see (branch / department scope) —
  // opening someone else's URL by hand just shows "no encontrado".
  const employee = accessibleEmployees.find((e) => e.id === id)
  const [editOpen, setEditOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [faceOpen, setFaceOpen] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [incidenciaOpen, setIncidenciaOpen] = useState(false)
  const [detail, setDetail] = useState<AttendanceRecord | undefined>()

  const employeeIncidencias = useMemo(
    () =>
      incidencias
        .filter((i) => i.employeeId === id)
        .sort((a, b) => b.from.localeCompare(a.from)),
    [incidencias, id],
  )

  const schedule = schedules.find((s) => s.id === employee?.scheduleId)
  const branch = allBranches.find((b) => b.id === employee?.branchId)
  const workDay = schedule?.days.find((d) => d.enabled)

  const records = useMemo(
    () =>
      attendance
        .filter((r) => r.employeeId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attendance, id],
  )

  const weekly = useMemo(() => {
    const week = weekDates(today)
    const weekRecords = records.filter((r) => r.date >= week[0] && r.date <= week[6])
    return calculateWeeklyHours(weekRecords, schedule?.weeklyTargetHours ?? 46)
  }, [records, schedule, today])

  if (!employee) {
    return (
      <div className="space-y-4">
        <Link to="/empleados" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver a empleados
        </Link>
        <Card className="p-10 text-center text-sm text-muted-foreground">Empleado no encontrado.</Card>
      </div>
    )
  }

  const tab = params.get('tab') ?? 'resumen'
  const setTab = (value: string) => setParams({ tab: value }, { replace: true })

  const weeklyPct = weekly.targetMinutes
    ? Math.round((weekly.workedMinutes / weekly.targetMinutes) * 100)
    : 0

  return (
    <div className="space-y-6">
      <Link
        to="/empleados"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Empleados
      </Link>

      <PageHeader
        title={employee.fullName}
        description={`${employee.position} · ${employee.department}`}
        actions={
          <>
            {can('incidencias.view') ? (
              <Button variant="secondary" onClick={() => setIncidenciaOpen(true)}>
                <CalendarPlus className="h-4 w-4" />
                Incidencia
              </Button>
            ) : null}
            {can('biometrics.manage') ? (
              <Button variant="secondary" onClick={() => setFaceOpen(true)}>
                <ScanFace className="h-4 w-4" />
                Rostro
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" />
              Credencial
            </Button>
            {can('employees.edit') ? (
              <Button onClick={() => setEditOpen(true)}>
                <PencilLine className="h-4 w-4" />
                Editar
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <Avatar name={employee.fullName} size="xl" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{employee.fullName}</span>
            <EmployeeStatusBadge status={employee.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {employee.employeeNumber} · {branch?.name} · Ingreso {formatShortDate(employee.hireDate)}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {employee.identifications
              .filter((i) => i.enabled)
              .map((i) => {
                const meta = METHOD_META[i.method]
                return (
                  <Badge key={i.method} variant="secondary">
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                )
              })}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
          <TabsTrigger value="horario">Horario</TabsTrigger>
          <TabsTrigger value="informacion">Información</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5 sm:col-span-2">
              <p className="text-sm text-muted-foreground">Horas esta semana</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatDuration(weekly.workedMinutes)}{' '}
                <span className="text-base font-normal text-muted-foreground">
                  / {formatDuration(weekly.targetMinutes)}
                </span>
              </p>
              <Progress value={weeklyPct} className="mt-3" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {weeklyPct}% del objetivo semanal ({schedule?.weeklyTargetHours} h)
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Retardos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
                {weekly.lateCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Esta semana</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Faltas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{weekly.absenceCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Esta semana</p>
            </Card>
            <Card className="p-5 sm:col-span-2">
              <p className="text-sm text-muted-foreground">Horas extra</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-success">
                {formatDuration(weekly.overtimeMinutes)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Acumuladas esta semana</p>
            </Card>

            <Card className="p-5 sm:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Horas ordinarias y extraordinarias (Art. 66-68 LFT)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Clasificación automática para pago y evidencia ante la autoridad laboral.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {weekly.exceedsLegalLimit ? (
                    <Badge variant="destructive">Revisar cumplimiento</Badge>
                  ) : (
                    <Badge variant="success">Dentro del límite legal</Badge>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEvidenceOpen(true)}>
                    <ShieldCheck className="h-4 w-4" />
                    Evidencia legal
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-border bg-secondary/40 py-3">
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDuration(weekly.ordinaryMinutes)}
                  </p>
                  <p className="text-xs text-muted-foreground">Ordinarias</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 py-3">
                  <p className="text-lg font-semibold tabular-nums text-success">
                    {formatDuration(weekly.overtimeDoubleMinutes)}
                  </p>
                  <p className="text-xs text-muted-foreground">Extra dobles (200%)</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 py-3">
                  <p className="text-lg font-semibold tabular-nums text-warning">
                    {formatDuration(weekly.overtimeTripleMinutes)}
                  </p>
                  <p className="text-xs text-muted-foreground">Extra triples (300%)</p>
                </div>
              </div>
            </Card>

            {employeeIncidencias.length > 0 ? (
              <Card className="p-5 sm:col-span-2 lg:col-span-4">
                <p className="text-sm font-semibold text-foreground">Incidencias</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Incidencias registradas para este empleado y su estado de aprobación.
                </p>
                <div className="space-y-2">
                  {employeeIncidencias.map((i) => (
                    <div
                      key={i.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {i.from === i.to
                            ? formatShortDate(i.from)
                            : `${formatShortDate(i.from)} – ${formatShortDate(i.to)}`}
                        </p>
                        {i.reason ? (
                          <p className="truncate text-xs text-muted-foreground">{i.reason}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IncidenciaBadge type={i.type} />
                        <IncidenciaStatusBadge status={i.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="asistencia">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead className="hidden sm:table-cell">Salida comida</TableHead>
                  <TableHead className="hidden sm:table-cell">Regreso</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 20).map((r) => {
                  const p = (t: string) => r.punches.find((x) => x.type === t)?.time
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                      <TableCell className="text-sm font-medium">{formatShortDate(r.date)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {p('entry') ? formatTime12(p('entry')) : '—'}
                      </TableCell>
                      <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                        {p('lunch_out') ? formatTime12(p('lunch_out')) : '—'}
                      </TableCell>
                      <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                        {p('lunch_in') ? formatTime12(p('lunch_in')) : '—'}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {p('exit') ? formatTime12(p('exit')) : '—'}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDuration(r.workedMinutes)}
                      </TableCell>
                      <TableCell>
                        <AttendanceStatusBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="horario">
          <Card>
            <CardHeader>
              <CardTitle>{schedule?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {schedule?.description} · objetivo {schedule?.weeklyTargetHours} h/semana
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida comida</TableHead>
                    <TableHead>Regreso</TableHead>
                    <TableHead>Salida</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule?.days.map((d) => (
                    <TableRow key={d.weekday}>
                      <TableCell className="text-sm font-medium">
                        {WEEKDAY_LABEL[d.weekday]}
                      </TableCell>
                      {d.enabled ? (
                        <>
                          <TableCell className="text-sm tabular-nums">
                            {formatTime12(d.entry)}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {d.lunchOut ? formatTime12(d.lunchOut) : '—'}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {d.lunchIn ? formatTime12(d.lunchIn) : '—'}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {formatTime12(d.exit)}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          Descanso
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="informacion">
          <Card>
            <CardContent className="grid gap-x-8 gap-y-4 pt-5 sm:grid-cols-2">
              <Info label="Nombre completo" value={employee.fullName} />
              <Info label="Número de empleado" value={employee.employeeNumber} />
              <Info label="Puesto" value={employee.position} />
              <Info label="Departamento" value={employee.department} />
              <Info label="Sucursal" value={branch?.name ?? '—'} />
              <Info label="Correo electrónico" value={employee.email ?? '—'} />
              <Info label="Teléfono" value={employee.phone ?? '—'} />
              <Info label="Fecha de ingreso" value={formatShortDate(employee.hireDate)} />
              <Info label="Estado" value={employee.status === 'active' ? 'Activo' : 'Inactivo'} />
              <Info label="Horario asignado" value={schedule?.name ?? '—'} />
              <Info
                label="Hora de entrada / salida"
                value={
                  workDay ? `${formatTime12(workDay.entry)} – ${formatTime12(workDay.exit)}` : 'Sin jornada definida'
                }
              />
              <Info
                label="Horario de comida"
                value={
                  workDay?.lunchOut && workDay.lunchIn
                    ? `${formatTime12(workDay.lunchOut)} – ${formatTime12(workDay.lunchIn)}`
                    : 'Sin comida programada'
                }
              />
              <Info
                label="Tolerancia de retardo"
                value={`${company.attendanceSettings.entryToleranceMinutes} minutos`}
              />
              <Info
                label="Identificador de registro"
                value={
                  employee.identifications
                    .filter((i) => i.enabled)
                    .map((i) => METHOD_META[i.method].label)
                    .join(' · ') || 'Ninguno'
                }
              />
              <Info label="CURP" value={employee.curp ?? 'No registrado'} />
              <Info label="Dirección" value={employee.address ?? 'No registrada'} />
              <Info
                label="Contacto de emergencia"
                value={
                  employee.emergencyContact
                    ? `${employee.emergencyContact.name} · ${employee.emergencyContact.phone}`
                    : 'No registrado'
                }
              />
              <Info label="PIN" value={employee.pin ? '••••' : 'No configurado'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auditoria">
          <Card>
            <CardContent className="divide-y divide-border pt-2">
              {audit.filter((a) => a.entityId === employee.id || a.entityLabel.includes(employee.fullName)).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin cambios registrados para este empleado.
                </p>
              ) : (
                audit
                  .filter(
                    (a) => a.entityId === employee.id || a.entityLabel.includes(employee.fullName),
                  )
                  .map((a) => (
                    <div key={a.id} className="py-3 text-sm">
                      <p className="font-medium">{a.changes.map((c) => c.field).join(', ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.actorName} · {new Date(a.createdAt).toLocaleString('es-MX')}
                      </p>
                      {a.reason ? (
                        <p className="mt-1 text-xs text-muted-foreground">Motivo: {a.reason}</p>
                      ) : null}
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={employee} />
      <QrPreviewDialog open={qrOpen} onOpenChange={setQrOpen} employee={employee} />
      <FaceEnrollDialog open={faceOpen} onOpenChange={setFaceOpen} employee={employee} />
      <AttendanceDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(undefined)}
        record={detail}
        employee={employee}
        schedule={schedule}
      />
      <LegalEvidenceDialog
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        employee={employee}
      />
      <IncidenciaFormDialog
        open={incidenciaOpen}
        onOpenChange={setIncidenciaOpen}
        employeeId={employee.id}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}
