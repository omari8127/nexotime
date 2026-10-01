import { useEffect, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
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
import type { Branch } from '@/types'

/** Free, no API key — Nominatim's usage policy is fine for this volume (one
 *  search per branch, only when an admin clicks the button). */
async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('No se pudo buscar la dirección.')
  const data = (await res.json()) as Array<{ lat: string; lon: string }>
  if (!data.length) return null
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) }
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit to create a new branch; pass one to edit it. */
  branch?: Branch
}) {
  const addBranch = useDataStore((s) => s.addBranch)
  const updateBranch = useDataStore((s) => s.updateBranch)
  const currentUser = useDataStore((s) => s.currentUser)
  const company = useDataStore((s) => s.company)
  const isEdit = !!branch

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [lat, setLat] = useState<number | undefined>(undefined)
  const [lng, setLng] = useState<number | undefined>(undefined)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(branch?.name ?? '')
    setCode(branch?.code ?? '')
    setAddress(branch?.address ?? '')
    setCity(branch?.city ?? '')
    setPhone(branch?.phone ?? '')
    setLat(branch?.lat)
    setLng(branch?.lng)
  }, [open, branch])

  const findLocation = async () => {
    if (!address.trim() && !city.trim()) {
      toast.error('Escribe al menos la ciudad para poder buscarla')
      return
    }
    setSearching(true)
    try {
      const found = await geocode(`${address}, ${city}, México`.replace(/^,\s*/, ''))
      if (!found) {
        toast.error('No encontramos esa dirección', 'Intenta con solo la ciudad, o escribe las coordenadas a mano.')
        return
      }
      setLat(found.lat)
      setLng(found.lng)
      toast.success('Ubicación encontrada')
    } catch {
      toast.error('No se pudo buscar la dirección', 'Revisa tu conexión e intenta de nuevo.')
    } finally {
      setSearching(false)
    }
  }

  const submit = () => {
    if (!name.trim()) {
      toast.error('Falta el nombre de la sucursal')
      return
    }
    if (isEdit && branch) {
      updateBranch(
        branch.id,
        {
          name: name.trim(),
          code: code.trim() || name.trim().slice(0, 3).toUpperCase(),
          address: address.trim(),
          city: city.trim(),
          phone: phone.trim() || undefined,
          lat,
          lng,
        },
        currentUser,
      )
      toast.success('Sucursal actualizada', name.trim())
    } else {
      addBranch(
        {
          name: name.trim(),
          code: code.trim() || name.trim().slice(0, 3).toUpperCase(),
          address: address.trim(),
          city: city.trim(),
          timezone: company.timezone,
          phone: phone.trim() || undefined,
          active: true,
          lat,
          lng,
        },
        currentUser,
      )
      toast.success('Sucursal creada', name.trim())
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
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

          <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Ubicación del reloj checador
              </Label>
              <Button type="button" variant="secondary" size="sm" onClick={() => void findLocation()} disabled={searching}>
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Buscar por dirección
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              El reloj checador de esta sucursal mostrará esta ubicación en cada registro, en vez de
              depender del GPS de cada tablet.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Latitud</Label>
                <Input
                  type="number"
                  step="any"
                  value={lat ?? ''}
                  onChange={(e) => setLat(e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="20.6597"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Longitud</Label>
                <Input
                  type="number"
                  step="any"
                  value={lng ?? ''}
                  onChange={(e) => setLng(e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="-103.3496"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>{isEdit ? 'Guardar cambios' : 'Crear sucursal'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
