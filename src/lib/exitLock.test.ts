import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BASE_LOCK_MS,
  FORGET_AFTER_MS,
  FRESH,
  MAX_FAILS,
  MAX_LOCK_MS,
  afterFailure,
  loadExitLock,
  lockRemaining,
  saveExitLock,
  waitText,
  type ExitLockState,
} from '@/lib/exitLock'

const fail = (state: ExitLockState, times: number, start = 1_000_000, step = 1_000) => {
  let s = state
  for (let i = 0; i < times; i++) s = afterFailure(s, start + i * step)
  return s
}

describe('freno al código de salida', () => {
  it('cuatro errores todavía no bloquean; el quinto bloquea un minuto', () => {
    const four = fail(FRESH, MAX_FAILS - 1)
    expect(lockRemaining(four, 1_010_000)).toBe(0)
    const five = fail(FRESH, MAX_FAILS)
    expect(lockRemaining(five, 1_000_000 + (MAX_FAILS - 1) * 1_000)).toBe(BASE_LOCK_MS)
  })

  it('cada bloqueo seguido dura el doble, con tope de 15 minutos', () => {
    let s = FRESH
    let t = 0
    const durations: number[] = []
    for (let round = 0; round < 7; round++) {
      for (let i = 0; i < MAX_FAILS; i++) {
        t += 1_000
        s = afterFailure(s, t)
      }
      durations.push(lockRemaining(s, t))
      t = s.lockedUntil + 1 // espera a que termine y vuelve a fallar
    }
    expect(durations.slice(0, 4)).toEqual([60_000, 120_000, 240_000, 480_000])
    expect(durations[4]).toBe(MAX_LOCK_MS)
    expect(durations[6]).toBe(MAX_LOCK_MS)
  })

  it('media hora sin intentar borra la racha', () => {
    const s = fail(FRESH, MAX_FAILS) // bloqueado
    const later = s.lockedUntil + FORGET_AFTER_MS + 1
    const again = afterFailure(s, later)
    expect(again.fails).toBe(1)
    expect(again.rounds).toBe(0)
    expect(lockRemaining(again, later)).toBe(0)
  })

  it('el texto de espera es corto y claro', () => {
    expect(waitText(45_000)).toBe('45 s')
    expect(waitText(60_000)).toBe('1 min')
    expect(waitText(61_000)).toBe('2 min')
  })
})

describe('memoria del freno', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('recarga la página y el bloqueo sigue ahí', () => {
    saveExitLock(fail(FRESH, MAX_FAILS))
    const back = loadExitLock()
    expect(back.rounds).toBe(1)
    expect(back.lockedUntil).toBeGreaterThan(0)
  })

  it('un acierto (estado limpio) borra lo guardado', () => {
    saveExitLock(fail(FRESH, 2))
    saveExitLock(FRESH)
    expect(loadExitLock()).toEqual(FRESH)
  })

  it('datos dañados no rompen nada', () => {
    store.set('nexotime.exitLock', '{"fails":"x","lockedUntil":-5}')
    expect(loadExitLock()).toEqual(FRESH)
    store.set('nexotime.exitLock', 'no es json')
    expect(loadExitLock()).toEqual(FRESH)
  })
})
