import { describe, expect, it } from 'vitest'
import {
  customHolidayProblem,
  holidayOn,
  holidaysInRange,
  holidaysOfYear,
  officialHolidays,
  suggestedHolidays,
} from '@/lib/holidays'

const dates = (year: number) => officialHolidays(year).map((h) => h.date)

describe('días de descanso obligatorio (Art. 74 LFT)', () => {
  it('2026: los lunes movidos caen donde deben', () => {
    expect(dates(2026)).toEqual([
      '2026-01-01',
      '2026-02-02', // primer lunes de febrero
      '2026-03-16', // tercer lunes de marzo
      '2026-05-01',
      '2026-09-16',
      '2026-11-16', // tercer lunes de noviembre
      '2026-12-25',
    ])
  })

  it('otros años, incluido uno donde el 1 de febrero es lunes', () => {
    expect(dates(2025).slice(1, 3)).toEqual(['2025-02-03', '2025-03-17'])
    expect(dates(2027).filter((d) => /-0[23]-|-11-/.test(d))).toEqual(['2027-02-01', '2027-03-15', '2027-11-15'])
  })

  it('el 1 de octubre solo cada seis años (cambio de Presidente)', () => {
    expect(dates(2024)).toContain('2024-10-01')
    expect(dates(2030)).toContain('2030-10-01')
    expect(dates(2026)).not.toContain('2026-10-01')
    expect(dates(2023)).not.toContain('2023-10-01')
  })
})

describe('Semana Santa y fechas sugeridas', () => {
  it('Jueves y Viernes Santo de varios años', () => {
    const holy = (y: number) => suggestedHolidays(y).filter((h) => /Santo/.test(h.name)).map((h) => h.date)
    expect(holy(2026)).toEqual(['2026-04-02', '2026-04-03'])
    expect(holy(2025)).toEqual(['2025-04-17', '2025-04-18'])
    expect(holy(2024)).toEqual(['2024-03-28', '2024-03-29'])
  })
})

describe('los festivos de una empresa', () => {
  it('sin ajustes: los oficiales', () => {
    expect(holidayOn('2026-09-16')?.name).toBe('Día de la Independencia')
    expect(holidayOn('2026-09-17')).toBeUndefined()
    expect(holidayOn('no es fecha')).toBeUndefined()
  })

  it('una empresa puede apagar los oficiales, quitar uno o agregar los suyos', () => {
    expect(holidayOn('2026-09-16', { official: false })).toBeUndefined()
    expect(holidayOn('2026-09-16', { skipped: ['2026-09-16'] })).toBeUndefined()
    expect(holidayOn('2026-12-25', { skipped: ['2026-09-16'] })?.official).toBe(true)
    const own = { custom: [{ date: '2026-04-03', name: 'Viernes Santo' }] }
    expect(holidayOn('2026-04-03', own)).toMatchObject({ name: 'Viernes Santo', official: false })
    expect(holidayOn('2026-09-16', own)?.official).toBe(true)
    // Con los oficiales apagados, los propios siguen valiendo.
    expect(holidayOn('2026-04-03', { official: false, ...own })).toBeDefined()
  })

  it('lo agregado solo cuenta en su año y una fecha repetida no se duplica', () => {
    const settings = { custom: [{ date: '2026-12-25', name: 'Otro nombre' }, { date: '2027-01-04', name: 'Puente' }] }
    expect(holidaysOfYear(2026, settings).filter((h) => h.date === '2026-12-25')).toHaveLength(1)
    expect(holidayOn('2026-12-25', settings)?.name).toBe('Navidad')
    expect(holidaysOfYear(2026, settings).some((h) => h.date === '2027-01-04')).toBe(false)
    expect(holidayOn('2027-01-04', settings)?.name).toBe('Puente')
  })

  it('rango entre dos años', () => {
    expect(holidaysInRange('2026-12-20', '2027-01-05').map((h) => h.date)).toEqual(['2026-12-25', '2027-01-01'])
  })

  it('valida lo que la empresa quiere agregar', () => {
    expect(customHolidayProblem('', 'x')).toMatch(/fecha/)
    expect(customHolidayProblem('2026-04-03', '  ')).toMatch(/nombre/)
    expect(customHolidayProblem('2026-04-03', 'x'.repeat(61))).toMatch(/largo/)
    expect(customHolidayProblem('2026-09-16', 'Fiestas')).toMatch(/ya es festivo/)
    expect(customHolidayProblem('2026-04-03', 'Viernes Santo')).toBeNull()
    // Si la empresa no observa el 16 de septiembre, sí puede ponerle otro nombre.
    expect(customHolidayProblem('2026-09-16', 'Fiestas', { skipped: ['2026-09-16'] })).toBeNull()
  })
})
