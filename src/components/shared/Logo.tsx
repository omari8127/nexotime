import { cn } from '@/lib/utils'

/**
 * Nexotime mark: a geometric "N" on a solid tile. The dot at the end of the
 * last stroke is the punch — the moment a check-in is recorded. Flat colour,
 * no gradients, so it stays crisp at 16 px and in a single-colour print.
 */
export function NexotimeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#1d4fd8" />
      <path
        d="M12.5 28.5V11.5L27.5 28.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M27.5 28.5V17" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="27.5" cy="11.5" r="3.4" fill="#7dd3fc" />
    </svg>
  )
}

export function NexotimeLogo({
  collapsed,
  tone = 'light',
  size = 'md',
}: {
  collapsed?: boolean
  tone?: 'light' | 'dark'
  size?: 'md' | 'lg'
}) {
  return (
    <div className="flex items-center gap-3">
      <NexotimeMark className={size === 'lg' ? 'h-10 w-10' : undefined} />
      {!collapsed && (
        <span
          className={cn(
            'font-bold leading-none tracking-[-0.03em]',
            size === 'lg' ? 'text-[24px]' : 'text-[20px]',
            tone === 'light' ? 'text-white' : 'text-foreground',
          )}
        >
          Nexotime
        </span>
      )}
    </div>
  )
}
