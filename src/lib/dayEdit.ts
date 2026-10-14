/**
 * "Editar día completo": an administrator sets, changes or removes any of the four movements of one
 * day in a single step. Pure — the store persists the result and writes the audit entry.
 */
import { PUNCH_TYPE_LABEL, validatePunchSequence } from '@/lib/attendance'
import { formatTime12 } from '@/lib/utils'
import type { AuditChange, Punch, PunchType } from '@/types'

export const PUNCH_ORDER: PunchType[] = ['entry', 'lunch_out', 'lunch_in', 'exit']

/** The hour wanted for each movement ("HH:MM"), or null for "this movement does not exist". */
export type DayTimes = Record<PunchType, string | null>

export function dayTimesOf(punches: Punch[]): DayTimes {
  const time = (type: PunchType) => punches.find((p) => p.type === type)?.time ?? null
  return { entry: time('entry'), lunch_out: time('lunch_out'), lunch_in: time('lunch_in'), exit: time('exit') }
}

export interface DayEditResult {
  punches: Punch[]
  added: PunchType[]
  edited: PunchType[]
  removed: PunchType[]
  changes: AuditChange[]
}

export function applyDayEdit(existing: Punch[], times: DayTimes): DayEditResult | { error: string } {
  const result: DayEditResult = { punches: [], added: [], edited: [], removed: [], changes: [] }
  for (const type of PUNCH_ORDER) {
    const current = existing.find((p) => p.type === type)
    const wanted = times[type]
    if (wanted && !/^([01]\d|2[0-3]):[0-5]\d$/.test(wanted)) {
      return { error: `La hora de «${PUNCH_TYPE_LABEL[type]}» no es válida.` }
    }
    if (!wanted) {
      if (current) {
        result.removed.push(type)
        result.changes.push({ field: PUNCH_TYPE_LABEL[type], before: formatTime12(current.time), after: 'Eliminado' })
      }
    } else if (!current) {
      result.added.push(type)
      result.punches.push({ type, time: wanted, method: 'manual', edited: true })
      result.changes.push({ field: PUNCH_TYPE_LABEL[type], before: 'Sin registro', after: formatTime12(wanted) })
    } else if (current.time !== wanted) {
      result.edited.push(type)
      // The photo taken with the original movement stays attached: it is evidence of that moment.
      result.punches.push({ type, time: wanted, method: 'manual', edited: true, photoEvidence: current.photoEvidence })
      result.changes.push({ field: PUNCH_TYPE_LABEL[type], before: formatTime12(current.time), after: formatTime12(wanted) })
    } else {
      result.punches.push(current)
    }
  }
  result.punches.sort((a, b) => a.time.localeCompare(b.time))
  const invalid = validatePunchSequence(result.punches)
  return invalid ? { error: invalid } : result
}
