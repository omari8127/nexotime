import { afterEach, describe, expect, it } from 'vitest'
import {
  businessNow,
  getClockOffset,
  getToday,
  inTimezone,
  isValidTimeZone,
  nowISO,
  setBusinessTimezone,
  setClockOffset,
  toISODate,
  trueNow,
} from '@/lib/today'

// 4 de octubre de 2026, 22:00 UTC
const INSTANT = new Date('2026-10-04T22:00:00Z')
const wall = (d: Date) => `${toISODate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

afterEach(() => {
  setBusinessTimezone(null)
  setClockOffset(0)
})

describe('reloj del aparato desfasado', () => {
  it('corrige un aparato adelantado o atrasado por más de medio minuto', () => {
    setClockOffset(-7 * 60_000) // la tablet va 7 min adelantada
    expect(trueNow().getTime() - Date.now()).toBeCloseTo(-7 * 60_000, -3)
    expect(getClockOffset()).toBe(-7 * 60_000)
  })
  it('ignora diferencias pequeñas (la cabecera del servidor tiene resolución de 1 s)', () => {
    setClockOffset(900)
    setClockOffset(-20_000)
    expect(getClockOffset()).toBe(0)
  })
  it('la hora de la empresa y las marcas de tiempo usan la hora corregida', () => {
    setClockOffset(3 * 3_600_000) // el aparato va 3 h atrasado
    expect(businessNow().getTime() - Date.now()).toBeCloseTo(3 * 3_600_000, -3)
    expect(Date.parse(nowISO()) - Date.now()).toBeCloseTo(3 * 3_600_000, -3)
  })
})

describe('hora de la empresa (no la del aparato)', () => {
  it('lee el mismo instante en la zona de cada empresa', () => {
    expect(wall(inTimezone(INSTANT, 'America/Tijuana'))).toBe('2026-10-04 15:00') // UTC-7 (horario de verano)
    expect(wall(inTimezone(INSTANT, 'America/Mexico_City'))).toBe('2026-10-04 16:00') // UTC-6
    expect(wall(inTimezone(INSTANT, 'America/Cancun'))).toBe('2026-10-04 17:00') // UTC-5
  })
  it('cambia también el día cuando corresponde', () => {
    expect(wall(inTimezone(INSTANT, 'Asia/Tokyo'))).toBe('2026-10-05 07:00')
    expect(wall(inTimezone(new Date('2026-10-05T03:30:00Z'), 'America/Tijuana'))).toBe('2026-10-04 20:30')
  })
  it('medianoche cuenta como 00, no 24', () => {
    expect(wall(inTimezone(new Date('2026-10-05T07:05:00Z'), 'America/Tijuana'))).toBe('2026-10-05 00:05')
  })
  it('sin zona o con una inválida usa la del aparato', () => {
    expect(inTimezone(INSTANT, null)).toBe(INSTANT)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    setBusinessTimezone('Mars/Olympus')
    expect(inTimezone(INSTANT)).toBe(INSTANT)
  })
  it('"hoy" en vivo usa la zona de la empresa; la demostración no cambia', () => {
    setBusinessTimezone('Asia/Tokyo')
    expect(getToday('demo')).toBe('2026-09-10')
    expect(getToday('live')).toBe(toISODate(inTimezone(new Date(), 'Asia/Tokyo')))
  })
})
