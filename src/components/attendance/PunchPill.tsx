import { PUNCH_STYLE } from '@/lib/punchStyle'
import { cn, formatTime12 } from '@/lib/utils'
import type { PunchType } from '@/types'

const PILL = 'inline-flex h-6 min-w-[4.9rem] whitespace-nowrap items-center justify-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums'

/** The hour of one movement as a coloured pill; a grey "--:--" when it was not registered. */
export function PunchPill({
  type,
  time,
  edited,
  className,
}: {
  type: PunchType
  time?: string | null
  /** Set by an administrator instead of the clock: shown with a small mark. */
  edited?: boolean
  className?: string
}) {
  if (!time) {
    return <span className={cn(PILL, 'bg-muted font-medium text-muted-foreground/70', className)}>--:--</span>
  }
  return (
    <span
      className={cn(PILL, PUNCH_STYLE[type].solid, className)}
      title={edited ? `${PUNCH_STYLE[type].label} · ajuste manual` : PUNCH_STYLE[type].label}
    >
      {formatTime12(time).replace(/\.$/, '')}
      {edited ? <span aria-label="ajuste manual">*</span> : null}
    </span>
  )
}

/** Icon + name of a movement in its colour (table cells, lists). */
export function PunchTypeTag({ type, solid, className }: { type: PunchType; solid?: boolean; className?: string }) {
  const style = PUNCH_STYLE[type]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        solid ? style.solid : style.soft,
        className,
      )}
    >
      <style.Icon className="h-3.5 w-3.5" />
      {style.label}
    </span>
  )
}
