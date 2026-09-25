import type { AttendanceSettings, FaceStrictness } from '@/types'

export interface ResolvedKioskSettings {
  autoRegister: boolean
  autoRegisterSeconds: number
  faceRequireBlink: boolean
  faceStrictness: FaceStrictness
  /** Explicit distance limit, or null to use the strictness level. */
  faceThreshold: number | null
  faceChallenge: boolean
  minGapMinutes: number
}

export const KIOSK_DEFAULTS: ResolvedKioskSettings = {
  autoRegister: true,
  autoRegisterSeconds: 3,
  faceRequireBlink: true,
  faceStrictness: 'balanced',
  faceThreshold: null,
  faceChallenge: false,
  minGapMinutes: 2,
}

export function resolveKiosk(settings: AttendanceSettings | undefined): ResolvedKioskSettings {
  const k = settings?.kiosk ?? {}
  return {
    autoRegister: k.autoRegister ?? KIOSK_DEFAULTS.autoRegister,
    autoRegisterSeconds: Math.min(10, Math.max(1, k.autoRegisterSeconds ?? KIOSK_DEFAULTS.autoRegisterSeconds)),
    faceRequireBlink: k.faceRequireBlink ?? KIOSK_DEFAULTS.faceRequireBlink,
    faceStrictness: k.faceStrictness ?? KIOSK_DEFAULTS.faceStrictness,
    faceThreshold: typeof k.faceThreshold === 'number' ? Math.min(0.65, Math.max(0.35, k.faceThreshold)) : null,
    faceChallenge: k.faceChallenge ?? KIOSK_DEFAULTS.faceChallenge,
    minGapMinutes: Math.min(30, Math.max(0, k.minGapMinutes ?? KIOSK_DEFAULTS.minGapMinutes)),
  }
}
