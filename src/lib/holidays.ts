/**
 * Días festivos. Los de descanso obligatorio salen de la Ley Federal del Trabajo (Art. 74); cada empresa puede
 * dejar de observar alguno y agregar los suyos (Jueves y Viernes Santo, 2 de noviembre, un puente…).
 *
 * Qué cambia un festivo: un día laborable festivo sin checadas no es falta; quien sí trabaja ese día se cuenta
 * aparte, porque el Art. 75 LFT obliga a pagarle un salario doble adicional al del día.
 */
import type { CompanyHoliday, HolidaySettings } from '@/types'

export interface Holiday {
  date: string
  name: string
  /** De la LFT (true) o agregado por la empresa (false). */
  official: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** The nth (1-based) Monday of a month. */
function nthMonday(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0 = domingo
  const firstMonday = 1 + ((8 - firstDow) % 7)
  return firstMonday + (n - 1) * 7
}

const cache = new Map<number, Holiday[]>()

/** Días de descanso obligatorio del año (Art. 74 LFT). */
export function officialHolidays(year: number): Holiday[] {
  const hit = cache.get(year)
  if (hit) return hit
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'Año Nuevo', official: true },
    { date: iso(year, 2, nthMonday(year, 2, 1)), name: 'Día de la Constitución', official: true },
    { date: iso(year, 3, nthMonday(year, 3, 3)), name: 'Natalicio de Benito Juárez', official: true },
    { date: iso(year, 5, 1), name: 'Día del Trabajo', official: true },
    { date: iso(year, 9, 16), name: 'Día de la Independencia', official: true },
    // Cada seis años, por el cambio del Poder Ejecutivo Federal (2024, 2030, 2036…).
    ...(year >= 2024 && (year - 2024) % 6 === 0
      ? [{ date: iso(year, 10, 1), name: 'Transmisión del Poder Ejecutivo Federal', official: true }]
      : []),
    { date: iso(year, 11, nthMonday(year, 11, 3)), name: 'Día de la Revolución', official: true },
    { date: iso(year, 12, 25), name: 'Navidad', official: true },
  ]
  list.sort((a, b) => a.date.localeCompare(b.date))
  cache.set(year, list)
  return list
}

/** Domingo de Pascua (calendario gregoriano, algoritmo de Meeus/Jones/Butcher). */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function shift(year: number, month: number, day: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + delta))
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Fechas que muchas empresas descansan sin que la ley lo exija: se ofrecen con un clic. */
export function suggestedHolidays(year: number): CompanyHoliday[] {
  const easter = easterSunday(year)
  return [
    { date: shift(year, easter.month, easter.day, -3), name: 'Jueves Santo' },
    { date: shift(year, easter.month, easter.day, -2), name: 'Viernes Santo' },
    { date: iso(year, 11, 2), name: 'Día de Muertos' },
    { date: iso(year, 12, 12), name: 'Día de la Virgen de Guadalupe' },
    { date: iso(year, 12, 24), name: 'Nochebuena' },
    { date: iso(year, 12, 31), name: 'Fin de año' },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

const isValidDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)

/** Every holiday that applies to the company in a year, sorted by date (one name per date). */
export function holidaysOfYear(year: number, settings?: HolidaySettings): Holiday[] {
  const skipped = new Set(settings?.skipped ?? [])
  const byDate = new Map<string, Holiday>()
  if (settings?.official !== false) {
    for (const h of officialHolidays(year)) if (!skipped.has(h.date)) byDate.set(h.date, h)
  }
  for (const c of settings?.custom ?? []) {
    if (!isValidDate(c.date) || Number(c.date.slice(0, 4)) !== year) continue
    // A date the company adds that is also official keeps the official name.
    if (!byDate.has(c.date)) byDate.set(c.date, { date: c.date, name: c.name.trim() || 'Día festivo', official: false })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** The holiday on a date, if the company observes one. */
export function holidayOn(date: string, settings?: HolidaySettings): Holiday | undefined {
  if (!isValidDate(date)) return undefined
  const year = Number(date.slice(0, 4))
  // Fast path for the (usual) company with nothing custom: no list to build per call.
  if (!settings?.custom?.length && settings?.official !== false && !settings?.skipped?.length) {
    return officialHolidays(year).find((h) => h.date === date)
  }
  return holidaysOfYear(year, settings).find((h) => h.date === date)
}

export function holidaysInRange(from: string, to: string, settings?: HolidaySettings): Holiday[] {
  const out: Holiday[] = []
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysOfYear(y, settings)) if (h.date >= from && h.date <= to) out.push(h)
  }
  return out
}

/** Why a date a company wants to add is not acceptable (null when it is). */
export function customHolidayProblem(
  date: string,
  name: string,
  settings?: HolidaySettings,
): string | null {
  if (!isValidDate(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return 'Elige una fecha.'
  if (!name.trim()) return 'Ponle un nombre al día (por ejemplo, «Puente»).'
  if (name.trim().length > 60) return 'El nombre es muy largo (máximo 60 caracteres).'
  const existing = holidayOn(date, settings)
  if (existing) return `Ese día ya es festivo: ${existing.name}.`
  return null
}
