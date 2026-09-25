import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Phone } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar } from '@/components/ui/misc'
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
  DeviceStatusBadge,
  EmployeeStatusBadge,
} from '@/components/shared/badges'
import { useScopedData } from '@/hooks/useScopedData'
import { relativeFromNow } from '@/lib/week'
import { formatDuration, formatShortDate, formatTime12 } from '@/lib/utils'
import { WEEKDAY_SHORT } from '@/lib/attendance'
import { useToday } from '@/hooks/useToday'

export function BranchDetailPage() {
  const { id } = useParams()
  const { branches, employees, devices, attendance, schedules } = useScopedData()
  const branch = branches.find((b) => b.id === id)
  const today = useToday()

  const scoped = useMemo(() => {
    return {
      employees: employees.filter((e) => e.branchId === id),
      devices: devices.filter((d) => d.branchId === id),
      today: attendance.filter((r) => r.branchId === id && r.date === today),
    }
  }, [employees, devices, attendance, id, today])

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])

  if (!branch) {
    return (
      <div className="space-y-4">
        <Link to="/sucursales" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Sucursales
        </Link>
        <Card className="p-10 text-center text-sm text-muted-foreground">Sucursal no encontrada.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to="/sucursales"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Sucursales
      </Link>

      <PageHeader
        title={branch.name}
        description={`${branch.code} · ${scoped.employees.length} empleados · ${scoped.devices.length} dispositivos`}
      />

      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-4 text-sm">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {branch.address}
        </span>
        {branch.phone ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-4 w-4" />
            {branch.phone}
          </span>
        ) : null}
      </div>

      <Tabs defaultValue="empleados">
        <TabsList>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia hoy</TabsTrigger>
          <TabsTrigger value="horarios">Horarios</TabsTrigger>
        </TabsList>

        <TabsContent value="empleados">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoped.employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link to={`/empleados/${e.id}`} className="flex items-center gap-3">
                        <Avatar name={e.fullName} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{e.fullName}</p>
                          <p className="text-xs text-muted-foreground">{e.employeeNumber}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{e.position}</TableCell>
                    <TableCell>
                      <EmployeeStatusBadge status={e.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="dispositivos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última conexión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoped.devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm font-medium">{d.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.platform}</TableCell>
                    <TableCell>
                      <DeviceStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeFromNow(d.lastSeenAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="asistencia">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoped.today.map((r) => {
                  const emp = empById.get(r.employeeId)
                  const p = (t: string) => r.punches.find((x) => x.type === t)?.time
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{emp?.fullName}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {p('entry') ? formatTime12(p('entry')) : '—'}
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

        <TabsContent value="horarios">
          <div className="grid gap-4 sm:grid-cols-2">
            {schedules
              .filter((s) => scoped.employees.some((e) => e.scheduleId === s.id))
              .map((s) => (
                <Card key={s.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {s.days.filter((d) => d.enabled).map((d) => WEEKDAY_SHORT[d.weekday]).join(' · ')} ·{' '}
                    {scoped.employees.filter((e) => e.scheduleId === s.id).length} empleados ·{' '}
                    objetivo {s.weeklyTargetHours} h
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Datos al {formatShortDate(today)}
      </p>
    </div>
  )
}
