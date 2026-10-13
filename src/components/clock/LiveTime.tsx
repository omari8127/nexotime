import { useLiveClock } from '@/hooks/useLiveClock'

/**
 * Digits that tick on their own. The reloj checador page itself does not re-render every second (that
 * made the camera steps stutter on weak tablets); only these small pieces do.
 */
export function LiveTime({ format }: { format: (now: Date) => string }) {
  const now = useLiveClock()
  return <>{format(now)}</>
}
