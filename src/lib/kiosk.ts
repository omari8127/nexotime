import type { AttendanceSettings, FaceStrictness } from '@/types'

export interface ResolvedKioskSettings {
  autoRegister: boolean
  autoRegisterSeconds: number
  faceStrictness: FaceStrictness
  /** Explicit distance limit, or null to use the strictness level. */
  faceThreshold: number | null
  minGapMinutes: number
  /** Code that unlocks leaving the reloj checador back to the admin panel. */
  exitPin: string
}

export const KIOSK_DEFAULTS: ResolvedKioskSettings = {
  autoRegister: true,
  autoRegisterSeconds: 5,
  faceStrictness: 'balanced',
  faceThreshold: null,
  minGapMinutes: 2,
  // Sólo se usa mientras la empresa no fija el suyo propio en Configuración → Reloj checador.
  exitPin: '1234',
}

export function resolveKiosk(settings: AttendanceSettings | undefined): ResolvedKioskSettings {
  const k = settings?.kiosk ?? {}
  return {
    autoRegister: k.autoRegister ?? KIOSK_DEFAULTS.autoRegister,
    autoRegisterSeconds: Math.min(10, Math.max(1, k.autoRegisterSeconds ?? KIOSK_DEFAULTS.autoRegisterSeconds)),
    faceStrictness: k.faceStrictness ?? KIOSK_DEFAULTS.faceStrictness,
    faceThreshold: typeof k.faceThreshold === 'number' ? Math.min(0.75, Math.max(0.35, k.faceThreshold)) : null,
    minGapMinutes: Math.min(30, Math.max(0, k.minGapMinutes ?? KIOSK_DEFAULTS.minGapMinutes)),
    exitPin: /^\d{4,8}$/.test(k.exitPin ?? '') ? (k.exitPin as string) : KIOSK_DEFAULTS.exitPin,
  }
}
