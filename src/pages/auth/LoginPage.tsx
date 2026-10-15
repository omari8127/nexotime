import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, TriangleAlert } from 'lucide-react'
import { AuthShell } from '@/pages/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { signIn } from '@/services/live/liveApi'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/toast'

export function LoginPage() {
  const navigate = useNavigate()
  // Where to go after signing in (e.g. "/clock" when this equipment is being set up as the reloj
  // checador). Only paths inside the app are honoured. Without one, back to the welcome page: it shows
  // "Sesión iniciada" with the company's name and the person chooses the panel, the clock or the portal
  // (it used to jump straight into the panel, or the clock on a kiosk tablet).
  const [params] = useSearchParams()
  const requested = params.get('next') ?? ''
  const next = /^\/[a-z-]*$/.test(requested) && requested !== '/' ? requested : '/bienvenida'
  const hydrateLive = useDataStore((s) => s.hydrateLive)
  const setAuthStatus = useAuthStore((s) => s.setStatus)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña.')
      return
    }
    setLoading(true)
    try {
      const bundle = await signIn(email.trim(), password)
      hydrateLive(bundle)
      setAuthStatus('authenticated')
      toast.success('Bienvenido de nuevo', bundle.company.name)
      navigate(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={next === '/clock' ? 'Activar el reloj checador' : 'Portal de administración'}
      description={
        next === '/clock'
          ? 'Entra con la cuenta de tu empresa: este equipo quedará como reloj checador para todos los empleados.'
          : 'Entra al panel de tu empresa en NEXOTIME.'
      }
      footer={
        <>
          ¿Tu empresa no tiene cuenta todavía?{' '}
          <Link to="/signup" className="font-semibold text-sky-700 hover:underline">
            Crear cuenta
          </Link>
          <span className="mt-1.5 block">
            ¿Eres empleado?{' '}
            <Link to="/activar?modo=empleado" className="font-semibold text-sky-700 hover:underline">
              Entra con tu número y PIN
            </Link>
          </span>
        </>
      }
    >
      {!isSupabaseConfigured ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          La conexión a la base de datos no está configurada en este entorno todavía.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Correo electrónico</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contraseña</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Iniciar sesión
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
