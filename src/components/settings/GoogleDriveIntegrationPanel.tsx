import { useEffect, useState } from 'react'
import { Cloud, Loader2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import {
  buildGoogleAuthUrl,
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  type GoogleDriveStatus,
} from '@/services/live/googleDrive'

const dateTime = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

export function GoogleDriveIntegrationPanel() {
  const currentUser = useDataStore((s) => s.currentUser)
  const logAudit = useDataStore((s) => s.logAudit)
  const { can } = usePermissions()
  const canManage = can('settings.manage')

  const [status, setStatus] = useState<GoogleDriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  useEffect(() => {
    getGoogleDriveStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, connectedEmail: null, lastExportAt: null, lastExportStatus: null, lastExportError: null }))
      .finally(() => setLoading(false))
  }, [])

  const connect = () => {
    setConnecting(true)
    try {
      window.location.href = buildGoogleAuthUrl()
    } catch (e) {
      toast.error('No se pudo iniciar la conexión', e instanceof Error ? e.message : undefined)
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    try {
      await disconnectGoogleDrive()
      setStatus({ connected: false, connectedEmail: null, lastExportAt: null, lastExportStatus: null, lastExportError: null })
      toast.success('Google Drive desconectado')
      logAudit(
        {
          action: 'integration.disconnect',
          entityType: 'Company',
          entityId: 'google_drive',
          entityLabel: 'Google Drive',
          changes: [{ field: 'Integración', before: 'Conectado', after: null }],
        },
        currentUser,
      )
    } catch (e) {
      toast.error('No se pudo desconectar', e instanceof Error ? e.message : undefined)
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Solo el propietario o un administrador pueden conectar o desconectar integraciones.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-4 w-4 text-primary" />
          Google Drive
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Sube automáticamente, una vez al día, un reporte en CSV con la asistencia del día anterior a tu
          propio Google Drive (carpeta "Nexotime").
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Revisando estado…
          </div>
        ) : status?.connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
              <Badge variant="success">Conectado</Badge>
              <span className="text-sm text-foreground">{status.connectedEmail}</span>
            </div>
            {status.lastExportAt ? (
              <p className="text-xs text-muted-foreground">
                Último respaldo: {dateTime(status.lastExportAt)} ·{' '}
                {status.lastExportStatus === 'ok' ? (
                  <span className="text-success">correcto</span>
                ) : (
                  <span className="text-destructive">con error{status.lastExportError ? `: ${status.lastExportError}` : ''}</span>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Todavía no se ha corrido el primer respaldo diario.</p>
            )}
            <Button variant="secondary" onClick={() => setDisconnectOpen(true)}>
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Sin conectar. Los reportes no se están respaldando automáticamente.
            </div>
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Conectar con Google Drive
            </Button>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="¿Desconectar Google Drive?"
        description="Dejarán de subirse los respaldos diarios de asistencia a tu Drive."
        confirmLabel="Desconectar"
        destructive
        onConfirm={() => void disconnect()}
      />
    </Card>
  )
}
