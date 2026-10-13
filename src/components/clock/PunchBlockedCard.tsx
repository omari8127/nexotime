import { motion } from 'framer-motion'
import { CheckCheck, Clock3, Hand, OctagonAlert, type LucideIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { PUNCH_TYPE_LABEL } from '@/lib/attendance'
import { describeBlock, type BlockTone } from '@/lib/kioskFeedback'
import { formatTime12 } from '@/lib/utils'
import type { Employee, Punch, PunchType } from '@/types'

const TONE: Record<
  BlockTone,
  { Icon: LucideIcon; band: string; ring: string; iconBg: string; label: string; bar: string }
> = {
  done: {
    Icon: CheckCheck,
    band: 'from-sky-50 to-white',
    ring: 'ring-sky-100',
    iconBg: 'bg-sky-500 shadow-sky-500/30',
    label: 'text-sky-700',
    bar: 'bg-sky-500/70',
  },
  wait: {
    Icon: Clock3,
    band: 'from-amber-50 to-white',
    ring: 'ring-amber-100',
    iconBg: 'bg-amber-500 shadow-amber-500/30',
    label: 'text-amber-700',
    bar: 'bg-amber-500/70',
  },
  warn: {
    Icon: Hand,
    band: 'from-amber-50 to-white',
    ring: 'ring-amber-100',
    iconBg: 'bg-amber-500 shadow-amber-500/30',
    label: 'text-amber-700',
    bar: 'bg-amber-500/70',
  },
  error: {
    Icon: OctagonAlert,
    band: 'from-rose-50 to-white',
    ring: 'ring-rose-100',
    iconBg: 'bg-rose-500 shadow-rose-500/30',
    label: 'text-rose-700',
    bar: 'bg-rose-500/70',
  },
}

const DAY: PunchType[] = ['entry', 'lunch_out', 'lunch_in', 'exit']

/**
 * Full-card answer for "that cannot be registered right now": a big icon and headline, what they
 * already did today, and the movements they CAN do instead. It replaces a small red toast in a
 * corner that nobody saw, and is not red unless something really went wrong.
 */
export function PunchBlockedCard({
  employee,
  message,
  punches,
  trackLunch,
  allowed,
  onChoose,
  onClose,
  closeAfterMs,
}: {
  employee: Employee
  /** The refusal message (already in plain Spanish). */
  message: string
  punches: Punch[]
  trackLunch: boolean
  /** Movements that can be registered now. */
  allowed: PunchType[]
  onChoose: (type: PunchType) => void
  onClose: () => void
  closeAfterMs: number
}) {
  const info = describeBlock(message)
  const tone = TONE[info.tone]
  const Icon = tone.Icon
  const slots = DAY.filter((t) => trackLunch || (t !== 'lunch_out' && t !== 'lunch_in'))

  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl"
      role="alert"
    >
      <div className={`relative bg-gradient-to-b ${tone.band} px-7 pb-6 pt-9 text-center`}>
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg ring-8 ${tone.iconBg} ${tone.ring}`}
        >
          <Icon className="h-12 w-12" strokeWidth={2.2} />
        </motion.span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{info.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-lg leading-snug text-slate-600 md:text-xl">{message}</p>
      </div>

      <div className="space-y-5 border-t border-slate-100 px-7 pb-7 pt-6">
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <Avatar name={employee.fullName} size="xl" className="h-14 w-14 text-base ring-4 ring-white shadow-sm" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-900">{employee.fullName}</p>
            <p className="truncate text-sm text-slate-500">
              {employee.employeeNumber} · {employee.position}
            </p>
          </div>
        </div>

        {/* What they already did today */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Tu día de hoy</p>
          <ul className={`grid gap-2 ${slots.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
            {slots.map((t) => {
              const p = punches.find((x) => x.type === t)
              return (
                <li
                  key={t}
                  className={`rounded-xl border px-3 py-2.5 text-center ${
                    p ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className={`text-xs font-medium ${p ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {PUNCH_TYPE_LABEL[t]}
                  </p>
                  <p className={`mt-0.5 whitespace-nowrap font-mono text-sm font-bold tabular-nums md:text-base ${p ? 'text-slate-900' : 'text-slate-300'}`}>
                    {p ? formatTime12(p.time) : '—'}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>

        {allowed.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Ahora puedes registrar:</p>
            <div className="grid gap-2.5">
              {allowed.map((t) => (
                <Button key={t} size="xl" variant="success" className="w-full text-lg" onClick={() => onChoose(t)}>
                  {PUNCH_TYPE_LABEL[t]}
                </Button>
              ))}
            </div>
          </div>
        ) : info.tone === 'wait' ? null : (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-center text-base font-medium text-emerald-800">
            Ya no tienes más movimientos por registrar hoy.
          </p>
        )}

        <Button size="xl" variant="secondary" className="w-full text-lg" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="h-1.5 bg-slate-100">
        <motion.div
          className={`h-full origin-left ${tone.bar}`}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: closeAfterMs / 1000, ease: 'linear' }}
        />
      </div>
    </motion.div>
  )
}
