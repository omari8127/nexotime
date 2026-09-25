import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, ListChecks } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { findIncidencia, INCIDENCIA_META } from '@/data/incidencias'
import { presenceOf, scheduleDayFor, weekdayFromISO } from '@/lib/attendance'
import { formatTime12, toMinutes } from '@/lib/utils'
import type { AttendanceRecord, Employee, Incidencia, Schedule } from '@/types'

type RowState = 'present' | 'late' | 'absent' | 'lunch' | 'incidencia' | 'pending' | 'rest' | 'incomplete' | 'overtime'

const STATE_META: Record<
  RowState,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'default' | 'secondary' }
> = {
  present: { label: 'Presente', variant: 'success' },
  late: { label: 'Retardo', variant: 'warning' },
  absent: { label: 'Falta', variant: 'destructive' },
  lunch: { label: 'En comida', variant: 'warning' },
  incidencia: { label: 'Incidencia', variant: 'default' },
  pending: { label: 'Por llegar', variant: 'muted' },
  rest: { label: 'Descanso', variant: 'muted' },
  incomplete: { label: 'Incompleto', variant: 'default' },
  overtime: { label: 'Hora extra', variant: 'success' },
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'present', label: 'Presentes' },
  { value: 'late', label: 'Retardos' },
  { value: 'absent', label: 'Ausentes' },
  { value: 'lunch', label: 'En comida' },
  { value: 'incidencia', label: 'Con incidencia' },
  { value: 'pending', label: 'Por llegar' },
]

/**
 * "Asistencia del día": una fila por empleado activo — entrada, estado,
 * comida y salida — filtrable por nombre, departamento y estado.
 */
export function DailyAttendanceTable({
  date,
  nowMinutes,
  employees,
  attendance,
  schedules,
  incidencias,
}: {
  date: string
  nowMinutes: number
  employees: Employee[]
  attendance: AttendanceRecord[]
  schedules: Schedule[]
  incidencias: Incidencia[]
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('all')
  const [state, setState] = useState('all')

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees],
  )

  const rows = useMemo(() => {
    const scheduleById = new Map(schedules.map((s) => [s.id, s]))
    const recordByEmp = new Map(attendance.filter((r) => r.date === date).map((r) => [r.employeeId, r]))

    return employees
      .filter((e) => e.status === 'active')
      .map((e) => {
        const record = recordByEmp.get(e.id)
        const schedule = scheduleById.get(e.scheduleId)
        const day = schedule ? scheduleDayFor(schedule, weekdayFromISO(date)) : undefined
        const incidencia = findIncidencia(incidencias, e.id, date)
        const punches = record?.punches ?? []
        const presence = presenceOf(punches)

        let s: RowState
        if (incidencia && presence === 'none') s = 'incidencia'
        else if (presence === 'lunch') s = 'lunch'
        else if (record && punches.length > 0) s = record.status === 'rest' ? 'present' : (record.status as RowState)
        else if (!day?.enabled) s = 'rest'
        else if (toMinutes(day.entry) <= nowMinutes) s = 'absent'
        else s = 'pending'

        const p = (t: string) => punches.find((x) => x.type === t)?.time
        return { employee: e, state: s, incidencia, entry: p('entry'), lunchOut: p('lunch_out'), lunchIn: p('lunch_in'), exit: p('exit') }
      })
      .filter((r) => (department === 'all' ? true : r.employee.department === department))
      .filter((r) => (state === 'all' ? true : r.state === state || (state === 'present' && r.state === 'overtime')))
      .filter((r) =>
        query.trim()
          ? `${r.employee.fullName} ${r.employee.employeeNumber}`.toLowerCase().includes(query.trim().toLowerCase())
          : true,
      )
      .sort((a, b) => (a.entry ?? '99:99').localeCompare(b.entry ?? '99:99') || a.employee.fullName.localeCompare(b.employee.fullName))
  }, [employees, attendance, schedules, incidencias, date, nowMinutes, department, state, query])

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Asistencia del día</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Entrada, comida y salida de cada empleado activo.
          </p>
        </div>
        <Link to="/asistencia">
          <Button variant="ghost" size="sm">
            Historial completo
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empleado o número" />
          <Select
            value={department}
            onValueChange={setDepartment}
            options={[{ value: 'all', label: 'Todos los departamentos' }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
          <Select value={state} onValueChange={setState} options={FILTERS} />
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ListChecks className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nadie coincide con los filtros.</p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Comida</TableHead>
                  <TableHead>Salida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = STATE_META[r.state]
                  return (
                    <TableRow
                      key={r.employee.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/empleados/${r.employee.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={r.employee.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{r.employee.fullName}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.employee.department}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{r.entry ? formatTime12(r.entry) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>
                          {r.state === 'incidencia' && r.incidencia
                            ? INCIDENCIA_META[r.incidencia.type].short
                            : meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                        {r.lunchOut
                          ? `${formatTime12(r.lunchOut)}${r.lunchIn ? ` – ${formatTime12(r.lunchIn)}` : ' – …'}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{r.exit ? formatTime12(r.exit) : '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
