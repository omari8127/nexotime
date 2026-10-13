import { describe, expect, it } from 'vitest'
import { allowedPunchTypes, describeBlock } from '@/lib/kioskFeedback'
import type { Punch } from '@/types'

const punch = (type: Punch['type'], time: string): Punch => ({ type, time, method: 'face' }) as Punch
const settings = { allowMultipleEntries: false, trackLunch: true }

describe('mensajes del reloj cuando algo no se puede registrar', () => {
  it('un registro repetido no es un error', () => {
    expect(describeBlock('Ya registraste tu entrada hoy a las 8:55 a. m.')).toEqual({ title: 'Ya está registrado', tone: 'done' })
  })
  it('la espera entre checadas es solo una espera', () => {
    expect(describeBlock('Acabas de registrar. Espera 2 minutos para volver a checar.').tone).toBe('wait')
  })
  it('un orden imposible se explica, no se castiga', () => {
    expect(describeBlock('Primero registra tu entrada.').tone).toBe('warn')
    expect(describeBlock('Estás en comida: registra primero tu regreso.').tone).toBe('warn')
    expect(describeBlock('No puedes registrar salida sin una entrada previa.').tone).toBe('warn')
  })
  it('lo demás es un error', () => {
    expect(describeBlock('Algo inesperado').tone).toBe('error')
  })
})

describe('qué puede registrar ahora', () => {
  it('sin nada registrado: solo la entrada', () => {
    expect(allowedPunchTypes([], settings)).toEqual(['entry'])
  })
  it('ya entró: puede salir a comer o salir', () => {
    expect(allowedPunchTypes([punch('entry', '08:55')], settings)).toEqual(['lunch_out', 'exit'])
  })
  it('en la comida: solo regresar', () => {
    expect(allowedPunchTypes([punch('entry', '08:55'), punch('lunch_out', '14:00')], settings)).toEqual(['lunch_in'])
  })
  it('sin control de comida no ofrece comida', () => {
    expect(allowedPunchTypes([punch('entry', '08:55')], { ...settings, trackLunch: false })).toEqual(['exit'])
  })
  it('día completo: nada', () => {
    const day = [punch('entry', '08:55'), punch('lunch_out', '14:00'), punch('lunch_in', '14:45'), punch('exit', '18:00')]
    expect(allowedPunchTypes(day, settings)).toEqual([])
  })
  it('durante la espera entre checadas no ofrece nada', () => {
    expect(allowedPunchTypes([punch('entry', '08:55')], settings, { minutes: 2, now: '08:56' })).toEqual([])
  })
})
