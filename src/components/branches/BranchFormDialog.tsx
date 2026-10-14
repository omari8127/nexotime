import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react'
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
import { ROUGH_FIX_METERS, formatDistance, googleMapsUrl, mapEmbedUrl, parseCoordinates } from '@/lib/geo'
import type { Branch } from '@/types'

/** Free, no API key — Nominatim's usage policy is fine for this volume (one
 *  search per branch, only when an admin clicks the button). It returns what it matched, so the
 *  administrator can see whether it found the building or only the neighbourhood. */
async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('No se pudo buscar la dirección.')
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>
  if (!data.length) return null
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name ?? '' }
}

/** This device's precise position: listens for a few seconds and keeps the most accurate fix. */
function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador no permite obtener la ubicación.'))
      return
    }
    let best: { lat: number; lng: number; accuracy: number } | null = null
    const finish = () => {
      navigator.geolocation.clearWatch(id)
      window.clearTimeout(timer)
      if (best) resolve(best)
      else reject(new Error('No se pudo obtener la ubicación. Revisa que el GPS esté encendido.'))
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }
        if (!best || fix.accuracy <= best.accuracy) best = fix
        if (fix.accuracy <= 20) finish()
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(id)
          window.clearTimeout(timer)
          reject(new Error('Permite el acceso a la ubicación en el navegador e inténtalo de nuevo.'))
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
    const timer = window.setTimeout(finish, 12_000)
  })
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
  const [locating, setLocating] = useState(false)
  const [pasted, setPasted] = useState('')
  /** How the point on screen was obtained, and how much to trust it. */
  const [origin, setOrigin] = useState<{ text: string; warn?: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setName(branch?.name ?? '')
    setCode(branch?.code ?? '')
    setAddress(branch?.address ?? '')
    setCity(branch?.city ?? '')
    setPhone(branch?.phone ?? '')
    setLat(branch?.lat)
    setLng(branch?.lng)
    setPasted('')
    setOrigin(null)
  }, [open, branch])

  const hasPoint = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)

  const onPaste = (text: string) => {
    setPasted(text)
    const found = parseCoordinates(text)
    if (found) {
      setLat(found.lat)
      setLng(found.lng)
      setOrigin({ text: 'Coordenadas leídas de lo que pegaste. Revisa en el mapa que el punto cae en tu local.' })
    } else if (text.trim()) {
      setOrigin({
        text: /goo\.gl|maps\.app/i.test(text)
          ? 'Ese enlace corto no trae las coordenadas. En Google Maps haz clic derecho sobre tu local y copia los números.'
          : 'No encontré coordenadas ahí. Deben verse así: 32.520930, -117.007890',
        warn: true,
      })
    } else {
      setOrigin(null)
    }
  }

  const locateMe = async () => {
    setLocating(true)
    try {
      const fix = await currentPosition()
      setLat(fix.lat)
      setLng(fix.lng)
      setPasted('')
      setOrigin(
        fix.accuracy > ROUGH_FIX_METERS
          ? {
              text: `Este equipo solo conoce la zona (±${formatDistance(fix.accuracy)}), no el punto exacto. Hazlo desde un celular parado en el local, o pega las coordenadas de Google Maps.`,
              warn: true,
            }
          : { text: `Ubicación de este equipo, con ±${formatDistance(fix.accuracy)} de precisión. Úsala solo si estás en la sucursal.`, warn: fix.accuracy > 60 },
      )
    } catch (e) {
      toast.error('No se pudo obtener tu ubicación', e instanceof Error ? e.message : undefined)
    } finally {
      setLocating(false)
    }
  }

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
      setPasted('')
      setOrigin({
        text: `La búsqueda encontró: «${found.label}». Suele caer en la colonia o la calle, no en tu puerta: revisa el mapa y, si no es tu local, pega las coordenadas de Google Maps.`,
        warn: true,
      })
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
      <DialogContent className="max-w-lg">
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

          <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3.5">
            <div>
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Ubicación exacta de la sucursal
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Es el punto que se usa cuando el reloj checador no tiene GPS preciso (una PC o una tablet solo
                conocen la zona) y contra el que se mide a qué distancia checó cada quien.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Pega las coordenadas de Google Maps (lo más exacto)</Label>
              <Input
                value={pasted}
                onChange={(e) => onPaste(e.target.value)}
                placeholder="32.520930, -117.007890"
                spellCheck={false}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                En Google Maps: clic derecho (o mantén presionado en el celular) sobre tu local y toca los números
                para copiarlos.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void locateMe()} disabled={locating}>
                {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                {locating ? 'Buscando señal…' : 'Usar mi ubicación actual'}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void findLocation()} disabled={searching}>
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Buscar por dirección
              </Button>
              {hasPoint ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setLat(undefined)
                    setLng(undefined)
                    setPasted('')
                    setOrigin(null)
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Quitar
                </Button>
              ) : null}
            </div>

            {origin ? (
              <p
                className={
                  origin.warn
                    ? 'rounded-md bg-amber-400/15 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200'
                    : 'rounded-md bg-success/12 px-2.5 py-1.5 text-xs text-success'
                }
              >
                {origin.text}
              </p>
            ) : null}

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

            {hasPoint ? (
              <div className="space-y-1.5">
                <iframe
                  key={`${lat},${lng}`}
                  title="Mapa de la ubicación de la sucursal"
                  src={mapEmbedUrl({ lat: lat as number, lng: lng as number })}
                  loading="lazy"
                  className="h-44 w-full rounded-lg border border-border"
                />
                <a
                  href={googleMapsUrl({ lat: lat as number, lng: lng as number })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Comprobar este punto en Google Maps
                </a>
              </div>
            ) : null}
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
