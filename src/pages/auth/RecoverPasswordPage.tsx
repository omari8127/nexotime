import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import { AuthShell } from '@/pages/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { friendlyAuthError, passwordProblem, recoveryLinkFailed } from '@/lib/passwordReset'
import { requestPasswordReset, updateOwnPassword } from '@/services/live/liveApi'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/toast'

/** Step 1: ask for the email. The answer is always the same, so it cannot be used to find out who has an account. */
export function RecoverPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const address = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Escribe tu correo electrónico completo.')
      return
    }
    setLoading(true)
    try {
      await requestPasswordReset(address)
      setSent(true)
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'No se pudo enviar el correo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      description="Escribe el correo con el que entras al panel y te enviamos un enlace para elegir una contraseña nueva."
      footer={
        <Link to="/login" className="font-semibold text-sky-700 hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {!isSupabaseConfigured ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          La conexión a la base de datos no está configurada en este entorno todavía.
        </div>
      ) : sent ? (
        <div className="space-y-3 text-sm text-slate-700">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p>
              Si <strong className="break-all">{email.trim()}</strong> tiene una cuenta, en unos minutos le llega un correo con el
              enlace. Revisa también la carpeta de spam.
            </p>
          </div>
          <p className="text-slate-500">
            El enlace dura poco tiempo y solo sirve una vez. ¿No llegó? Puedes{' '}
            <button type="button" className="font-semibold text-sky-700 hover:underline" onClick={() => setSent(false)}>
              pedirlo otra vez
            </button>
            .
          </p>
          <p className="text-slate-500">
            Los empleados no usan este enlace: si olvidaste tu PIN, pide a tu administrador que lo cambie.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Correo electrónico</Label>
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

/**
 * Step 2: the link in the email lands here with a short-lived session already open (Supabase reads it from the
 * address). Choosing the new password keeps that session, so the person goes straight in.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const status = useAuthStore((s) => s.status)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const linkFailed = typeof window !== 'undefined' && recoveryLinkFailed(window.location.hash + window.location.search)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = passwordProblem(password, again)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setLoading(true)
    try {
      await updateOwnPassword(password)
      toast.success('Contraseña actualizada', 'Ya puedes usarla para iniciar sesión.')
      navigate('/bienvenida', { replace: true })
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.'))
    } finally {
      setLoading(false)
    }
  }

  const expired = linkFailed || status === 'anonymous'

  return (
    <AuthShell
      title="Elige tu nueva contraseña"
      description="Escríbela dos veces. Debe tener al menos 8 caracteres."
      footer={
        <Link to="/login" className="font-semibold text-sky-700 hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {status === 'checking' && !linkFailed ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Revisando el enlace…
        </div>
      ) : expired ? (
        <div className="space-y-3 text-sm text-slate-700">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p>El enlace venció o ya se usó. Pide uno nuevo y ábrelo desde el mismo correo.</p>
          </div>
          <Link to="/recuperar">
            <Button size="lg" className="w-full">
              Pedir un enlace nuevo
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Contraseña nueva</Label>
            <Input
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Repite la contraseña</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
