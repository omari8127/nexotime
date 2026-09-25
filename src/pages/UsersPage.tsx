import { Fragment } from 'react'
import { useState } from 'react'
import { Check, Minus, Pencil, ShieldCheck, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserFormDialog } from '@/components/users/UserFormDialog'
import { usePermissions } from '@/hooks/useScopedData'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDataStore } from '@/store/dataStore'
import { useScopedData } from '@/hooks/useScopedData'
import { ROLE_LIST, ROLES } from '@/data/roles'
import type { Permission, User } from '@/types'

const PERMISSION_GROUPS: Array<{ label: string; permissions: Array<{ key: Permission; label: string }> }> = [
  {
    label: 'Empleados',
    permissions: [
      { key: 'employees.view', label: 'Ver empleados' },
      { key: 'employees.create', label: 'Crear empleados' },
      { key: 'employees.edit', label: 'Editar empleados' },
      { key: 'employees.delete', label: 'Eliminar / desactivar' },
    ],
  },
  {
    label: 'Asistencia',
    permissions: [
      { key: 'attendance.view', label: 'Ver asistencia' },
      { key: 'attendance.edit', label: 'Corregir registros' },
      { key: 'attendance.request_correction', label: 'Solicitar correcciones' },
      { key: 'incidencias.view', label: 'Ver y registrar incidencias' },
      { key: 'incidencias.review', label: 'Aprobar / rechazar incidencias' },
      { key: 'corrections.review', label: 'Aprobar / rechazar correcciones' },
      { key: 'self.view', label: 'Portal "Mi asistencia" (solo lo propio)' },
    ],
  },
  {
    label: 'Administración',
    permissions: [
      { key: 'schedules.manage', label: 'Gestionar horarios' },
      { key: 'reports.export', label: 'Exportar reportes' },
      { key: 'users.manage', label: 'Gestionar usuarios' },
      { key: 'settings.manage', label: 'Configuración crítica' },
      { key: 'audit.view', label: 'Ver historial de auditoría' },
    ],
  },
]

export function UsersPage() {
  const users = useDataStore((s) => s.users)
  const mode = useDataStore((s) => s.mode)
  const currentUser = useDataStore((s) => s.currentUser)
  const setCurrentUser = useDataStore((s) => s.setCurrentUser)
  const { allBranches } = useScopedData()
  const { can } = usePermissions()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | undefined>()
  const canManage = can('users.manage')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y permisos"
        description="Define quién accede y qué puede hacer. Los empleados solo ven su propia información en «Mi asistencia»."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(undefined)
                setFormOpen(true)
              }}
            >
              <UserPlus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Usuarios del panel</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="hidden md:table-cell">Alcance</TableHead>
                <TableHead className="hidden lg:table-cell">Último acceso</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} size="sm" />
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'owner' || u.role === 'admin' ? 'default' : 'secondary'}>
                      {ROLES[u.role].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {u.role === 'employee'
                      ? 'Solo su propia asistencia'
                      : `${
                          u.branchIds.length === 0
                            ? 'Toda la empresa'
                            : u.branchIds
                                .map((id) => allBranches.find((b) => b.id === id)?.name ?? id)
                                .join(', ')
                        }${u.departments && u.departments.length ? ` · ${u.departments.join(', ')}` : ''}`}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-MX') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.id === currentUser.id ? (
                        <Badge variant="success">Sesión actual</Badge>
                      ) : mode === 'demo' ? (
                        <button
                          type="button"
                          onClick={() => setCurrentUser(u.id)}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Entrar como
                        </button>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar acceso de ${u.name}`}
                          onClick={() => {
                            setEditing(u)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {ROLE_LIST.map((role) => (
          <Card key={role.key}>
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {role.label}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{role.description}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de permisos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permiso</TableHead>
                {ROLE_LIST.map((r) => (
                  <TableHead key={r.key} className="text-center">
                    {r.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                    <TableCell colSpan={ROLE_LIST.length + 1} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.permissions.map((p) => (
                    <TableRow key={p.key}>
                      <TableCell className="text-sm">{p.label}</TableCell>
                      {ROLE_LIST.map((r) => (
                        <TableCell key={r.key} className="text-center">
                          {r.permissions.includes(p.key) ? (
                            <Check className="mx-auto h-4 w-4 text-success" />
                          ) : (
                            <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
    </div>
  )
}
