import { KeyRound, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LICENSE_ENFORCED } from '@/lib/license/config'
import { useLicenseStore } from '@/lib/license/store'

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX') : '—')
const dateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

const PLAN: Record<string, string> = { basico: 'Básico', profesional: 'Profesional', empresa: 'Empresa' }

/** Read-only view of this installation's license. Nothing here can be edited: only the license server changes it. */
export function LicensePanel() {
  const { payload, phase, deviceId, online, offlineDaysLeft, busy, validateNow } = useLicenseStore()

  if (!LICENSE_ENFORCED || !payload) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Esta instalación no usa licencia (modo demostración o desarrollo).
        </CardContent>
      </Card>
    )
  }
  const rows: Array<[string, string]> = [
    ['Empresa', payload.co],
    ['Licencia', payload.lid],
    ['Plan', PLAN[payload.plan] ?? payload.plan],
    ['Vencimiento', date(payload.exp)],
    ['Última validación', dateTime(payload.iat)],
    ['Dispositivos permitidos', String(payload.max)],
    ['ID de este equipo', deviceId],
  ]
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />
          Licencia
        </CardTitle>
        <Badge variant={phase === 'ready' ? 'success' : 'warning'}>{phase === 'ready' ? 'Activa' : 'Bloqueada'}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="divide-y divide-border rounded-lg border border-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={k === 'Licencia' || k === 'ID de este equipo' ? 'break-all font-mono text-xs' : 'font-medium'}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void validateNow()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Validar ahora
          </Button>
          <p className="text-sm text-muted-foreground">
            {online === false
              ? `Sin conexión con el servidor de licencias. Puedes seguir usando el programa ${offlineDaysLeft ?? 0} ${offlineDaysLeft === 1 ? 'día' : 'días'} más sin conexión.`
              : 'La licencia se valida sola cuando hay Internet.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
