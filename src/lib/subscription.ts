import type { Subscription } from '@/types'

/**
 * Whether the account may keep using the program, derived straight from the
 * company row already loaded (live-fetched or, offline, the last cached
 * snapshot — see services/live/snapshot.ts). No token, no signature: Postgres
 * (with the guard trigger in 004_suscripciones.sql) is the source of truth,
 * so there is nothing extra to verify client-side.
 *
 * `trialEndsAt` / `currentPeriodEnd` double as the offline tolerance window —
 * a tablet that goes offline mid-trial or mid-period keeps working normally
 * right up to that date, online or not, same as the license system's
 * signed-token tolerance did.
 */

/** Extra days a past-due account is still let in before it is treated as blocked. */
export const PAST_DUE_GRACE_DAYS = 5

export type BlockReason = 'trial_expired' | 'past_due_expired' | 'canceled'

export interface SubscriptionVerdict {
  allowed: boolean
  reason: BlockReason | null
}

export function evaluateSubscription(sub: Subscription, now: number = Date.now()): SubscriptionVerdict {
  if (sub.status === 'canceled') return { allowed: false, reason: 'canceled' }

  if (sub.status === 'trialing') {
    const ok = now <= Date.parse(sub.trialEndsAt)
    return { allowed: ok, reason: ok ? null : 'trial_expired' }
  }

  if (sub.status === 'active') return { allowed: true, reason: null }

  // past_due: current_period_end is already behind (that is why it is past due) —
  // give it PAST_DUE_GRACE_DAYS past that date before blocking.
  const periodEnd = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : now
  const deadline = periodEnd + PAST_DUE_GRACE_DAYS * 24 * 3600_000
  const ok = now <= deadline
  return { allowed: ok, reason: ok ? null : 'past_due_expired' }
}
