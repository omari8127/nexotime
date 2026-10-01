import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { exchangeGoogleDriveCode } from '@/services/live/googleDrive'
import { useDataStore } from '@/store/dataStore'

/** A dónde vuelve Google después de que el administrador autoriza (o cancela)
 *  el acceso a su Drive — ver src/services/live/googleDrive.ts. */
export function GoogleDriveCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const currentUser = useDataStore((s) => s.currentUser)
  const logAudit = useDataStore((s) => s.logAudit)
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = params.get('code')
    const googleError = params.get('error')
    if (googleError) {
      setState('error')
      setMessage('No se completó la conexión con Google.')
      return
    }
    if (!code) {
      setState('error')
      setMessage('Falta el código de autorización de Google.')
      return
    }

    exchangeGoogleDriveCode(code)
      .then(({ email }) => {
        setState('ok')
        setMessage(email)
        logAudit(
          {
            action: 'integration.connect',
            entityType: 'Company',
            entityId: 'google_drive',
            entityLabel: 'Google Drive',
            changes: [{ field: 'Integración', before: null, after: `Conectado como ${email}` }],
          },
          currentUser,
        )
      })
      .catch((e: Error) => {
        setState('error')
        setMessage(e.message)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {state === 'working' ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Conectando con Google Drive…</p>
            </>
          ) : state === 'ok' ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-success" />
              <div>
                <p className="font-semibold text-foreground">Google Drive conectado</p>
                <p className="mt-1 text-sm text-muted-foreground">Cuenta: {message}</p>
              </div>
              <Button onClick={() => navigate('/configuracion')}>Volver a Configuración</Button>
            </>
          ) : (
            <>
              <TriangleAlert className="h-10 w-10 text-destructive" />
              <div>
                <p className="font-semibold text-foreground">No se pudo conectar</p>
                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/configuracion')}>
                Volver a Configuración
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
