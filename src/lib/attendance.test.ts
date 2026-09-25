import { describe, expect, it } from 'vitest'
import {
  canRegisterPunch,
  detectNextPunch,
  splitOvertimeLFT,
  validatePunchSequence,
} from '@/lib/attendance'
import type { Punch } from '@/types'

const p = (type: Punch['type'], time: string): Punch => ({ type, time, method: 'qr' })
const settings = { allowMultipleEntries: false }

describe('detectNextPunch', () => {
  it('propone la entrada al iniciar el día', () => {
    expect(detectNextPunch([], true)?.type).toBe('entry')
  })
  it('con comida: entrada → salida a comida → regreso → salida → día completo', () => {
    expect(detectNextPunch([p('entry', '09:00')], true)?.type).toBe('lunch_out')
    expect(detectNextPunch([p('entry', '09:00'), p('lunch_out', '14:00')], true)?.type).toBe('lunch_in')
    expect(detectNextPunch([p('entry', '09:00'), p('lunch_out', '14:00'), p('lunch_in', '15:00')], true)?.type).toBe('exit')
    const all = [p('entry', '09:00'), p('lunch_out', '14:00'), p('lunch_in', '15:00'), p('exit', '18:00')]
    expect(detectNextPunch(all, true)).toBeNull()
  })
  it('sin control de comida va directo a la salida', () => {
    expect(detectNextPunch([p('entry', '09:00')], false)?.type).toBe('exit')
  })
})

describe('validatePunchSequence', () => {
  it('acepta un día coherente', () => {
    expect(validatePunchSequence([p('entry', '09:00'), p('lunch_out', '14:00'), p('lunch_in', '15:00'), p('exit', '18:00')])).toBeNull()
  })
  it('rechaza secuencias imposibles', () => {
    expect(validatePunchSequence([p('exit', '18:00')])).toMatch(/entrada previa/)
    expect(validatePunchSequence([p('lunch_in', '15:00')])).toMatch(/comida/)
    expect(validatePunchSequence([p('entry', '10:00'), p('exit', '09:00')])).toMatch(/antes de la entrada/)
    expect(validatePunchSequence([p('entry', '09:00'), p('lunch_out', '14:00'), p('lunch_in', '13:00')])).toMatch(/antes de la salida a comida/)
  })
})

describe('canRegisterPunch', () => {
  it('bloquea entrada doble, regreso sin comida y salida sin entrada', () => {
    expect(canRegisterPunch([p('entry', '09:00')], 'entry', settings)).toMatch(/Ya registraste tu entrada/)
    expect(canRegisterPunch([p('entry', '09:00')], 'lunch_in', settings)).toMatch(/sin haber salido a comer/)
    expect(canRegisterPunch([], 'exit', settings)).toMatch(/sin una entrada previa/)
  })
  it('permite una segunda entrada solo si la empresa lo autoriza', () => {
    expect(canRegisterPunch([p('entry', '09:00')], 'entry', { allowMultipleEntries: true })).toBeNull()
  })
  it('no deja salir a quien está en comida', () => {
    expect(canRegisterPunch([p('entry', '09:00'), p('lunch_out', '14:00')], 'exit', settings)).toMatch(/regreso/)
  })

  describe('tiempo mínimo entre checadas', () => {
    const punches = [p('entry', '09:00')]
    it('pide esperar y dice cuánto falta', () => {
      expect(canRegisterPunch(punches, 'lunch_out', settings, { minutes: 2, now: '09:01' })).toMatch(/Espera 1 minuto/)
      expect(canRegisterPunch(punches, 'lunch_out', settings, { minutes: 5, now: '09:01' })).toMatch(/Espera 4 minutos/)
    })
    it('permite checar una vez cumplido el tiempo o si la regla está apagada', () => {
      expect(canRegisterPunch(punches, 'lunch_out', settings, { minutes: 2, now: '09:02' })).toBeNull()
      expect(canRegisterPunch(punches, 'lunch_out', settings, { minutes: 0, now: '09:00' })).toBeNull()
      expect(canRegisterPunch(punches, 'lunch_out', settings)).toBeNull()
    })
    it('la primera checada del día nunca espera', () => {
      expect(canRegisterPunch([], 'entry', settings, { minutes: 10, now: '08:00' })).toBeNull()
    })
  })
})

describe('splitOvertimeLFT', () => {
  it('separa tiempo doble (hasta 9 h) y triple (el excedente)', () => {
    expect(splitOvertimeLFT(4 * 60)).toEqual({ double: 240, triple: 0 })
    expect(splitOvertimeLFT(11 * 60)).toEqual({ double: 540, triple: 120 })
  })
})
