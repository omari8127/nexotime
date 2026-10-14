import { trueNow } from '@/lib/today'
import type { CaptureMethod, PunchType } from '@/types'

export interface PhotoCapture {
  id: string
  capturedAt: string
  dataUrl: string
  width: number
  height: number
}
export interface AttendancePhoto extends PhotoCapture {
  companyId: string
  employeeId: string
  date: string
}
export const PHOTO_MAX_CHARS = 180_000
/** The database deletes the photo of a checada this many days after its date (migration 009). */
export const PHOTO_RETENTION_DAYS = 90

/** The company's own plazo (Configuración → Reloj checador), within what the database accepts. */
export function photoRetentionDays(settings?: { photoRetentionDays?: number } | null): number {
  const n = settings?.photoRetentionDays
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(3650, Math.max(30, Math.round(n))) : PHOTO_RETENTION_DAYS
}

/** True when the photo of a movement of that day has already been (or is about to be) deleted. */
export function photoExpired(date: string, now = Date.now(), days = PHOTO_RETENTION_DAYS): boolean {
  const day = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(day) && now - day > days * 86_400_000
}
export const PHOTO_MAX_AGE_MS = 90_000
export const needsEntryPhoto = (method: CaptureMethod, type: PunchType) =>
  type === 'entry' && (method === 'employee_number' || method === 'pin')

/** A photo taken a moment ago still counts; one that waited on a screen for over a minute is retaken. */
export const PHOTO_REUSE_MAX_AGE_MS = 75_000
export function photoIsFresh(photo: PhotoCapture, now = trueNow().getTime()): boolean {
  const age = now - Date.parse(photo.capturedAt)
  return Number.isFinite(age) && age >= -5000 && age <= PHOTO_REUSE_MAX_AGE_MS
}

export function validatePhotoCapture(photo: PhotoCapture, now = trueNow().getTime()): void {
  const age = now - Date.parse(photo?.capturedAt)
  if (!photo || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(photo.id) ||
    !Number.isFinite(age) || age < -5000 || age > PHOTO_MAX_AGE_MS ||
    !Number.isInteger(photo.width) || !Number.isInteger(photo.height) ||
    photo.width < 160 || photo.height < 120 || photo.width > 640 || photo.height > 640 ||
    typeof photo.dataUrl !== 'string' || photo.dataUrl.length > PHOTO_MAX_CHARS ||
    photo.dataUrl.length < 200 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(photo.dataUrl)) {
    throw new Error('No se obtuvo una foto válida y reciente. Vuelve a tomarla.')
  }
  const bytes = atob(photo.dataUrl.split(',')[1])
  if (bytes.length < 100 || bytes.charCodeAt(bytes.length - 2) !== 255 || bytes.charCodeAt(bytes.length - 1) !== 217) {
    throw new Error('La fotografía está incompleta. Vuelve a tomarla.')
  }
}

/**
 * Longest side of a kiosk photo. Every checada keeps one now, so they are small (about 25–40 KB): enough
 * to recognise the person, and a year of a 10-person company stays well under a gigabyte.
 */
export const KIOSK_PHOTO_MAX_SIDE = 480

/** Encode the very frame that passed the face/quality check. No upload/file picker. */
export function encodePhotoCapture(frame: HTMLCanvasElement, maxSide = 640): PhotoCapture {
  const image = document.createElement('canvas')
  const ratio = Math.min(1, maxSide / Math.max(frame.width, frame.height))
  image.width = Math.round(frame.width * ratio)
  image.height = Math.round(frame.height * ratio)
  const ctx = image.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la fotografía.')
  ctx.drawImage(frame, 0, 0, image.width, image.height)
  let dataUrl = ''
  for (const quality of [0.72, 0.6, 0.5]) {
    dataUrl = image.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= PHOTO_MAX_CHARS) break
  }
  const capture = { id: crypto.randomUUID(), capturedAt: trueNow().toISOString(), dataUrl, width: image.width, height: image.height }
  validatePhotoCapture(capture)
  return capture
}
