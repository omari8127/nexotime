import type { AttendanceSettings, FaceStrictness } from '@/types'

export interface ResolvedKioskSettings {
  autoRegister: boolean
  autoRegisterSeconds: number
  faceStrictness: FaceStrictness
  /** Explicit distance limit, or null to use the strictness level. */
  faceThreshold: number | null
  /** Digital zoom of the face camera, 1 (none) to 2.5. */
  faceZoom: number
  minGapMinutes: number
  /** Code that unlocks leaving the reloj checador back to the admin panel. */
  exitPin: string
}

export const KIOSK_DEFAULTS: ResolvedKioskSettings = {
  autoRegister: true,
  autoRegisterSeconds: 5,
  faceStrictness: 'balanced',
  faceThreshold: null,
  faceZoom: 1,
  minGapMinutes: 2,
  // Sólo se usa mientras la empresa no fija el suyo propio en Configuración → Reloj checador.
  exitPin: '1234',
}

/**
 * The branch the kiosk is for: the first candidate that is a real branch of this company
 * (what was picked on the kiosk, the branch being worked on in the panel, the one this device
 * used last time), else the company's first branch.
 */
export function pickKioskBranch(branches: { id: string }[], ...candidates: (string | null | undefined)[]): string {
  return candidates.find((id) => id && branches.some((b) => b.id === id)) ?? branches[0]?.id ?? ''
}

/**
 * The device record of THIS branch. Never another branch's: its name is shown on the kiosk and its
 * id is stored on every punch, so borrowing one from a different branch would mislabel both.
 */
export function kioskDevice<T extends { branchId: string; status: string }>(devices: T[], branchId: string): T | undefined {
  const mine = devices.filter((d) => d.branchId === branchId)
  return mine.find((d) => d.status === 'online') ?? mine[0]
}

/**
 * Everyone who may clock in at this kiosk by number + PIN: the active staff of the whole company
 * (like face and QR/barcode already work at any branch), with this branch's own people first so a
 * number that exists in two branches resolves to the local one.
 */
export function punchableEmployees<T extends { branchId: string; status: string }>(employees: T[], branchId: string): T[] {
  const active = employees.filter((e) => e.status === 'active')
  return [...active.filter((e) => e.branchId === branchId), ...active.filter((e) => e.branchId !== branchId)]
}

export function resolveKiosk(settings: AttendanceSettings | undefined): ResolvedKioskSettings {
  const k = settings?.kiosk ?? {}
  return {
    autoRegister: k.autoRegister ?? KIOSK_DEFAULTS.autoRegister,
    autoRegisterSeconds: Math.min(10, Math.max(1, k.autoRegisterSeconds ?? KIOSK_DEFAULTS.autoRegisterSeconds)),
    faceStrictness: k.faceStrictness ?? KIOSK_DEFAULTS.faceStrictness,
    faceThreshold: typeof k.faceThreshold === 'number' ? Math.min(0.75, Math.max(0.35, k.faceThreshold)) : null,
    faceZoom: typeof k.faceZoom === 'number' ? Math.min(2.5, Math.max(1, k.faceZoom)) : KIOSK_DEFAULTS.faceZoom,
    minGapMinutes: Math.min(30, Math.max(0, k.minGapMinutes ?? KIOSK_DEFAULTS.minGapMinutes)),
    exitPin: /^\d{4,8}$/.test(k.exitPin ?? '') ? (k.exitPin as string) : KIOSK_DEFAULTS.exitPin,
  }
}
