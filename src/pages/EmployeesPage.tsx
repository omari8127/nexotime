import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, MoreHorizontal, Printer, Search, UserPlus, Users } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { EmployeeStatusBadge } from '@/components/shared/badges'
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { toast } from '@/components/ui/toast'
import { buildWorkbookPayload, downloadCSV } from '@/services/exportService'
import { printCredentials } from '@/lib/credentialPrint'
import { formatTime12 } from '@/lib/utils'
import type { Employee } from '@/types'

export function EmployeesPage() {
  const navigate = useNavigate()
  const { employees, schedules, allBranches } = useScopedData()
  const company = useDataStore((s) => s.company)
  const departmentList = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees],
  )
  const positionList = useMemo(
    () => [...new Set(employees.map((e) => e.position).filter(Boolean))].sort(),
    [employees],
  )
  const { can } = usePermissions()
  const toggleStatus = useDataStore((s) => s.toggleEmployeeStatus)
  const currentUser = useDataStore((s) => s.currentUser)

  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('all')
  const [department, setDepartment] = useState('all')
  const [position, setPosition] = useState('all')
  const [status, setStatus] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | undefined>()

  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules])
  const branchById = useMemo(() => new Map(allBranches.map((b) => [b.id, b])), [allBranches])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees
      .filter((e) => (branch === 'all' ? true : e.branchId === branch))
      .filter((e) => (department === 'all' ? true : e.department === department))
      .filter((e) => (position === 'all' ? true : e.position === position))
      .filter((e) => (status === 'all' ? true : e.status === status))
      .filter((e) =>
        q
          ? [e.fullName, e.employeeNumber, e.position, e.department]
              .join(' ')
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber))
  }, [employees, query, branch, department, position, status])

  const handlePrintBadges = async () => {
    const list = filtered.filter((e) => e.status === 'active')
    const result = await printCredentials(list, company.name)
    if (result === 'blocked') toast.error('No se pudo abrir la impresión', 'Permite las ventanas emergentes para este sitio.')
    else if (result === 'empty') toast.info('Sin credenciales', 'Ningún empleado de la lista tiene códigos activos.')
    else toast.success('Credenciales listas', `${list.length} ${list.length === 1 ? 'credencial' : 'credenciales'} para imprimir (tamaño tarjeta).`)
  }

  const handleExport = () => {
    const payload = buildWorkbookPayload(
      'Empleados',
      [
        { key: 'number', header: 'Número' },
        { key: 'name', header: 'Empleado' },
        { key: 'position', header: 'Puesto' },
        { key: 'department', header: 'Departamento' },
        { key: 'branch', header: 'Sucursal' },
        { key: 'schedule', header: 'Horario' },
        { key: 'status', header: 'Estado' },
      ],
      filtered.map((e) => ({
        number: e.employeeNumber,
        name: e.fullName,
        position: e.position,
        department: e.department,
        branch: branchById.get(e.branchId)?.name ?? '—',
        schedule: scheduleById.get(e.scheduleId)?.name ?? '—',
        status: e.status === 'active' ? 'Activo' : 'Inactivo',
      })),
    )
    downloadCSV(payload, 'nexotime-empleados')
    toast.success('Exportación lista', `${filtered.length} empleados en CSV`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empleados"
        description="Gestiona la información y asistencia de tu equipo."
        actions={
          <>
            <Button variant="secondary" onClick={handlePrintBadges}>
              <Printer className="h-4 w-4" />
              Credenciales
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            {can('employees.create') ? (
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Nuevo empleado
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, número, puesto o departamento"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select
              value={branch}
              onValueChange={setBranch}
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
                ...departmentList.map((d) => ({ value: d, label: d })),
              ]}
            />
            <Select
              value={position}
              onValueChange={setPosition}
              options={[
                { value: 'all', label: 'Todos los puestos' },
                ...positionList.map((p) => ({ value: p, label: p })),
              ]}
            />
            <Select
              value={status}
              onValueChange={setStatus}
              options={[
                { value: 'all', label: 'Todos los estados' },
                { value: 'active', label: 'Activo' },
                { value: 'inactive', label: 'Inactivo' },
              ]}
            />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin resultados"
          description="Ajusta los filtros o registra un nuevo empleado."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Puesto</TableHead>
                <TableHead className="hidden md:table-cell">Departamento</TableHead>
                <TableHead className="hidden lg:table-cell">Sucursal</TableHead>
                <TableHead className="hidden lg:table-cell">Horario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const schedule = scheduleById.get(e.scheduleId)
                const workday = schedule?.days.find((d) => d.enabled)
                return (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/empleados/${e.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={e.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.fullName}</p>
                          <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {e.employeeNumber}
                    </TableCell>
                    <TableCell className="text-sm">{e.position}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{e.department}</TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {branchById.get(e.branchId)?.name}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {workday
                        ? `${formatTime12(workday.entry)} - ${formatTime12(workday.exit)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <EmployeeStatusBadge status={e.status} />
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <Dropdown
                        trigger={
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      >
                        <DropdownItem onSelect={() => navigate(`/empleados/${e.id}`)}>
                          Ver perfil
                        </DropdownItem>
                        {can('employees.edit') ? (
                          <DropdownItem onSelect={() => setEditing(e)}>Editar</DropdownItem>
                        ) : null}
                        <DropdownItem
                          onSelect={() => navigate(`/empleados/${e.id}?tab=asistencia`)}
                        >
                          Ver asistencia
                        </DropdownItem>
                        {can('employees.edit') ? (
                          <DropdownItem
                            destructive={e.status === 'active'}
                            onSelect={() => {
                              toggleStatus(e.id, currentUser)
                              toast.success(
                                e.status === 'active' ? 'Empleado desactivado' : 'Empleado reactivado',
                                e.fullName,
                              )
                            }}
                          >
                            {e.status === 'active' ? 'Desactivar' : 'Reactivar'}
                          </DropdownItem>
                        ) : null}
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {employees.length} empleados
      </p>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <EmployeeFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(undefined)}
        employee={editing}
      />
    </div>
  )
}
