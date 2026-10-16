/**
 * Brake for guessing the reloj's exit code. The code is 4 to 8 digits typed on an on-screen keypad that
 * anyone standing at the tablet can reach, so 10 000 tries at 4 digits are a matter of minutes. Five wrong
 * codes in a row lock the keypad for a minute; each lock after that lasts twice as long, up to 15 minutes.
 * A correct code, or half an hour without trying, starts again from zero.
 *
 * It lives in this browser (localStorage): enough to stop someone pressing keys, not a defence against a
 * person who wipes the site's data — that is why the real protection is the dedicated clock account.
 */
export interface ExitLockState {
  /** Wrong codes since the last lock. */
  fails: number
  /** Locks so far in this streak (each lasts twice as long as the one before). */
  rounds: number
  /** Epoch ms until which the keypad is locked (0 = not locked). */
  lockedUntil: number
  /** Epoch ms of the last wrong code. */
  at: number
}

export const MAX_FAILS = 5
export const BASE_LOCK_MS = 60_000
export const MAX_LOCK_MS = 15 * 60_000
export const FORGET_AFTER_MS = 30 * 60_000

const KEY = 'nexotime.exitLock'
export const FRESH: ExitLockState = { fails: 0, rounds: 0, lockedUntil: 0, at: 0 }

/** Milliseconds left on the lock (0 when the keypad can be used). */
export function lockRemaining(state: ExitLockState, now = Date.now()): number {
  return Math.max(0, state.lockedUntil - now)
}

export function afterFailure(state: ExitLockState, now = Date.now()): ExitLockState {
  // A long pause forgets the streak.
  const base = state.at > 0 && now - state.at > FORGET_AFTER_MS && state.lockedUntil <= now ? FRESH : state
  const fails = base.fails + 1
  if (fails < MAX_FAILS) return { ...base, fails, at: now }
  const duration = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** base.rounds)
  return { fails: 0, rounds: base.rounds + 1, lockedUntil: now + duration, at: now }
}

export function loadExitLock(): ExitLockState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ExitLockState> | null
    if (!raw) return FRESH
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
    return { fails: n(raw.fails), rounds: n(raw.rounds), lockedUntil: n(raw.lockedUntil), at: n(raw.at) }
  } catch {
    return FRESH
  }
}

export function saveExitLock(state: ExitLockState) {
  try {
    if (state === FRESH || (state.fails === 0 && state.rounds === 0 && state.lockedUntil === 0)) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode: it just will not be remembered across reloads */
  }
}

/** "1 min", "45 s": how long to wait, for the message on the keypad. */
export function waitText(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`
}
