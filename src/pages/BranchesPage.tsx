import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, MapPin, MonitorSmartphone, Plus, Users } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BranchFormDialog } from '@/components/branches/BranchFormDialog'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useToday } from '@/hooks/useToday'

export function BranchesPage() {
  const { branches, employees, devices, attendance } = useScopedData()
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const today = useToday()

  const stats = useMemo(() => {
    return branches.map((b) => {
      const emp = employees.filter((e) => e.branchId === b.id)
      const active = emp.filter((e) => e.status === 'active').length
      const dev = devices.filter((d) => d.branchId === b.id)
      const online = dev.filter((d) => d.status === 'online').length
      const present = attendance.filter(
        (r) => r.branchId === b.id && r.date === today && r.punches.length > 0,
      ).length
      return { branch: b, total: emp.length, active, devices: dev.length, online, present }
    })
  }, [branches, employees, devices, attendance, today])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sucursales"
        description="Administra tus ubicaciones, su personal y sus dispositivos."
        actions={
          can('branches.manage') ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva sucursal
            </Button>
          ) : null
        }
      />

      {stats.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no tienes sucursales"
          description="Crea tu primera sucursal para poder asignar empleados, horarios y dispositivos."
          action={
            can('branches.manage') ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Crear mi primera sucursal
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stats.map(({ branch, total, active, devices: dev, online, present }) => (
            <Link key={branch.id} to={`/sucursales/${branch.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{branch.name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {branch.city || 'Sin ciudad registrada'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                    <div>
                      <p className="text-lg font-semibold tabular-nums">{total}</p>
                      <p className="text-xs text-muted-foreground">Empleados</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tabular-nums text-success">{present}</p>
                      <p className="text-xs text-muted-foreground">Hoy</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tabular-nums">{dev}</p>
                      <p className="text-xs text-muted-foreground">Dispositivos</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      <Users className="h-3 w-3" />
                      {active} activos
                    </Badge>
                    <Badge variant={online > 0 ? 'success' : 'muted'}>
                      <MonitorSmartphone className="h-3 w-3" />
                      {online} en línea
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <BranchFormDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
