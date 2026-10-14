import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PANEL_UNLOCK_MS,
  getDeviceUse,
  isPanelUnlocked,
  lockPanel,
  mustStayAtClock,
  setDeviceUse,
  touchPanel,
  unlockPanel,
} from '@/lib/deviceUse'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('equipo como reloj checador', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sin elegir, el equipo se trata como una computadora normal', () => {
    expect(getDeviceUse()).toBeNull()
    expect(mustStayAtClock(getDeviceUse(), false)).toBe(false)
  })

  it('un equipo reloj no entra al panel sin el código, y el panel se cierra solo', () => {
    setDeviceUse('kiosk')
    expect(getDeviceUse()).toBe('kiosk')
    expect(mustStayAtClock('kiosk', isPanelUnlocked())).toBe(true)

    const t0 = 1_000_000
    unlockPanel(t0)
    expect(isPanelUnlocked(t0 + 60_000)).toBe(true)
    expect(mustStayAtClock('kiosk', isPanelUnlocked(t0 + 60_000))).toBe(false)
    // Pasado el plazo sin tocarlo, vuelve al reloj.
    expect(isPanelUnlocked(t0 + PANEL_UNLOCK_MS + 1)).toBe(false)
    // Tocarlo lo mantiene abierto.
    touchPanel(t0 + PANEL_UNLOCK_MS - 1_000)
    expect(isPanelUnlocked(t0 + PANEL_UNLOCK_MS + 5_000)).toBe(true)
  })

  it('al volver al reloj el panel se cierra de inmediato', () => {
    setDeviceUse('kiosk')
    unlockPanel()
    expect(isPanelUnlocked()).toBe(true)
    lockPanel()
    expect(isPanelUnlocked()).toBe(false)
  })

  it('quitar la marca de reloj deja el equipo sin bloqueo y recuerda la elección', () => {
    setDeviceUse('kiosk')
    setDeviceUse('panel')
    expect(getDeviceUse()).toBe('panel')
    expect(mustStayAtClock('panel', false)).toBe(false)
    setDeviceUse(null)
    expect(getDeviceUse()).toBeNull()
  })

  it('sin almacenamiento disponible nunca lanza error', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    })
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(getDeviceUse()).toBeNull()
    expect(() => setDeviceUse('kiosk')).not.toThrow()
    expect(isPanelUnlocked()).toBe(false)
    expect(() => unlockPanel()).not.toThrow()
    expect(() => lockPanel()).not.toThrow()
  })
})
