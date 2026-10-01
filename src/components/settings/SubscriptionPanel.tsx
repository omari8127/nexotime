import { useState } from 'react'
import { CreditCard, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PLAN_LABEL } from '@/lib/license/features'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { restoreSession } from '@/services/live/liveApi'
import type { SubscriptionStatus } from '@/types'

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—')
const dateTime = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  trialing: { label: 'En periodo de prueba', variant: 'warning' },
  active: { label: 'Al corriente', variant: 'success' },
  past_due: { label: 'Pago atrasado', variant: 'warning' },
  canceled: { label: 'Cancelada', variant: 'destructive' },
}

/**
 * Fase 4 de la migración (ver docs/ESTADO.md): reemplaza a LicensePanel.
 * Solo lectura a propósito — nadie con sesión normal puede cambiar su propio
 * plan o estado de pago (ver supabase/migrations/004_suscripciones.sql), así
 * que esta pantalla no tiene botón de "pagar". Mientras no se conecta Stripe o
 * Mercado Pago, el pago se registra a mano desde fuera de la app.
 */
export function SubscriptionPanel() {
  const company = useDataStore((s) => s.company)
  const payments = useDataStore((s) => s.payments)
  const hydrateLive = useDataStore((s) => s.hydrateLive)
  const { can } = usePermissions()
  const [refreshing, setRefreshing] = useState(false)
  const sub = company.subscription
  const status = STATUS_BADGE[sub.status]

  const refresh = async () => {
    setRefreshing(true)
    try {
      const bundle = await restoreSession()
      if (bundle) hydrateLive(bundle)
    } finally {
      setRefreshing(false)
    }
  }

  if (!can('settings.manage')) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Solo el propietario o un administrador pueden ver el plan y los pagos de la empresa.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            Plan y pago
          </CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="divide-y divide-border rounded-lg border border-border">
            <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium">{PLAN_LABEL[sub.plan]}</dd>
            </div>
            {sub.status === 'trialing' ? (
              <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
                <dt className="text-muted-foreground">La prueba termina</dt>
                <dd className="font-medium">{date(sub.trialEndsAt)}</dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
                <dt className="text-muted-foreground">
                  {sub.status === 'past_due' ? 'Venció el' : 'Cubierto hasta el'}
                </dt>
                <dd className="font-medium">{date(sub.currentPeriodEnd)}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar
            </Button>
            <p className="text-sm text-muted-foreground">
              {sub.status === 'past_due'
                ? 'Ya pagaste y sigue marcando atrasado? Dale a Actualizar; si persiste, contacta a tu proveedor.'
                : 'Para cambiar de plan o renovar antes de tiempo, contacta a tu proveedor.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Todavía no hay pagos registrados.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{money(p.amount, p.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(p.createdAt)} · {p.reference || p.method}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {p.monthsCovered} {p.monthsCovered === 1 ? 'mes' : 'meses'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
