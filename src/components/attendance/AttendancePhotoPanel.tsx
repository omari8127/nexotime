import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useDataStore } from '@/store/dataStore'
import { isValidTimeZone } from '@/lib/today'
import { canAccessEmployee } from '@/lib/scope'
import { getLocalPhoto } from '@/services/evidence/localPhotos'
import { liveReadAttendancePhoto } from '@/services/live/liveApi'
import type { AttendanceRecord } from '@/types'

export function AttendancePhotoPanel({ record, open }: { record: AttendanceRecord; open: boolean }) {
  const user = useDataStore((s) => s.currentUser)
  const employee = useDataStore((s) => s.employees.find((e) => e.id === record.employeeId))
  const mode = useDataStore((s) => s.mode)
  const timezone = useDataStore((s) => s.company.timezone)
  const photo = record.punches.find((p) => p.photoEvidence)?.photoEvidence
  const [image, setImage] = useState('')
  const [imageId, setImageId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState(false)
  const [retry, setRetry] = useState(0)
  const allowed = !!employee && user.companyId === record.companyId && canAccessEmployee(user, employee)
  useEffect(() => { setRequested(false); setImage(''); setError('') }, [open, record.id, photo?.id, user.id])
  useEffect(() => {
    if (!open || !requested || !photo || !allowed) return
    let alive = true
    setBusy(true); setError(''); setImage('')
    const load = async () => {
      const local = await getLocalPhoto(photo.id).catch(() => undefined)
      const result = local ?? (mode === 'live' ? await liveReadAttendancePhoto(photo.id, record.companyId, record.employeeId) : undefined)
      if (!result || result.companyId !== record.companyId || result.employeeId !== record.employeeId || result.date !== record.date) {
        throw new Error('La foto todavía no está disponible en este equipo. Revisa la sincronización del reloj que tomó la entrada.')
      }
      if (alive) { setImage(result.dataUrl); setImageId(photo.id) }
    }
    void load().catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo consultar la foto.') })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [open, requested, retry, photo?.id, allowed, user.id, mode, record.companyId, record.employeeId, record.date])
  if (!photo || !allowed) return null
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">Foto de entrada</h3>
        <p className="text-xs text-muted-foreground">Capturada: {new Date(photo.capturedAt).toLocaleString('es-MX', { timeZone: isValidTimeZone(timezone) ? timezone : 'America/Mexico_City' })}. Evidencia original; no cambia al corregir el horario.</p></div>
      {!requested ? <Button variant="secondary" onClick={() => setRequested(true)}>Ver foto de evidencia</Button> : null}
      {busy ? <p role="status" className="text-sm">Cargando foto…</p> : null}
      {image && imageId === photo.id && open ? <img src={image} alt="Evidencia de la entrada seleccionada" className="max-h-80 w-full rounded-lg object-contain" /> : null}
      {error ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>Reintentar</Button></div> : null}
    </section>
  )
}
