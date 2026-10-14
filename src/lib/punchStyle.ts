import { LogIn, LogOut, Undo2, Utensils } from 'lucide-react'
import type { PunchType } from '@/types'

/**
 * One colour and one icon per movement, the same everywhere (panel tables, day editor, employee
 * portal), so a glance is enough: green in, amber out to lunch, blue back, red out.
 */
export const PUNCH_STYLE: Record<
  PunchType,
  { Icon: typeof LogIn; label: string; short: string; solid: string; soft: string; text: string }
> = {
  entry: {
    Icon: LogIn,
    label: 'Entrada',
    short: 'Entrada',
    solid: 'bg-emerald-600 text-white',
    soft: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  lunch_out: {
    Icon: Utensils,
    label: 'Salida a comer',
    short: 'A comer',
    solid: 'bg-amber-400 text-amber-950',
    soft: 'bg-amber-400/15 text-amber-700 dark:text-amber-300',
    text: 'text-amber-600 dark:text-amber-400',
  },
  lunch_in: {
    Icon: Undo2,
    label: 'Regreso de comer',
    short: 'Regreso',
    solid: 'bg-sky-600 text-white',
    soft: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    text: 'text-sky-600 dark:text-sky-400',
  },
  exit: {
    Icon: LogOut,
    label: 'Salida',
    short: 'Salida',
    solid: 'bg-rose-600 text-white',
    soft: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    text: 'text-rose-600 dark:text-rose-400',
  },
}

/** "3:09" — hours and minutes as a compact figure for a pill. */
export function compactDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
