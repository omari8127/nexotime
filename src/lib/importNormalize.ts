/**
 * Shared value-cleaning for anything read from a spreadsheet: real users type
 * dates and times in whatever format Excel shows them, or Excel silently turns
 * a typed date/time into its own serial number. These normalizers accept both.
 */

/** Accents/case-insensitive comparison key, for matching names typed by hand. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function isValidISODate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

/** "2026-09-25", "25/09/2026" or an Excel date serial (e.g. "46290") → ISO, or null if not a date. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidISODate(s) ? s : null
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (dmy) {
    const [, d, m, y] = dmy
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    return isValidISODate(iso) ? iso : null
  }
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s)
    if (serial > 20_000 && serial < 80_000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
  }
  return null
}

/** "9:03", "09:03", or an Excel time serial (a fraction of a day, e.g. "0.375") → "HH:MM", or null. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const hm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null
  }
  if (/^0?\.\d+$/.test(s)) {
    const totalMinutes = Math.round(Number(s) * 24 * 60)
    if (totalMinutes >= 0 && totalMinutes < 24 * 60) {
      return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
    }
  }
  return null
}
