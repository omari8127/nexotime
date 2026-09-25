import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { ROLE_LIST, ROLES } from '@/data/roles'
import type { RoleKey, User } from '@/types'

/**
 * Alta o edición de un acceso: rol, empleado ligado (rol Empleado), sucursales
 * y — para supervisores — departamentos. En modo real también crea el inicio
 * de sesión con la contraseña inicial que se capture aquí.
 */
export function UserFormDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User
}) {
  const mode = useDataStore((s) => s.mode)
  const currentUser = useDataStore((s) => s.currentUser)
  const branches = useDataStore((s) => s.branches)
  const employees = useDataStore((s) => s.employees)
  const users = useDataStore((s) => s.users)
  const addUser = useDataStore((s) => s.addUser)
  const updateUserAccess = useDataStore((s) => s.updateUserAccess)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<RoleKey>('supervisor')
  const [employeeId, setEmployeeId] = useState('')
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isSelf = user?.id === currentUser.id
  const allDepartments = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort()
  // Employees that do not already have an access (a person has at most one).
  const linked = new Set(users.filter((u) => u.employeeId && u.id !== user?.id).map((u) => u.employeeId))
  const freeEmployees = employees.filter((e) => !linked.has(e.id))

  useEffect(() => {
    if (!open) return
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
    setPassword('')
    setRole(user?.role ?? 'supervisor')
    setEmployeeId(user?.employeeId ?? '')
    setBranchIds(user?.branchIds ?? [])
    setDepartments(user?.departments ?? [])
    setError(null)
    setSaving(false)
  }, [open, user])

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const roleOptions = ROLE_LIST.filter((r) => r.key !== 'owner' || currentUser.role === 'owner')

  const submit = async () => {
    setError(null)
    const scope = {
      branchIds: role === 'employee' ? [] : branchIds,
      departments: role === 'supervisor' ? departments : [],
    }
    try {
      setSaving(true)
      if (user) {
        const failure = updateUserAccess(
          user.id,
          {
            role,
            ...scope,
            employeeId: role === 'employee' ? employeeId : undefined,
          },
          currentUser,
        )
        if (failure) {
          setError(failure)
          return
        }
        toast.success('Acceso actualizado', 'El cambio quedó registrado en auditoría.')
      } else {
        if (!name.trim() || !email.trim()) {
          setError('Captura nombre y correo.')
          return
        }
        await addUser(
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: password || undefined,
            role,
            employeeId: role === 'employee' ? employeeId : undefined,
            ...scope,
          },
          currentUser,
        )
        toast.success('Usuario creado', mode === 'live' ? 'Ya puede iniciar sesión.' : 'Agregado a la demostración.')
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? 'Editar acceso' : 'Nuevo usuario'}</DialogTitle>
          <DialogDescription>
            {user
              ? `${user.name} · ${user.email}`
              : 'Da acceso al panel (RH, supervisor…) o al portal "Mi asistencia" de un empleado.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!user ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correo</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode === 'live' ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Contraseña inicial</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <p className="text-xs text-muted-foreground">
                    Compártela por un canal seguro; la persona podrá cambiarla después.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select
              value={role}
              disabled={isSelf}
              onValueChange={(v) => setRole(v as RoleKey)}
              options={roleOptions.map((r) => ({ value: r.key, label: r.label }))}
            />
            <p className="text-xs text-muted-foreground">{ROLES[role].description}</p>
            {isSelf ? <p className="text-xs text-warning">No puedes cambiar tu propio rol.</p> : null}
          </div>

          {role === 'employee' ? (
            <div className="space-y-1.5">
              <Label>Empleado</Label>
              <Select
                value={employeeId}
                onValueChange={setEmployeeId}
                placeholder="Selecciona un empleado"
                options={freeEmployees
                  .slice()
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((e) => ({ value: e.id, label: `${e.fullName} · ${e.employeeNumber}` }))}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Sucursales con acceso</Label>
                <p className="text-xs text-muted-foreground">Sin marcar = toda la empresa.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={branchIds.includes(b.id)}
                        onCheckedChange={() => setBranchIds((l) => toggle(l, b.id))}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
              {role === 'supervisor' && allDepartments.length > 0 ? (
                <div className="space-y-2">
                  <Label>Departamentos a su cargo</Label>
                  <p className="text-xs text-muted-foreground">Sin marcar = todos los de sus sucursales.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {allDepartments.map((d) => (
                      <label key={d} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={departments.includes(d)}
                          onCheckedChange={() => setDepartments((l) => toggle(l, d))}
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : user ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
