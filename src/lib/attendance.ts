/**
 * Attendance math. Pure functions, no framework dependencies — this is the
 * layer that would move to the backend / an edge function unchanged.
 */
import type {
  AttendanceRecord,
  AttendanceSettings,
  AttendanceStatus,
  ClockTime,
  Punch,
  Schedule,
  ScheduleDay,
  Weekday,
} from '@/types'
import { formatTime12, toMinutes } from '@/lib/utils'
import { DEMO_TODAY } from '@/data/catalog'

export const WEEKDAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
}

export function weekdayFromISO(iso: string): Weekday {
  const jsDay = new Date(`${iso}T00:00:00`).getDay() // 0 = Sunday
  return WEEKDAY_ORDER[(jsDay + 6) % 7]
}

function punch(punches: Punch[], type: Punch['type']): Punch | undefined {
  return punches.find((p) => p.type === type)
}

/**
 * Worked minutes = (exit - entry) - lunch break.
 * The lunch break is only subtracted when both lunch punches exist.
 */
export function calculateWorkedHours(punches: Punch[]): number {
  const entry = punch(punches, 'entry')
  const exit = punch(punches, 'exit')
  if (!entry || !exit) return 0

  let worked = toMinutes(exit.time) - toMinutes(entry.time)

  const lunchOut = punch(punches, 'lunch_out')
  const lunchIn = punch(punches, 'lunch_in')
  if (lunchOut && lunchIn) {
    worked -= toMinutes(lunchIn.time) - toMinutes(lunchOut.time)
  }

  return Math.max(0, worked)
}

/** Scheduled minutes for a single day (entry→exit minus scheduled lunch). */
export function scheduledMinutesForDay(day: ScheduleDay | undefined): number {
  if (!day || !day.enabled) return 0
  let total = toMinutes(day.exit) - toMinutes(day.entry)
  if (day.lunchOut && day.lunchIn) {
    total -= toMinutes(day.lunchIn) - toMinutes(day.lunchOut)
  }
  return Math.max(0, total)
}

export function scheduleDayFor(schedule: Schedule, weekday: Weekday): ScheduleDay | undefined {
  return schedule.days.find((d) => d.weekday === weekday)
}

/**
 * Late minutes relative to the scheduled entry, after applying the tolerance.
 * Returns 0 when on time or early.
 */
export function calculateLateMinutes(
  actualEntry: ClockTime | undefined,
  scheduledEntry: ClockTime | undefined,
  toleranceMinutes: number,
): number {
  if (!actualEntry || !scheduledEntry) return 0
  const diff = toMinutes(actualEntry) - toMinutes(scheduledEntry)
  if (diff <= toleranceMinutes) return 0
  return diff
}

/** Minutes worked beyond the scheduled day, after the overtime threshold. */
export function calculateOvertime(
  workedMinutes: number,
  scheduledMinutes: number,
  thresholdMinutes: number,
): number {
  const extra = workedMinutes - scheduledMinutes
  if (extra <= thresholdMinutes) return 0
  return extra
}

/** How many scheduled minutes were not covered by worked time. */
export function calculateMissingHours(workedMinutes: number, scheduledMinutes: number): number {
  return Math.max(0, scheduledMinutes - workedMinutes)
}

export interface WeeklyTotals {
  targetMinutes: number
  workedMinutes: number
  scheduledMinutes: number
  missingMinutes: number
  overtimeMinutes: number
  /** Horas ordinarias: tiempo trabajado dentro de la jornada regular. */
  ordinaryMinutes: number
  /** Primeras 9 h de extra a la semana — Art. 66/68 LFT, pagan doble. */
  overtimeDoubleMinutes: number
  /** Extra por encima de 9 h a la semana — Art. 68 LFT, paga triple. */
  overtimeTripleMinutes: number
  /** true si el excedente de horas extra amerita revisión de cumplimiento. */
  exceedsLegalLimit: boolean
  lateCount: number
  absenceCount: number
}

/**
 * Límites de la Ley Federal del Trabajo para tiempo extraordinario:
 *  - Art. 66: máx. 3 horas extra por día, 3 veces por semana (9 h/semana).
 *  - Art. 68: las primeras 9 h semanales se pagan al 200% ("dobles"); el
 *    excedente se paga al 300% ("triples").
 *  - Reforma de jornada 40 h: tope de referencia de 16 h extra/semana para
 *    marcar una alerta de revisión (no sustituye asesoría legal).
 */
export const LFT_WEEKLY_DOUBLE_LIMIT_MINUTES = 9 * 60
export const LFT_WEEKLY_REVIEW_LIMIT_MINUTES = 16 * 60

/** Divide las horas extra semanales en tramos "dobles" y "triples" (Art. 66-68 LFT). */
export function splitOvertimeLFT(weeklyOvertimeMinutes: number): {
  double: number
  triple: number
} {
  const double = Math.min(weeklyOvertimeMinutes, LFT_WEEKLY_DOUBLE_LIMIT_MINUTES)
  const triple = Math.max(0, weeklyOvertimeMinutes - LFT_WEEKLY_DOUBLE_LIMIT_MINUTES)
  return { double, triple }
}

export function calculateWeeklyHours(
  records: AttendanceRecord[],
  targetHours: number,
): WeeklyTotals {
  const totals: WeeklyTotals = {
    targetMinutes: Math.round(targetHours * 60),
    workedMinutes: 0,
    scheduledMinutes: 0,
    missingMinutes: 0,
    overtimeMinutes: 0,
    ordinaryMinutes: 0,
    overtimeDoubleMinutes: 0,
    overtimeTripleMinutes: 0,
    exceedsLegalLimit: false,
    lateCount: 0,
    absenceCount: 0,
  }

  for (const r of records) {
    totals.workedMinutes += r.workedMinutes
    totals.scheduledMinutes += r.scheduledMinutes
    totals.overtimeMinutes += r.overtimeMinutes
    if (r.status === 'late') totals.lateCount += 1
    if (r.status === 'absent') totals.absenceCount += 1
  }

  totals.missingMinutes = Math.max(0, totals.targetMinutes - totals.workedMinutes)
  totals.ordinaryMinutes = Math.max(0, totals.workedMinutes - totals.overtimeMinutes)
  const split = splitOvertimeLFT(totals.overtimeMinutes)
  totals.overtimeDoubleMinutes = split.double
  totals.overtimeTripleMinutes = split.triple
  totals.exceedsLegalLimit = totals.overtimeMinutes > LFT_WEEKLY_REVIEW_LIMIT_MINUTES
  return totals
}

/**
 * Classify a day. Order of checks matters:
 *  - a rest day is a rest day
 *  - no entry at all past the absence threshold → absent
 *  - entry but missing a later punch → incomplete
 *  - late arrival → late
 *  - meaningful overtime → overtime
 *  - otherwise → present
 */
export function getAttendanceStatus(
  punches: Punch[],
  schedule: ScheduleDay | undefined,
  settings: AttendanceSettings,
  metrics: { lateMinutes: number; overtimeMinutes: number },
  options: { inProgress?: boolean } = {},
): AttendanceStatus {
  if (!schedule || !schedule.enabled) return 'rest'

  const entry = punch(punches, 'entry')
  const exit = punch(punches, 'exit')

  if (!entry) return options.inProgress ? 'absent' : 'absent'

  // While the working day is still open (today, before the employee has
  // clocked out) a missing exit is expected, not an anomaly.
  if (!exit) {
    if (options.inProgress) return metrics.lateMinutes > 0 ? 'late' : 'present'
    return 'incomplete'
  }

  if (settings.trackLunch) {
    const lunchOut = punch(punches, 'lunch_out')
    const lunchIn = punch(punches, 'lunch_in')
    if (lunchOut && !lunchIn && !options.inProgress) return 'incomplete'
    if (!lunchOut && lunchIn) return 'incomplete'
  }

  if (metrics.lateMinutes > 0) return 'late'
  if (metrics.overtimeMinutes > 0) return 'overtime'
  return 'present'
}

/**
 * Recompute every derived field on a record from its punches + schedule.
 * `todayISO` is whichever date the caller currently treats as "today" (the
 * fixed demo day, or the real calendar date in live mode) — it only affects
 * whether a still-open day without an exit reads as "in progress" rather than
 * "incomplete". Defaults to the demo day so the mock generator needs no change.
 */
export function recomputeRecord(
  record: AttendanceRecord,
  schedule: Schedule,
  settings: AttendanceSettings,
  todayISO: string = DEMO_TODAY,
): AttendanceRecord {
  const weekday = weekdayFromISO(record.date)
  const day = scheduleDayFor(schedule, weekday)

  const workedMinutes = calculateWorkedHours(record.punches)
  const scheduledMinutes = scheduledMinutesForDay(day)
  const entry = record.punches.find((p) => p.type === 'entry')
  const lateMinutes = calculateLateMinutes(
    entry?.time,
    day?.entry,
    settings.entryToleranceMinutes,
  )
  const overtimeMinutes = calculateOvertime(
    workedMinutes,
    scheduledMinutes,
    settings.overtimeThresholdMinutes,
  )
  const missingMinutes = calculateMissingHours(workedMinutes, scheduledMinutes)
  const status = getAttendanceStatus(
    record.punches,
    day,
    settings,
    { lateMinutes, overtimeMinutes },
    { inProgress: record.date === todayISO },
  )

  return {
    ...record,
    workedMinutes,
    scheduledMinutes,
    lateMinutes,
    overtimeMinutes,
    missingMinutes,
    status,
  }
}

/* -------------------------------------------------------------------------- */
/*  Clock: what should this employee punch next?                               */
/* -------------------------------------------------------------------------- */

export type NextPunch = {
  type: Punch['type']
  label: string
}

const PUNCH_LABEL: Record<Punch['type'], string> = {
  entry: 'Registrar entrada',
  lunch_out: 'Registrar salida a comida',
  lunch_in: 'Registrar regreso de comida',
  exit: 'Registrar salida',
}

export const PUNCH_TYPE_LABEL: Record<Punch['type'], string> = {
  entry: 'Entrada',
  lunch_out: 'Salida a comida',
  lunch_in: 'Regreso de comida',
  exit: 'Salida',
}

/**
 * Given today's punches, decide the next logical punch. The clock UI uses this
 * to auto-detect the punch type instead of asking the employee.
 */
export function detectNextPunch(punches: Punch[], trackLunch: boolean): NextPunch | null {
  const has = (t: Punch['type']) => punches.some((p) => p.type === t)

  if (!has('entry')) return { type: 'entry', label: PUNCH_LABEL.entry }

  if (trackLunch) {
    if (!has('lunch_out') && !has('exit')) {
      return { type: 'lunch_out', label: PUNCH_LABEL.lunch_out }
    }
    if (has('lunch_out') && !has('lunch_in')) {
      return { type: 'lunch_in', label: PUNCH_LABEL.lunch_in }
    }
  }

  if (!has('exit')) return { type: 'exit', label: PUNCH_LABEL.exit }

  return null // day complete
}

/* -------------------------------------------------------------------------- */
/*  Validation & derived flags                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Checks that a day's punches make sense together:
 * entrada < salida a comida < regreso < salida, and no comida/salida without
 * their predecessor. Returns a human-readable Spanish message, or null if OK.
 */
export function validatePunchSequence(punches: Punch[]): string | null {
  const t = (type: Punch['type']) => {
    const p = punches.find((x) => x.type === type)
    return p ? toMinutes(p.time) : undefined
  }
  const entry = t('entry')
  const lunchOut = t('lunch_out')
  const lunchIn = t('lunch_in')
  const exit = t('exit')

  if (lunchOut !== undefined && entry === undefined) return 'La salida a comida requiere una entrada previa.'
  if (lunchIn !== undefined && lunchOut === undefined) return 'El regreso de comida requiere haber iniciado la comida.'
  if (exit !== undefined && entry === undefined) return 'La salida requiere una entrada previa.'

  if (entry !== undefined && lunchOut !== undefined && lunchOut < entry)
    return 'La salida a comida no puede ser antes de la entrada.'
  if (lunchOut !== undefined && lunchIn !== undefined && lunchIn < lunchOut)
    return 'El regreso de comida no puede ser antes de la salida a comida.'
  if (entry !== undefined && exit !== undefined && exit < entry)
    return 'La salida no puede ser antes de la entrada.'
  if (lunchIn !== undefined && exit !== undefined && exit < lunchIn)
    return 'La salida no puede ser antes del regreso de comida.'
  if (lunchOut !== undefined && lunchIn === undefined && exit !== undefined && exit < lunchOut)
    return 'La salida no puede ser antes de la salida a comida.'
  return null
}

/**
 * Whether `type` may be registered next given today's punches. Used by the
 * clock and by "Mi asistencia" so nobody can create impossible sequences
 * (entrada→entrada, regreso sin comida, salida sin entrada…).
 */
export function canRegisterPunch(
  punches: Punch[],
  type: Punch['type'],
  settings: Pick<AttendanceSettings, 'allowMultipleEntries'>,
  /** Optional anti-double-punch rule: minutes required since the last punch. */
  gap?: { minutes: number; now: string },
): string | null {
  const find = (x: Punch['type']) => punches.find((p) => p.type === x)
  if (gap && gap.minutes > 0 && punches.length > 0) {
    const last = Math.max(...punches.map((p) => toMinutes(p.time)))
    const wait = gap.minutes - (toMinutes(gap.now) - last)
    if (wait > 0 && toMinutes(gap.now) >= last) {
      return `Acabas de registrar. Espera ${wait} ${wait === 1 ? 'minuto' : 'minutos'} para volver a checar.`
    }
  }
  const already = find(type)
  const at = already ? ` a las ${formatTime12(already.time).replace(/\.$/, '')}` : ''

  switch (type) {
    case 'entry':
      if (already && !settings.allowMultipleEntries) return `Ya registraste tu entrada hoy${at}.`
      return null
    case 'lunch_out':
      if (!find('entry')) return 'Primero registra tu entrada.'
      if (already) return `Ya registraste tu salida a comida${at}.`
      if (find('exit')) return 'Ya registraste tu salida del día.'
      return null
    case 'lunch_in':
      if (!find('lunch_out')) return 'No puedes regresar de comida sin haber salido a comer.'
      if (already) return `Ya registraste tu regreso de comida${at}.`
      return null
    case 'exit':
      if (!find('entry')) return 'No puedes registrar salida sin una entrada previa.'
      if (already) return `Ya registraste tu salida${at}.`
      if (find('lunch_out') && !find('lunch_in')) return 'Estás en comida: registra primero tu regreso.'
      return null
  }
}

/** Minutes the employee actually spent at lunch (0 if lunch is incomplete). */
export function lunchMinutes(punches: Punch[]): number {
  const out = punch(punches, 'lunch_out')
  const back = punch(punches, 'lunch_in')
  if (!out || !back) return 0
  return Math.max(0, toMinutes(back.time) - toMinutes(out.time))
}

export interface RecordFlags {
  /** Minutes the exit happened before the scheduled exit (beyond tolerance). */
  earlyLeaveMinutes: number
  /** Minutes the lunch lasted beyond the scheduled lunch (beyond tolerance). */
  lunchExcessMinutes: number
  /** Real lunch duration. */
  lunchMinutes: number
  missingEntry: boolean
  missingExit: boolean
  missingLunch: boolean
}

/**
 * Anomalies derived on the fly from a record + its schedule. These are not
 * stored, so they stay correct when the schedule or settings change.
 */
export function getRecordFlags(
  record: AttendanceRecord,
  schedule: Schedule | undefined,
  settings: AttendanceSettings,
  todayISO: string,
): RecordFlags {
  const day = schedule ? scheduleDayFor(schedule, weekdayFromISO(record.date)) : undefined
  const entry = punch(record.punches, 'entry')
  const exit = punch(record.punches, 'exit')
  const lunchOut = punch(record.punches, 'lunch_out')
  const lunchIn = punch(record.punches, 'lunch_in')
  const tolerance = settings.entryToleranceMinutes
  const worksToday = !!day?.enabled

  let earlyLeaveMinutes = 0
  if (exit && day?.enabled) {
    const diff = toMinutes(day.exit) - toMinutes(exit.time)
    if (diff > tolerance) earlyLeaveMinutes = diff
  }

  const actualLunch = lunchMinutes(record.punches)
  let lunchExcessMinutes = 0
  if (actualLunch > 0 && day?.enabled && day.lunchOut && day.lunchIn) {
    const planned = toMinutes(day.lunchIn) - toMinutes(day.lunchOut)
    const diff = actualLunch - planned
    if (diff > tolerance) lunchExcessMinutes = diff
  }

  const dayClosed = record.date < todayISO
  return {
    earlyLeaveMinutes,
    lunchExcessMinutes,
    lunchMinutes: actualLunch,
    missingEntry: worksToday && !entry && dayClosed && record.punches.length > 0,
    missingExit: worksToday && !!entry && !exit && dayClosed,
    missingLunch:
      settings.trackLunch &&
      worksToday &&
      !!day?.lunchOut &&
      !!entry &&
      !!exit &&
      !lunchOut &&
      !lunchIn,
  }
}

export type Presence = 'none' | 'working' | 'lunch' | 'done'

/** Where an employee is right now, from today's punches. */
export function presenceOf(punches: Punch[] | undefined): Presence {
  if (!punches || !punches.some((p) => p.type === 'entry')) return 'none'
  if (punches.some((p) => p.type === 'exit')) return 'done'
  const out = punches.some((p) => p.type === 'lunch_out')
  const back = punches.some((p) => p.type === 'lunch_in')
  if (out && !back) return 'lunch'
  return 'working'
}
