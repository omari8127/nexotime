import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarPlus, Check, FileWarning, Inbox, X } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CorrectionStatusBadge, IncidenciaBadge, IncidenciaStatusBadge } from '@/components/shared/badges'
import { IncidenciaFormDialog } from '@/components/attendance/IncidenciaFormDialog'
import { ReviewDialog } from '@/components/shared/ReviewDialog'
import { toast } from '@/components/ui/toast'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { INCIDENCIA_META, INCIDENCIA_STATUS_META, INCIDENCIA_TYPES } from '@/data/incidencias'
import { PUNCH_TYPE_LABEL } from '@/lib/attendance'
import { formatShortDate, formatTime12 } from '@/lib/utils'
import type { CorrectionRequest, Incidencia, IncidenciaStatus } from '@/types'

const fmtStamp = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'

export function IncidenciasPage() {
  const { accessibleEmployees, incidencias, corrections } = useScopedData()
  const users = useDataStore((s) => s.users)
  const currentUser = useDataStore((s) => s.currentUser)
  const reviewIncidencia = useDataStore((s) => s.reviewIncidencia)
  const reviewCorrection = useDataStore((s) => s.reviewCorrection)
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()

  const [formOpen, setFormOpen] = useState(false)
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [employeeId, setEmployeeId] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [incReview, setIncReview] = useState<{ item: Incidencia; status: Exclude<IncidenciaStatus, 'pending'> } | null>(null)
  const [corReview, setCorReview] = useState<{ item: CorrectionRequest; decision: 'approved' | 'rejected' } | null>(null)

  const canReviewInc = can('incidencias.review')
  const canReviewCor = can('corrections.review')
  const canSeeCor = can('corrections.view')

  const empById = useMemo(() => new Map(accessibleEmployees.map((e) => [e.id, e])), [accessibleEmployees])
  const userName = (id?: string) => users.find((u) => u.id === id)?.name ?? '—'

  const inRange = (a: string, b: string) => (!from || b >= from) && (!to || a <= to)

  const filteredInc = useMemo(
    () =>
      incidencias
        .filter((i) => (status === 'all' ? true : i.status === status))
        .filter((i) => (type === 'all' ? true : i.type === type))
        .filter((i) => (employeeId === 'all' ? true : i.employeeId === employeeId))
        .filter((i) => inRange(i.from, i.to))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incidencias, status, type, employeeId, from, to],
  )

  const filteredCor = useMemo(
    () =>
      corrections
        .filter((c) => (status === 'all' ? true : c.status === status))
        .filter((c) => (employeeId === 'all' ? true : c.employeeId === employeeId))
        .filter((c) => inRange(c.date, c.date))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corrections, status, employeeId, from, to],
  )

  const pendingInc = incidencias.filter((i) => i.status === 'pending').length
  const pendingCor = corrections.filter((c) => c.status === 'pending').length
  const tab = params.get('tab') === 'correcciones' && canSeeCor ? 'correcciones' : 'incidencias'

  const statusOptions = [
    { value: 'all', label: 'Todos los estados' },
    ...(Object.keys(INCIDENCIA_STATUS_META) as IncidenciaStatus[])
      .filter((s) => tab === 'incidencias' || s !== 'corrected')
      .map((s) => ({ value: s, label: INCIDENCIA_STATUS_META[s].label })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incidencias y correcciones"
        description="Revisa retardos, faltas, permisos y solicitudes de corrección de asistencia."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            Nueva incidencia
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            value={employeeId}
            onValueChange={setEmployeeId}
            options={[
              { value: 'all', label: 'Todos los empleados' },
              ...accessibleEmployees
                .slice()
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
                .map((e) => ({ value: e.id, label: e.fullName })),
            ]}
          />
          <Select value={status} onValueChange={setStatus} options={statusOptions} />
          {tab === 'incidencias' ? (
            <Select
              value={type}
              onValueChange={setType}
              options={[
                { value: 'all', label: 'Todos los tipos' },
                ...INCIDENCIA_TYPES.map((t) => ({ value: t, label: INCIDENCIA_META[t].label })),
              ]}
            />
          ) : (
            <div className="hidden lg:block" />
          )}
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setParams(v === 'incidencias' ? {} : { tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="incidencias">
            Incidencias
            {pendingInc > 0 ? <Badge variant="warning" className="ml-2">{pendingInc}</Badge> : null}
          </TabsTrigger>
          {canSeeCor ? (
            <TabsTrigger value="correcciones">
              Solicitudes de corrección
              {pendingCor > 0 ? <Badge variant="warning" className="ml-2">{pendingCor}</Badge> : null}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="incidencias">
          {filteredInc.length === 0 ? (
            <EmptyState
              icon={FileWarning}
              title="Sin incidencias"
              description="No hay incidencias que coincidan con los filtros."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="hidden lg:table-cell">Descripción</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden xl:table-cell">Creó · Revisó</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInc.map((i) => {
                    const emp = empById.get(i.employeeId)
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="flex min-w-[190px] items-center gap-3">
                            <Avatar name={emp?.fullName ?? '?'} size="sm" />
                            <div>
                              <p className="text-sm font-medium">{emp?.fullName ?? 'Empleado'}</p>
                              <p className="text-xs text-muted-foreground">{emp?.employeeNumber}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <IncidenciaBadge type={i.type} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {i.from === i.to
                            ? formatShortDate(i.from)
                            : `${formatShortDate(i.from)} – ${formatShortDate(i.to)}`}
                        </TableCell>
                        <TableCell className="hidden max-w-[260px] truncate text-sm text-muted-foreground lg:table-cell">
                          {i.reason ?? '—'}
                        </TableCell>
                        <TableCell>
                          <IncidenciaStatusBadge status={i.status} />
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                          <p>
                            {userName(i.requestedById)} · {fmtStamp(i.createdAt)}
                          </p>
                          {i.reviewedByName ? (
                            <p>
                              {i.reviewedByName} · {fmtStamp(i.updatedAt)}
                              {i.reviewNote ? ` — ${i.reviewNote}` : ''}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {canReviewInc && i.status === 'pending' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" onClick={() => setIncReview({ item: i, status: 'approved' })}>
                                <Check className="h-3.5 w-3.5" />
                                Aprobar
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setIncReview({ item: i, status: 'rejected' })}
                              >
                                <X className="h-3.5 w-3.5" />
                                Rechazar
                              </Button>
                            </div>
                          ) : canReviewInc && i.status === 'approved' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setIncReview({ item: i, status: 'corrected' })}
                            >
                              Marcar corregida
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {canSeeCor ? (
          <TabsContent value="correcciones">
            {filteredCor.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Sin solicitudes"
                description="Cuando un empleado o supervisor solicite corregir un registro, aparecerá aquí."
              />
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Movimiento</TableHead>
                      <TableHead>Registrado → Solicitado</TableHead>
                      <TableHead className="hidden lg:table-cell">Motivo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden xl:table-cell">Resolución</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCor.map((c) => {
                      const emp = empById.get(c.employeeId)
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="flex min-w-[210px] items-center gap-3">
                              <Avatar name={emp?.fullName ?? '?'} size="sm" />
                              <div>
                                <p className="text-sm font-medium">{emp?.fullName ?? 'Empleado'}</p>
                                <p className="text-xs text-muted-foreground">
                                  Pidió {c.requestedByName} · {fmtStamp(c.createdAt)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{formatShortDate(c.date)}</TableCell>
                          <TableCell className="text-sm">{PUNCH_TYPE_LABEL[c.punchType]}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm tabular-nums">
                            <span className="text-muted-foreground">
                              {c.previousTime ? formatTime12(c.previousTime) : '—'}
                            </span>
                            <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold">{formatTime12(c.requestedTime)}</span>
                          </TableCell>
                          <TableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground lg:table-cell">
                            {c.reason}
                          </TableCell>
                          <TableCell>
                            <CorrectionStatusBadge status={c.status} />
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                            {c.reviewedByName ? (
                              <>
                                <p>
                                  {c.reviewedByName} · {fmtStamp(c.reviewedAt)}
                                </p>
                                {c.reviewNote ? <p>{c.reviewNote}</p> : null}
                              </>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canReviewCor &&
                            c.status === 'pending' &&
                            !(currentUser.role === 'supervisor' && c.requestedById === currentUser.id) ? (
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" onClick={() => setCorReview({ item: c, decision: 'approved' })}>
                                  <Check className="h-3.5 w-3.5" />
                                  Aprobar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setCorReview({ item: c, decision: 'rejected' })}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Rechazar
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <IncidenciaFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ReviewDialog
        open={!!incReview}
        onOpenChange={(o) => !o && setIncReview(null)}
        title={
          incReview?.status === 'approved'
            ? 'Aprobar incidencia'
            : incReview?.status === 'rejected'
              ? 'Rechazar incidencia'
              : 'Marcar como corregida'
        }
        description={incReview ? `${empById.get(incReview.item.employeeId)?.fullName} · ${INCIDENCIA_META[incReview.item.type].label}` : undefined}
        noteLabel={incReview?.status === 'rejected' ? 'Motivo del rechazo' : 'Comentario'}
        noteRequired={incReview?.status === 'rejected'}
        confirmLabel={incReview?.status === 'rejected' ? 'Rechazar' : 'Confirmar'}
        destructive={incReview?.status === 'rejected'}
        onConfirm={(note) => {
          if (!incReview) return null
          try {
            reviewIncidencia(incReview.item.id, incReview.status, note, currentUser)
          } catch (e) {
            return e instanceof Error ? e.message : 'No se pudo completar.'
          }
          toast.success('Incidencia actualizada', INCIDENCIA_STATUS_META[incReview.status].label)
          return null
        }}
      />

      <ReviewDialog
        open={!!corReview}
        onOpenChange={(o) => !o && setCorReview(null)}
        title={corReview?.decision === 'approved' ? 'Aprobar corrección' : 'Rechazar corrección'}
        description={
          corReview
            ? `${empById.get(corReview.item.employeeId)?.fullName} · ${PUNCH_TYPE_LABEL[corReview.item.punchType]} → ${formatTime12(corReview.item.requestedTime)} — al aprobar, el registro se modifica y queda en auditoría.`
            : undefined
        }
        noteLabel={corReview?.decision === 'rejected' ? 'Motivo del rechazo' : 'Comentario'}
        noteRequired={corReview?.decision === 'rejected'}
        confirmLabel={corReview?.decision === 'approved' ? 'Aprobar y aplicar' : 'Rechazar'}
        destructive={corReview?.decision === 'rejected'}
        onConfirm={(note) => {
          if (!corReview) return null
          try {
            const failure = reviewCorrection(corReview.item.id, corReview.decision, note, currentUser)
            if (failure) return failure
          } catch (e) {
            return e instanceof Error ? e.message : 'No se pudo completar.'
          }
          toast.success(
            corReview.decision === 'approved' ? 'Corrección aplicada' : 'Solicitud rechazada',
            'Quedó registrado en auditoría.',
          )
          return null
        }}
      />
    </div>
  )
}
