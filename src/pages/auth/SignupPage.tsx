import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, TriangleAlert } from 'lucide-react'
import { AuthShell } from '@/pages/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { signUpCompany } from '@/services/live/liveApi'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/toast'

export function SignupPage() {
  const navigate = useNavigate()
  const hydrateLive = useDataStore((s) => s.hydrateLive)
  const setAuthStatus = useAuthStore((s) => s.setStatus)

  const [companyName, setCompanyName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!companyName.trim() || !ownerName.trim() || !email.trim() || !password) {
      setError('Completa todos los campos.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      const bundle = await signUpCompany({
        companyName: companyName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        password,
      })
      hydrateLive(bundle)
      setAuthStatus('authenticated')
      toast.success('Cuenta creada', `Bienvenido a NEXOTIME, ${companyName.trim()}`)
      navigate('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Crea la cuenta de tu empresa"
      description="Tu propia base de datos, aislada del resto de las empresas que usan NEXOTIME."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Iniciar sesión
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
            <Label>Nombre de tu empresa</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ej. Comercializadora del Valle S.A. de C.V."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tu nombre</Label>
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Ej. Ana Torres" />
          </div>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Crear cuenta
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Empezarás con una empresa vacía — el asistente de configuración te ayuda a definir tu
            jornada, agregar tu primera sucursal y tus empleados.
          </p>
        </form>
      )}
    </AuthShell>
  )
}
