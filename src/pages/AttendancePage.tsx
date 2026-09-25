import { useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, Download, ListChecks, X } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/misc'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AttendanceStatusBadge, IncidenciaBadge, IncidenciaStatusBadge } from '@/components/shared/badges'
import { AttendanceDetailDialog } from '@/components/attendance/AttendanceDetailDialog'
import { IncidenciaFormDialog } from '@/components/attendance/IncidenciaFormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { buildWorkbookPayload, downloadCSV } from '@/services/exportService'
import { buildReport } from '@/services/reportService'
import { toast } from '@/components/ui/toast'
import { INCIDENCIA_META, INCIDENCIA_TYPES } from '@/data/incidencias'
import { formatDuration, formatShortDate, formatTime12 } from '@/lib/utils'
import { useToday } from '@/hooks/useToday'
import type { AttendanceRecord, AttendanceStatus, Incidencia } from '@/types'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'present', label: 'Presente' },
  { value: 'late', label: 'Retardo' },
  { value: 'absent', label: 'Falta' },
  { value: 'incomplete', label: 'Incompleto' },
  { value: 'overtime', label: 'Hora extra' },
]

export function AttendancePage() {
  const { employees, attendance, allBranches, schedules, incidencias } = useScopedData()
  const cancelIncidencia = useDataStore((s) => s.cancelIncidencia)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()

  const today = useToday()
  const [date, setDate] = useState(today)
  const [employeeId, setEmployeeId] = useState('all')
  const [branchId, setBranchId] = useState('all')
  const [status, setStatus] = useState('all')
  const [department, setDepartment] = useState('all')
  const [incType, setIncType] = useState('all')
  const [detail, setDetail] = useState<AttendanceRecord | undefined>()
  const [incidenciaOpen, setIncidenciaOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Incidencia | undefined>()

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules])

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees],
  )

  const rows = useMemo(() => {
    const withIncType = new Set(
      incidencias
        .filter((i) => i.type === incType && date >= i.from && date <= i.to)
        .map((i) => i.employeeId),
    )
    return attendance
      .filter((r) => r.date === date)
      .filter((r) => (department === 'all' ? true : empById.get(r.employeeId)?.department === department))
      .filter((r) => (incType === 'all' ? true : withIncType.has(r.employeeId)))
      .filter((r) => (employeeId === 'all' ? true : r.employeeId === employeeId))
      .filter((r) => (branchId === 'all' ? true : r.branchId === branchId))
      .filter((r) => (status === 'all' ? true : r.status === status))
      .filter((r) => empById.has(r.employeeId))
      .sort((a, b) => {
        const ea = a.punches.find((p) => p.type === 'entry')?.time ?? '99:99'
        const eb = b.punches.find((p) => p.type === 'entry')?.time ?? '99:99'
        return ea.localeCompare(eb)
      })
  }, [attendance, incidencias, date, employeeId, branchId, status, department, incType, empById])

  const incidenciasToday = useMemo(() => {
    return incidencias
      .filter((i) => date >= i.from && date <= i.to)
      .filter((i) => empById.has(i.employeeId))
      .filter((i) => (employeeId === 'all' ? true : i.employeeId === employeeId))
      .filter((i) => (department === 'all' ? true : empById.get(i.employeeId)?.department === department))
      .filter((i) => (incType === 'all' ? true : i.type === incType))
      .filter((i) => {
        if (branchId === 'all') return true
        return empById.get(i.employeeId)?.branchId === branchId
      })
      .sort((a, b) => a.from.localeCompare(b.from))
  }, [incidencias, date, employeeId, branchId, department, incType, empById])

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

  const handleExport = () => {
    const result = buildReport('attendance_general', {
      records: rows,
      employees,
      schedules,
      branches: allBranches,
      from: date,
      to: date,
    })
    downloadCSV(
      buildWorkbookPayload(result.title, result.columns, result.rows, { fecha: date }),
      `nexotime-asistencia-${date}`,
    )
    toast.success('Exportación lista', `${rows.length} registros del ${formatShortDate(date)}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencia"
        description="Consulta y administra los registros de todos los empleados."
        actions={
          <Button variant="secondary" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={employeeId}
            onValueChange={setEmployeeId}
            options={[
              { value: 'all', label: 'Todos los empleados' },
              ...employees
                .slice()
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
                .map((e) => ({ value: e.id, label: e.fullName })),
            ]}
          />
          <Select
            value={branchId}
            onValueChange={setBranchId}
            options={[
              { value: 'all', label: 'Todas las sucursales' },
              ...allBranches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
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
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Chip label="Presentes" value={counts.present} tone="text-success" />
          <Chip label="Retardos" value={counts.late} tone="text-warning" />
          <Chip label="Faltas" value={counts.absent} tone="text-destructive" />
          <Chip label="Incompletos" value={counts.incomplete} tone="text-primary" />
          <Chip label="Horas extra" value={counts.overtime} tone="text-success" />
        </div>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Incidencias</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Vacaciones, permisos e incapacidades vigentes el {formatShortDate(date)} — no
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
        {incidenciasToday.length > 0 ? (
          <CardContent className="divide-y divide-border pt-0">
            {incidenciasToday.map((i) => {
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
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead className="hidden md:table-cell">Salida comida</TableHead>
                <TableHead className="hidden md:table-cell">Regreso</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const emp = empById.get(r.employeeId)!
                const p = (t: string) => r.punches.find((x) => x.type === t)?.time
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{emp.fullName}</p>
                          <p className="text-xs text-muted-foreground">{emp.employeeNumber}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p('entry') ? formatTime12(p('entry')) : '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm tabular-nums md:table-cell">
                      {p('lunch_out') ? formatTime12(p('lunch_out')) : '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm tabular-nums md:table-cell">
                      {p('lunch_in') ? formatTime12(p('lunch_in')) : '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p('exit') ? formatTime12(p('exit')) : '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.punches.some((x) => x.type === 'entry') && !p('exit') && r.date === today
                        ? <span className="text-muted-foreground">En curso</span>
                        : formatDuration(r.workedMinutes)}
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
      )}

      <AttendanceDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(undefined)}
        record={detail}
        employee={detail ? empById.get(detail.employeeId) : undefined}
        schedule={detail ? scheduleById.get(detail.scheduleId) : undefined}
      />
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

function Chip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1">
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}
