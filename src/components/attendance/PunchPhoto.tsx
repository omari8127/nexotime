import { useEffect, useRef, useState } from 'react'
import { Camera, ImageOff, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PunchTypeTag } from '@/components/attendance/PunchPill'
import { MiniMap } from '@/components/shared/MiniMap'
import { useDataStore } from '@/store/dataStore'
import { getLocalPhoto } from '@/services/evidence/localPhotos'
import { liveReadAttendancePhoto } from '@/services/live/liveApi'
import { isValidTimeZone } from '@/lib/today'
import { photoExpired, photoRetentionDays } from '@/lib/photoEvidence'
import { formatTime12 } from '@/lib/utils'
import type { AttendanceRecord, Employee, Punch } from '@/types'

/** Photos already fetched in this session, so scrolling back up never asks the server twice. */
const cache = new Map<string, string>()
const CACHE_LIMIT = 150

async function loadPhoto(record: AttendanceRecord, id: string, live: boolean): Promise<string> {
  const known = cache.get(id)
  if (known) return known
  const local = await getLocalPhoto(id).catch(() => undefined)
  const photo = local ?? (live ? await liveReadAttendancePhoto(id, record.companyId, record.employeeId) : undefined)
  if (!photo || photo.employeeId !== record.employeeId || photo.companyId !== record.companyId) {
    throw new Error('La foto todavía no está disponible.')
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(id, photo.dataUrl)
  return photo.dataUrl
}

/**
 * The photo taken with one movement, as a small thumbnail that opens full size. Nothing is downloaded
 * until the admin presses "Cargar" (`reloadKey` > 0) or clicks this one thumbnail, and even then only
 * once the row scrolls into view: opening a long list never pulls hundreds of pictures at once.
 */
export function PunchPhoto({
  record,
  punch,
  employee,
  reloadKey = 0,
}: {
  record: AttendanceRecord
  punch: Punch
  employee: Employee
  /** Bumped by "Cargar": load the photos of the rows on screen and retry the ones that failed. */
  reloadKey?: number
}) {
  const live = useDataStore((s) => s.mode === 'live')
  const timezone = useDataStore((s) => s.company.timezone)
  const keepDays = useDataStore((s) => photoRetentionDays(s.company.attendanceSettings))
  const evidence = punch.photoEvidence
  const holder = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  const [image, setImage] = useState(() => (evidence ? (cache.get(evidence.id) ?? '') : ''))
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(reloadKey > 0)
  const [seenKey, setSeenKey] = useState(reloadKey)
  if (reloadKey !== seenKey) {
    setSeenKey(reloadKey)
    if (reloadKey > 0) {
      setRequested(true)
      setFailed(false)
    }
  }

  // Re-armed when the photo shows up later (a sync can add it to a row already on screen).
  const hasEvidence = !!evidence
  useEffect(() => {
    const el = holder.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: '120px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, hasEvidence])

  useEffect(() => {
    if (!evidence || !requested || !visible || image || failed) return
    let alive = true
    loadPhoto(record, evidence.id, live)
      .then((url) => {
        if (alive) setImage(url)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [evidence, requested, visible, image, failed, live, record])

  if (!evidence) return <span className="whitespace-nowrap text-xs text-muted-foreground/60">Sin foto</span>

  const captured = new Date(evidence.capturedAt).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: isValidTimeZone(timezone) ? timezone : undefined,
  })

  return (
    <>
      <button
        ref={holder}
        type="button"
        disabled={requested && !image && !failed}
        onClick={(e) => {
          e.stopPropagation()
          if (image) setOpen(true)
          else {
            setFailed(false)
            setRequested(true)
          }
        }}
        title={
          failed
            ? photoExpired(record.date, Date.now(), keepDays)
              ? `La foto se eliminó: se conservan ${keepDays} días`
              : 'La foto todavía no está disponible (clic para reintentar)'
            : image
              ? 'Ver foto'
              : 'Cargar esta foto'
        }
        className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hover:scale-100"
      >
        {image ? (
          <img src={image} alt={`Foto de ${employee.fullName}`} className="h-full w-full object-cover" />
        ) : failed ? (
          <ImageOff className="h-4 w-4" />
        ) : requested ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={punch.location ? 'max-w-2xl' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle>{employee.fullName}</DialogTitle>
            <DialogDescription>
              {employee.employeeNumber} · foto tomada el {captured}
            </DialogDescription>
          </DialogHeader>
          <div className={punch.location ? 'grid gap-2.5 sm:grid-cols-2' : undefined}>
            <img
              src={image}
              alt={`Foto de ${employee.fullName}`}
              className={punch.location ? 'h-56 w-full rounded-lg object-cover' : 'max-h-[60vh] w-full rounded-lg object-contain'}
            />
            {punch.location ? <MiniMap location={punch.location} link className="h-56 w-full rounded-lg border border-border" /> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <PunchTypeTag type={punch.type} />
            <span className="text-sm font-semibold tabular-nums">{formatTime12(punch.time)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Evidencia original del momento de la checada. Compárala con la persona: no cambia aunque se corrija la hora.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
