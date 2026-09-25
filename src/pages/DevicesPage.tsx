import { useState } from 'react'
import { Laptop, MonitorSmartphone, Plus, Tablet, Terminal } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DeviceStatusBadge } from '@/components/shared/badges'
import { toast } from '@/components/ui/toast'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { relativeFromNow } from '@/lib/week'
import type { DeviceType } from '@/types'

const TYPE_ICON: Record<DeviceType, typeof Tablet> = {
  tablet: Tablet,
  pc: Laptop,
  terminal: Terminal,
  mobile: MonitorSmartphone,
}

export function DevicesPage() {
  const { devices, allBranches } = useScopedData()
  const { can } = usePermissions()
  const addDevice = useDataStore((s) => s.addDevice)
  const currentUser = useDataStore((s) => s.currentUser)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState(allBranches[0]?.id ?? '')
  const [type, setType] = useState<DeviceType>('tablet')

  const register = () => {
    if (!name.trim()) {
      toast.error('Falta el nombre del dispositivo')
      return
    }
    addDevice(
      {
        branchId,
        name: name.trim(),
        type,
        platform: type === 'tablet' ? 'Android Tablet' : type === 'pc' ? 'Windows' : 'NEXOTIME OS',
        status: 'online',
        lastSeenAt: new Date().toISOString().slice(0, 19),
        pairingCode: `${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`,
        enabledMethods: ['face', 'qr', 'barcode', 'employee_number', 'pin'],
      },
      currentUser,
    )
    toast.success('Dispositivo registrado', name.trim())
    setName('')
    setOpen(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispositivos"
        description="Administra los relojes checadores conectados."
        actions={
          can('devices.manage') ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Registrar dispositivo
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((d) => {
          const Icon = TYPE_ICON[d.type]
          const branch = allBranches.find((b) => b.id === d.branchId)
          return (
            <Card key={d.id}>
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{branch?.name}</p>
                    </div>
                  </div>
                  <DeviceStatusBadge status={d.status} />
                </div>
                <div className="space-y-1 border-t border-border pt-3 text-sm">
                  <Row label="Plataforma" value={d.platform} />
                  <Row label="Última conexión" value={relativeFromNow(d.lastSeenAt)} />
                  <Row label="Código" value={d.pairingCode} mono />
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.enabledMethods.map((m) => (
                    <Badge key={m} variant="secondary">
                      {m === 'qr'
                        ? 'QR'
                        : m === 'barcode'
                          ? 'Código de barras'
                          : m === 'pin'
                            ? 'PIN'
                            : 'Número'}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar dispositivo</DialogTitle>
            <DialogDescription>
              Da de alta una tablet o PC. Luego ingresa el código en el reloj checador para emparejar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tablet Entrada Principal" />
            </div>
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select
                value={branchId}
                onValueChange={setBranchId}
                options={allBranches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as DeviceType)}
                options={[
                  { value: 'tablet', label: 'Tablet' },
                  { value: 'pc', label: 'PC' },
                  { value: 'terminal', label: 'Terminal dedicada' },
                ]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={register}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'font-medium'}>{value}</span>
    </div>
  )
}
