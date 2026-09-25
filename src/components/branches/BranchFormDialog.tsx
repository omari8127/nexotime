import { useState } from 'react'
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
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'

export function BranchFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addBranch = useDataStore((s) => s.addBranch)
  const currentUser = useDataStore((s) => s.currentUser)
  const company = useDataStore((s) => s.company)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')

  const submit = () => {
    if (!name.trim()) {
      toast.error('Falta el nombre de la sucursal')
      return
    }
    addBranch(
      {
        name: name.trim(),
        code: code.trim() || name.trim().slice(0, 3).toUpperCase(),
        address: address.trim(),
        city: city.trim(),
        timezone: company.timezone,
        phone: phone.trim() || undefined,
        active: true,
      },
      currentUser,
    )
    toast.success('Sucursal creada', name.trim())
    setName('')
    setCode('')
    setAddress('')
    setCity('')
    setPhone('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva sucursal</DialogTitle>
          <DialogDescription>
            Cada sucursal agrupa su propio personal, dispositivos y horarios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sucursal Centro" />
            </div>
            <div className="space-y-1.5">
              <Label>Código (opcional)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CEN" maxLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Guadalajara, Jal." />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Dirección</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, colonia" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Teléfono (opcional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="33 1234 5678" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Crear sucursal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
