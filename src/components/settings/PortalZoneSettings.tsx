import { Link } from 'react-router-dom'
import { Ban, Eye, MapPinned, ShieldAlert, Users } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { resolvePortalZone, type OutsideZoneRule } from '@/lib/portalZone'
import { cn } from '@/lib/utils'
import type { PortalZoneSettings as ZoneSettings } from '@/types'

const RADII = [100, 150, 200, 300, 500, 1000]

const RULES: Array<{ value: OutsideZoneRule; label: string; text: string; Icon: typeof Ban; active: string }> = [
  {
    value: 'block',
    label: 'No registrar',
    text: 'Se le dice a qué distancia está y no se registra. Recomendado.',
    Icon: Ban,
    active: 'border-rose-500 bg-rose-500/10 text-rose-800 ring-2 ring-rose-500/20 dark:text-rose-200',
  },
  {
    value: 'flag',
    label: 'Registrar y marcar',
    text: 'Se registra, en rojo como «Fuera de zona» en Registro de checadas para que lo revises.',
    Icon: ShieldAlert,
    active: 'border-amber-500 bg-amber-400/15 text-amber-900 ring-2 ring-amber-500/20 dark:text-amber-200',
  },
  {
    value: 'off',
    label: 'No revisar',
    text: 'Se registra desde donde sea. La ubicación real se guarda igual.',
    Icon: Eye,
    active: 'border-slate-500 bg-slate-500/10 text-slate-800 ring-2 ring-slate-500/20 dark:text-slate-200',
  },
]

/**
 * Configuración → Portal de empleados → "Zona permitida": how close to their branch a phone must be
 * to check in, and what happens farther away. The database applies it on every punch (migration 013).
 */
export function PortalZoneSettings() {
  const company = useDataStore((s) => s.company)
  const branches = useDataStore((s) => s.branches)
  const employees = useDataStore((s) => s.employees)
  const updateSettings = useDataStore((s) => s.updateSettings)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  const canManage = can('settings.manage')
  const zone = resolvePortalZone(company.attendanceSettings)

  const save = (patch: ZoneSettings, message: string) => {
    updateSettings(
      { portalZone: { radiusMeters: zone.radius, outsideZone: zone.rule, ...company.attendanceSettings.portalZone, ...patch } },
      currentUser,
    )
    toast.success('Zona actualizada', message)
  }

  const withoutPoint = branches.filter((b) => b.active !== false && (b.lat == null || b.lng == null))
  const anywhere = employees.filter((e) => e.status === 'active' && e.remotePunch).length

  return (
    <div className="space-y-3 rounded-lg border border-border p-3.5">
      <div className="flex items-start gap-2.5">
        <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">Zona permitida para checar desde el celular</p>
          <p className="text-xs text-muted-foreground">
            Desde el celular solo se checa con el GPS real del teléfono (precisión de 100 m o mejor). Se mide la distancia
            al punto de la sucursal de cada empleado. Las tablets del reloj checador no cambian.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Distancia máxima a su sucursal</p>
        <div className="flex flex-wrap gap-1.5">
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              disabled={!canManage}
              aria-pressed={zone.radius === r}
              onClick={() => save({ radiusMeters: r }, `Hasta ${r < 1000 ? `${r} m` : `${r / 1000} km`} de la sucursal.`)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-semibold tabular-nums transition-all active:scale-95 disabled:opacity-60',
                zone.radius === r
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {r < 1000 ? `${r} m` : `${r / 1000} km`}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          150 m cubre el edificio, el estacionamiento y el margen de error normal del GPS.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Si checa fuera de esa distancia</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {RULES.map((rule) => (
            <button
              key={rule.value}
              type="button"
              disabled={!canManage}
              aria-pressed={zone.rule === rule.value}
              onClick={() => save({ outsideZone: rule.value }, rule.label)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition-all active:scale-[0.98] disabled:opacity-60',
                zone.rule === rule.value ? rule.active : 'border-border bg-card hover:bg-secondary/50',
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <rule.Icon className="h-4 w-4" />
                {rule.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug opacity-80">{rule.text}</span>
            </button>
          ))}
        </div>
      </div>

      {withoutPoint.length > 0 ? (
        <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {withoutPoint.map((b) => b.name).join(', ')} {withoutPoint.length === 1 ? 'no tiene' : 'no tienen'} su punto
          exacto: ahí no se puede revisar la zona. Ponlo en{' '}
          <Link to="/sucursales" className="font-semibold underline">
            Sucursales
          </Link>{' '}
          (pega las coordenadas desde Google Maps).
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {anywhere === 0
          ? 'Nadie tiene permiso de checar desde cualquier lugar.'
          : `${anywhere} ${anywhere === 1 ? 'empleado puede' : 'empleados pueden'} checar desde cualquier lugar (home office, ventas, choferes).`}{' '}
        Se cambia en Empleados → Editar.
      </p>
    </div>
  )
}
