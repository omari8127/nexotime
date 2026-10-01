import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, CalendarX2, CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NexotimeLogo } from '@/components/shared/Logo'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { restoreSession, signOutLive } from '@/services/live/liveApi'
import { evaluateSubscription, type BlockReason } from '@/lib/subscription'

const BLOCK: Record<BlockReason, { icon: typeof Ban; title: string; text: string }> = {
  trial_expired: {
    icon: CalendarX2,
    title: 'Tu prueba gratuita terminó',
    text: 'Los 14 días de prueba de tu empresa ya pasaron. Contacta a tu proveedor para activar un plan de pago.',
  },
  past_due_expired: {
    icon: CreditCard,
    title: 'Pago pendiente',
    text: 'Tu último pago venció y ya pasó el tiempo de gracia. Contacta a tu proveedor para regularizarlo.',
  },
  canceled: {
    icon: Ban,
    title: 'Cuenta cancelada',
    text: 'Esta cuenta fue cancelada. Contacta a tu proveedor si quieres reactivarla.',
  },
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-5">
          <NexotimeLogo tone="dark" />
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">{children}</div>
      </div>
    </div>
  )
}

function BlockedScreen({ reason }: { reason: BlockReason }) {
  const info = BLOCK[reason]
  const Icon = info.icon
  const navigate = useNavigate()
  const switchToDemo = useDataStore((s) => s.switchToDemo)
  const hydrateLive = useDataStore((s) => s.hydrateLive)
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    try {
      const bundle = await restoreSession()
      if (bundle) hydrateLive(bundle)
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await signOutLive()
    switchToDemo()
    navigate('/bienvenida')
  }

  return (
    <Shell>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Icon className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{info.title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{info.text}</p>
      <div className="mt-6 flex gap-3">
        <Button className="flex-1" onClick={() => void retry()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Ya pagué, reintentar
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => void signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </Shell>
  )
}

/**
 * Replaces LicenseGate (Fase 2 del cambio de licencia por dispositivo a
 * suscripción por cuenta). Demo mode is never gated. In live mode, the
 * verdict comes straight from the company row already loaded by AuthBoot —
 * no separate network call, no signed token: Postgres (protected by the
 * guard trigger in 004_suscripciones.sql) is the source of truth, live or
 * from the offline snapshot.
 *
 * Nota de la Fase 2: esto YA NO llama a `useLicenseStore.init()`, así que
 * `useFeature`/`FeatureGuard` (que todavía leen del token de licencia) dejan
 * de recibir funciones del plan hasta la Fase 3 — mientras tanto, para no
 * bloquear a nadie de una función que sí pagó, todo cliente en modo live se
 * trata como si tuviera todas las funciones. La Fase 3 lee `company.plan` en
 * su lugar y restaura el filtro real.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const mode = useDataStore((s) => s.mode)
  const authStatus = useAuthStore((s) => s.status)
  const subscription = useDataStore((s) => s.company.subscription)
  // Re-evaluate periodically so a trial/gracia that lapses while the tab stays
  // open is caught without needing a navigation or a network round-trip.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => forceTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (mode !== 'live' || authStatus !== 'authenticated') return <>{children}</>

  const verdict = evaluateSubscription(subscription)
  if (verdict.allowed || !verdict.reason) return <>{children}</>
  return <BlockedScreen reason={verdict.reason} />
}
