import { canRegisterPunch } from '@/lib/attendance'
import type { AttendanceSettings, Punch, PunchType } from '@/types'

/** What kind of "no" this is, so the kiosk can show it with the right colour and icon. */
export type BlockTone = 'done' | 'wait' | 'warn' | 'error'

export interface BlockInfo {
  /** Short headline, big on screen. */
  title: string
  tone: BlockTone
}

/**
 * Turns the refusal message of `canRegisterPunch` / `registerPunch` into a headline and a tone.
 * A repeated punch is not an error (the person already did the right thing), so it is not red.
 */
export function describeBlock(message: string): BlockInfo {
  const m = message.trim()
  if (/^Ya registraste/i.test(m)) return { title: 'Ya está registrado', tone: 'done' }
  if (/^Acabas de registrar/i.test(m)) return { title: 'Espera un momento', tone: 'wait' }
  if (/^(Primero registra|No puedes|Estás en comida|La salida requiere|El regreso de comida requiere)/i.test(m)) {
    return { title: 'Todavía no se puede', tone: 'warn' }
  }
  return { title: 'No se pudo registrar', tone: 'error' }
}

const ORDER: PunchType[] = ['entry', 'lunch_out', 'lunch_in', 'exit']

/**
 * The movements this person can register right now, in day order. Used to tell someone who tried a
 * movement that is not allowed what they can do instead.
 */
export function allowedPunchTypes(
  punches: Punch[],
  settings: Pick<AttendanceSettings, 'allowMultipleEntries' | 'trackLunch'>,
  gap?: { minutes: number; now: string },
): PunchType[] {
  return ORDER.filter((t) => (settings.trackLunch || (t !== 'lunch_out' && t !== 'lunch_in')) && canRegisterPunch(punches, t, settings, gap) === null)
}
