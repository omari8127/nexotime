import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarX2, CloudOff, Loader2, Lock, PauseCircle, ShieldAlert, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { NexotimeLogo } from '@/components/shared/Logo'
import { LICENSE_ENFORCED } from '@/lib/license/config'
import { useLicenseStore } from '@/lib/license/store'
import type { BlockReason } from '@/lib/license/token'
import { useDataStore } from '@/store/dataStore'
import { useUIStore } from '@/store/uiStore'

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

/** Shown on a fresh install: nothing else in the program is reachable until this succeeds. */
function ActivationScreen() {
  const activate = useLicenseStore((s) => s.activate)
  const busy = useLicenseStore((s) => s.busy)
  const completeOnboarding = useUIStore((s) => s.completeOnboarding)
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!code.trim() || !company.trim()) {
      setError('Escribe el código de licencia y el nombre de tu empresa.')
      return
    }
    if (/^LIC[-\s]?\d{4}/i.test(code.trim())) {
      setError('Ese es el número de licencia, no el código de activación. El código empieza con NXT- y te lo entregó tu proveedor.')
      return
    }
    const r = await activate(code, company)
    if (r.ok) navigate('/login', { replace: true })
    else setError(r.message)
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Activar producto</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Escribe el código que te entregó tu proveedor para comenzar a usar NEXOTIME en este equipo.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="lic-code">Código de licencia</Label>
          <Input
            id="lic-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="NXT-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-wider"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lic-company">Empresa</Label>
          <Input
            id="lic-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nombre de tu empresa"
            autoComplete="organization"
          />
        </div>
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="font-semibold">No se pudo activar la licencia.</b>
              <br />
              {error}
            </span>
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Activar
        </Button>
      </form>
      <button
        type="button"
        onClick={() => {
          completeOnboarding()
          navigate('/')
        }}
        className="mt-5 w-full text-center text-[13px] text-muted-foreground hover:text-foreground"
      >
        Solo quiero ver una demostración, sin activar
      </button>
    </Shell>
  )
}

const BLOCK: Record<BlockReason, { icon: typeof Lock; title: string; text: string }> = {
  pending: { icon: Lock, title: 'Licencia pendiente', text: 'Tu licencia todavía está pendiente de autorización. Contacta a tu proveedor.' },
  suspended: { icon: PauseCircle, title: 'Licencia suspendida', text: 'Tu licencia está suspendida. Contacta a tu proveedor para reactivarla; el programa se desbloqueará solo.' },
  expired: { icon: CalendarX2, title: 'Licencia vencida', text: 'Tu licencia expiró. Solicita la renovación a tu proveedor; el programa se desbloqueará solo al renovarla.' },
  cancelled: { icon: Lock, title: 'Licencia cancelada', text: 'Esta licencia fue cancelada. Contacta a tu proveedor.' },
  validation_required: { icon: CloudOff, title: 'Necesitamos validar tu licencia', text: 'Pasó demasiado tiempo sin conexión. Conecta este equipo a Internet: el programa se desbloqueará en cuanto se valide.' },
  clock_tampered: { icon: CalendarX2, title: 'Revisa la fecha y hora del equipo', text: 'La fecha o la hora de este equipo no parecen correctas. Ajústalas y conéctate a Internet para continuar.' },
  wrong_device: { icon: Lock, title: 'Equipo no autorizado', text: 'Esta licencia ya está vinculada a otro dispositivo. Contacte al administrador para autorizar este equipo.' },
}

function BlockedScreen() {
  const { reason, payload, online, busy, validateNow, forget } = useLicenseStore()
  const info = BLOCK[reason ?? 'validation_required']
  const Icon = info.icon
  return (
    <Shell>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Icon className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{info.title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{info.text}</p>
      {payload ? (
        <dl className="mt-5 space-y-1 rounded-lg border border-border bg-secondary/40 px-3.5 py-3 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Empresa</dt><dd className="font-medium">{payload.co}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Licencia</dt><dd className="font-mono">{payload.lid}</dd></div>
        </dl>
      ) : null}
      {online === false ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <WifiOff className="h-4 w-4" /> Sin conexión a Internet. Se reintentará automáticamente.
        </p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <Button className="flex-1" onClick={() => void validateNow()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Reintentar
        </Button>
        <Button variant="secondary" className="flex-1" onClick={forget}>
          Usar otro código
        </Button>
      </div>
    </Shell>
  )
}

function Unconfigured() {
  return (
    <Shell>
      <h1 className="text-xl font-semibold">Instalación incompleta</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Este programa aún no está preparado para activarse. Contacta a tu proveedor.
      </p>
    </Shell>
  )
}

/** Small, dismissible heads-up: never covers the kiosk or shifts the layout. */
function LicenseNotice() {
  const { phase, offlineDaysLeft, expiresInDays, online } = useLicenseStore()
  const [hidden, setHidden] = useState(false)
  if (phase !== 'ready' || hidden) return null
  const offlineSoon = online === false && offlineDaysLeft !== null && offlineDaysLeft <= 7
  const expiring = expiresInDays !== null && expiresInDays <= 15
  if (!offlineSoon && !expiring) return null
  return (
    <div role="status" className="fixed bottom-4 left-4 z-50 flex max-w-xs items-start gap-2.5 rounded-lg border border-warning/40 bg-card px-3.5 py-3 text-[13px] shadow-lg">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="flex-1">
        {expiring
          ? `Tu licencia vence en ${Math.max(0, expiresInDays!)} ${expiresInDays === 1 ? 'día' : 'días'}. Solicita la renovación.`
          : `Sin conexión con el servidor de licencias. Conéctate a Internet en los próximos ${offlineDaysLeft} ${offlineDaysLeft === 1 ? 'día' : 'días'}.`}
      </p>
      <button aria-label="Cerrar aviso" onClick={() => setHidden(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Wraps the routes. The demo needs no license; everything real does: sign-in, sign-up,
 * onboarding and any connected session. Offline, a previously validated license keeps
 * the clock running until its tolerance runs out.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const phase = useLicenseStore((s) => s.phase)
  const init = useLicenseStore((s) => s.init)
  const mode = useDataStore((s) => s.mode)
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted)
  const { pathname } = useLocation()

  useEffect(() => {
    if (LICENSE_ENFORCED) void init()
  }, [init])

  if (!LICENSE_ENFORCED) return <>{children}</>
  const demoOnly = mode === 'demo' && onboardingCompleted && !['/login', '/signup', '/onboarding'].includes(pathname)
  if (demoOnly || phase === 'ready') {
    return (
      <>
        {children}
        <LicenseNotice />
      </>
    )
  }
  if (phase === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (phase === 'unconfigured') return <Unconfigured />
  if (phase === 'blocked') return <BlockedScreen />
  return <ActivationScreen />
}
