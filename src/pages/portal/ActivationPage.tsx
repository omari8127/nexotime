import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, KeyRound, Loader2, MonitorSmartphone, Smartphone } from 'lucide-react'
import { AuthShell } from '@/pages/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { demoPortalAccess, portalApi } from '@/services/portal/portalApi'
import { readRememberedAccess, rememberAccess, savePortalToken } from '@/services/portal/portalSession'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

type Mode = 'employee' | 'kiosk'

const MODES: Array<{ value: Mode; icon: typeof Smartphone; title: string; text: string }> = [
  {
    value: 'employee',
    icon: Smartphone,
    title: 'Empleado',
    text: 'Solo yo, desde mi celular: registro mi entrada y salida y pido vacaciones.',
  },
  {
    value: 'kiosk',
    icon: MonitorSmartphone,
    title: 'Reloj checador',
    text: 'Todos los empleados checan en este equipo (tablet o PC en la entrada).',
  },
]

/**
 * "Activación": the first thing a new device sees. It asks how this equipment will be used —
 * as one employee's own portal (number + PIN) or as the company's shared reloj checador (the
 * company's account) — and takes the person there.
 */
export function ActivationPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const signedIn = useAuthStore((s) => s.status === 'authenticated')
  const remembered = readRememberedAccess()
  const sample = demoPortalAccess()

  const [mode, setMode] = useState<Mode>(params.get('modo') === 'reloj' ? 'kiosk' : 'employee')
  const [code, setCode] = useState((params.get('empresa') ?? remembered.code ?? '').toUpperCase())
  const [number, setNumber] = useState(remembered.number)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const enter = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!code.trim() || !number.trim() || !pin) {
      setError('Escribe el código de tu empresa, tu número de empleado y tu PIN.')
      return
    }
    setBusy(true)
    try {
      const token = await portalApi.login(code, number, pin)
      savePortalToken(token)
      rememberAccess({ code: code.trim().toUpperCase(), number: number.trim() })
      navigate('/empleado', { replace: true })
    } catch (err) {
      setPin('')
      setError(err instanceof Error ? err.message : 'No se pudo entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Activar este equipo"
      description="Elige cómo se va a usar NEXOTIME aquí."
      footer={
        <>
          ¿Administras la empresa?{' '}
          <Link to="/login" className="font-semibold text-sky-700 hover:underline">
            Entra al portal de administración
          </Link>
        </>
      }
    >
      <div role="radiogroup" aria-label="Modo de operación" className="grid gap-2.5 sm:grid-cols-2">
        {MODES.map((m) => {
          const active = mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setMode(m.value)
                setError('')
              }}
              className={cn(
                'relative rounded-xl border p-3.5 text-left transition-all',
                active
                  ? 'border-slate-900 bg-slate-50 shadow-sm ring-1 ring-slate-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700',
                )}
              >
                <m.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-2.5 block text-sm font-semibold text-slate-900">{m.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{m.text}</span>
              {active ? (
                <motion.span
                  layoutId="activation-check"
                  className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </motion.span>
              ) : null}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {mode === 'employee' ? (
          <motion.form
            key="employee"
            onSubmit={enter}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-5 space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Código de la empresa</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                placeholder="Te lo da tu empresa"
                className="font-mono tracking-widest"
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <div className="space-y-1.5">
                <Label>Número de empleado</Label>
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  autoComplete="username"
                  placeholder="Ej. 7 o EMP-007"
                />
              </div>
              <div className="space-y-1.5">
                <Label>PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="tracking-[0.3em]"
                />
              </div>
            </div>

            <AnimatePresence>
              {error ? (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden text-sm text-destructive"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Entrar
            </Button>

            <p className="text-xs leading-relaxed text-slate-500">
              Es el mismo PIN del reloj checador. Al registrar cada movimiento se toma una foto que revisa tu
              empresa. Si no tienes PIN, pídelo en Recursos Humanos.
            </p>
            {sample ? (
              <button
                type="button"
                onClick={() => {
                  setCode(sample.code)
                  setNumber(sample.number)
                  setPin(sample.pin)
                }}
                className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                <b className="text-slate-900">Demostración:</b> toca aquí para llenar los datos de un empleado de ejemplo.
              </button>
            ) : null}
          </motion.form>
        ) : (
          <motion.div
            key="kiosk"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-5 space-y-4"
          >
            <ul className="space-y-2 text-sm text-slate-700">
              {[
                'Se activa con la cuenta de administración de tu empresa.',
                'Los empleados checan con rostro, QR, código de barras o número + PIN.',
                'Sigue funcionando si se va el Internet y envía las checadas al volver.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate(signedIn || !isSupabaseConfigured ? '/clock' : '/login?next=/clock')}
            >
              {signedIn ? 'Abrir el reloj checador' : isSupabaseConfigured ? 'Entrar con la cuenta de la empresa' : 'Abrir el reloj de demostración'}
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!signedIn && isSupabaseConfigured ? (
              <p className="text-center text-xs text-slate-500">
                ¿Solo quieres verlo?{' '}
                <Link to="/clock" className="font-semibold text-sky-700 hover:underline">
                  Abrir el reloj de demostración
                </Link>
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
