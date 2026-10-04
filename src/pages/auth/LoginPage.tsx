import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Iniciar sesión"
      description="Entra al panel de tu empresa en NEXOTIME."
      footer={
        <>
          ¿Tu empresa no tiene cuenta todavía?{' '}
          <Link to="/signup" className="font-medium text-sky-300 hover:underline">
            Crear cuenta
          </Link>
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
