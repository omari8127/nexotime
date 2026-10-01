import { useMemo, useState } from 'react'
import { ArrowRight, Download, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { ROLES } from '@/data/roles'
import { buildWorkbookPayload, downloadCSV } from '@/services/exportService'
import type { AuditAction } from '@/types'

const ACTION_LABEL: Record<AuditAction, string> = {
  'attendance.edit': 'Editó registro de asistencia',
  'attendance.create': 'Creó registro de asistencia',
  'attendance.correction_requested': 'Solicitó corrección de asistencia',
  'employee.create': 'Creó empleado',
  'employee.edit': 'Editó empleado',
  'employee.deactivate': 'Desactivó empleado',
  'schedule.create': 'Creó horario',
  'schedule.edit': 'Editó horario',
  'device.register': 'Registró dispositivo',
  'user.create': 'Creó usuario',
  'settings.update': 'Actualizó configuración',
  'incidencia.create': 'Registró incidencia',
  'incidencia.cancel': 'Canceló incidencia',
  'incidencia.approve': 'Aprobó incidencia',
  'incidencia.reject': 'Rechazó incidencia',
  'incidencia.correct': 'Marcó incidencia como corregida',
  'correction.approve': 'Aprobó corrección de asistencia',
  'correction.reject': 'Rechazó corrección de asistencia',
  'branch.create': 'Creó sucursal',
  'branch.edit': 'Editó sucursal',
  'integration.connect': 'Conectó una integración',
  'integration.disconnect': 'Desconectó una integración',
  'user.role_change': 'Cambió permisos de usuario',
  'face.rejected': 'Identificación facial rechazada',
}

export function AuditPage() {
  const audit = useDataStore((s) => s.audit)
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return audit
      .filter((a) => (action === 'all' ? true : a.action === action))
      .filter((a) =>
        q
          ? [a.actorName, a.entityLabel, ACTION_LABEL[a.action], a.reason ?? '']
              .join(' ')
              .toLowerCase()
              .includes(q)
          : true,
      )
  }, [audit, query, action])

  const exportCsv = () => {
    downloadCSV(
      buildWorkbookPayload(
        'Auditoría',
        [
          { key: 'date', header: 'Fecha' },
          { key: 'actor', header: 'Usuario' },
          { key: 'role', header: 'Rol' },
          { key: 'action', header: 'Acción' },
          { key: 'entity', header: 'Entidad' },
          { key: 'before', header: 'Antes' },
          { key: 'after', header: 'Después' },
          { key: 'reason', header: 'Motivo' },
        ],
        filtered.map((a) => ({
          date: new Date(a.createdAt).toLocaleString('es-MX'),
          actor: a.actorName,
          role: ROLES[a.actorRole].label,
          action: ACTION_LABEL[a.action],
          entity: a.entityLabel,
          before: a.changes.map((c) => `${c.field}: ${c.before ?? '—'}`).join(' | '),
          after: a.changes.map((c) => `${c.field}: ${c.after ?? '—'}`).join(' | '),
          reason: a.reason ?? '',
        })),
      ),
      'nexotime-auditoria',
    )
    toast.success('Auditoría exportada', `${filtered.length} eventos`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Cada modificación de asistencia, empleado o configuración queda registrada aquí."
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_240px]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por usuario, entidad o motivo"
          />
          <Select
            value={action}
            onValueChange={setAction}
            options={[
              { value: 'all', label: 'Todas las acciones' },
              ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardContent className="divide-y divide-border pt-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Sin eventos para los filtros seleccionados.</p>
            </div>
          ) : (
            filtered.map((a) => (
              <div key={a.id} className="flex gap-3 py-4">
                <Avatar name={a.actorName} size="sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium">{a.actorName}</span>
                    <Badge variant="secondary">{ROLES[a.actorRole].label}</Badge>
                    <span className="text-muted-foreground">{ACTION_LABEL[a.action]}</span>
                    <span className="font-medium">{a.entityLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString('es-MX', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                  {a.changes.length ? (
                    <div className="space-y-1 rounded-lg border border-border bg-secondary/40 p-2.5">
                      {a.changes.map((c, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-foreground">{c.field}</span>
                          <span className="text-muted-foreground line-through">
                            {c.before ?? 'Sin dato'}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">{c.after ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {a.reason ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Motivo:</span> {a.reason}
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
