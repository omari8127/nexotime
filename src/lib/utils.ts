import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format "HH:mm" 24h string into localized 12h label, e.g. "08:57" -> "08:57 a.m." */
export function formatTime12(value?: string | null): string {
  if (!value) return '—'
  const [hStr, mStr] = value.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return '—'
  const period = h < 12 ? 'a.m.' : 'p.m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
}

/** Minutes since midnight for an "HH:mm" string. */
export function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

/** "HH:mm" from minutes since midnight. */
export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.round(total))
  const h = Math.floor(clamped / 60) % 24
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Human readable duration, e.g. 429 -> "7h 09m". */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h 00m'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const CAPITALIZED_DATE = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatLongDate(date: Date): string {
  const s = CAPITALIZED_DATE.format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(d)
}

export function greeting(date: Date): string {
  const h = date.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function currency(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** "HH:mm" (24 h) for a Date, in local time. */
export function formatClock24(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
