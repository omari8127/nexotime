import { useEffect, useState } from 'react'
import { Copy, KeyRound, Smartphone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { qrSvg } from '@/lib/credentials'
import { PortalZoneSettings } from '@/components/settings/PortalZoneSettings'

/**
 * Configuración → Portal de empleados: the code and link the company hands to its people so they
 * can enter from their phone with their employee number and PIN, and the switch that turns it off.
 */
export function EmployeePortalPanel() {
  const company = useDataStore((s) => s.company)
  const employees = useDataStore((s) => s.employees)
  const updateCompany = useDataStore((s) => s.updateCompany)
  const updateSettings = useDataStore((s) => s.updateSettings)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  const canManage = can('settings.manage')

  const code = company.portalCode
  const enabled = company.portalEnabled !== false
  const link = code ? `${window.location.origin}/empleado/${code}` : ''
  const [qr, setQr] = useState('')
  useEffect(() => {
    let alive = true
    if (link) {
      void qrSvg(link).then((svg) => {
        if (alive) setQr(svg)
      })
    }
    return () => {
      alive = false
    }
  }, [link])

  const active = employees.filter((e) => e.status === 'active')
  const withoutPin = active.filter((e) => !e.pin).length

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copiado`)
    } catch {
      toast.error('No se pudo copiar', 'Selecciónalo y cópialo a mano.')
    }
  }

  if (!code) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" />
            Portal de empleados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Con el portal, cada empleado registra su entrada y salida desde su celular con su número de empleado y su
            PIN, con foto en cada movimiento, y pide vacaciones.
          </p>
          <p>
            Para activarlo falta un paso en la base de datos: ejecutar{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase/migrations/008_portal_empleado.sql</code> en
            el SQL Editor de Supabase y volver a cargar esta página.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-primary" />
          Portal de empleados
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Cada empleado entra desde su celular con el código de la empresa, su número de empleado y su PIN (el mismo del
          reloj checador). Cada movimiento se guarda con foto y ubicación, y puede pedir vacaciones.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Permitir checar desde el celular</p>
            <p className="text-xs text-muted-foreground">
              Apagado, nadie puede entrar al portal; el reloj checador sigue funcionando igual.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={!canManage}
            onCheckedChange={(value) => {
              updateCompany({ portalEnabled: value }, currentUser)
              toast.success(value ? 'Portal de empleados activado' : 'Portal de empleados apagado')
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Registrar su rostro desde el celular</p>
            <p className="text-xs text-muted-foreground">
              Quien todavía no tiene rostro registrado puede registrarlo él mismo, una sola vez. Para cambiar o borrar
              uno existente sigue haciendo falta un administrador. Si el rostro se parece al de otro empleado, no se
              guarda.
            </p>
          </div>
          <Switch
            checked={company.attendanceSettings.portalFaceEnroll !== false}
            disabled={!canManage}
            onCheckedChange={(value) => {
              updateSettings({ portalFaceEnroll: value }, currentUser)
              toast.success(value ? 'Los empleados pueden registrar su rostro' : 'Solo el administrador registra rostros')
            }}
          />
        </div>

        <PortalZoneSettings />

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Código de la empresa</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xl font-bold tracking-[0.2em]">
                  {code}
                </span>
                <Button variant="secondary" size="sm" onClick={() => void copy(code, 'Código')}>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Enlace para compartir (ya trae el código)</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-sm">{link}</span>
                <Button variant="secondary" size="sm" onClick={() => void copy(link, 'Enlace')}>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
            {withoutPin > 0 ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {withoutPin} de {active.length} empleados activos no {withoutPin === 1 ? 'tiene' : 'tienen'} PIN y no
                {withoutPin === 1 ? ' podrá' : ' podrán'} entrar: asígnalo en Empleados → Editar.
              </p>
            ) : null}
          </div>
          {qr ? (
            <div className="mx-auto text-center">
              <div
                className="h-36 w-36 rounded-lg border border-border bg-white p-1.5 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Escanéalo con el celular</p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
