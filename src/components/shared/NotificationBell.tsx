import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { useComplianceAlerts } from '@/hooks/useComplianceAlerts'

/** Same alerts as the Dashboard's "Empleados con alertas" card, surfaced from
 *  every page so RH no tiene que volver al Dashboard para verlas. */
export function NotificationBell() {
  const alerts = useComplianceAlerts(8)
  const navigate = useNavigate()

  return (
    <Dropdown
      align="end"
      className="w-80"
      trigger={
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" />
          {alerts.length > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-card bg-destructive" />
          ) : null}
        </button>
      }
    >
      <DropdownLabel>
        <span className="flex items-center justify-between">
          Alertas
          {alerts.length > 0 ? <Badge variant="warning">{alerts.length}</Badge> : null}
        </span>
      </DropdownLabel>
      {alerts.length === 0 ? (
        <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">
          Sin alertas activas.
        </p>
      ) : (
        alerts.map((alert) => (
          <DropdownItem key={alert.id} onSelect={() => navigate(alert.to)} className="items-start">
            <Avatar name={alert.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {alert.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{alert.detail}</span>
            </span>
          </DropdownItem>
        ))
      )}
      {alerts.length > 0 ? (
        <>
          <DropdownSeparator />
          <DropdownItem onSelect={() => navigate('/')}>Ver todo en el Dashboard</DropdownItem>
        </>
      ) : null}
    </Dropdown>
  )
}
