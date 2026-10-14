import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Check, Hourglass, Plane, Search, Smartphone, TreePalm, X } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { IncidenciaStatusBadge } from '@/components/shared/badges'
import { IncidenciaFormDialog } from '@/components/attendance/IncidenciaFormDialog'
import { ReviewDialog } from '@/components/shared/ReviewDialog'
import { SuccessDialog } from '@/components/shared/SuccessDialog'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { useToday } from '@/hooks/useToday'
import { matchesEmployee } from '@/lib/punchLog'
import { countVacationDays, vacationBalance } from '@/lib/vacations'
import { cn, formatShortDate } from '@/lib/utils'
import type { Incidencia } from '@/types'

const fmtStamp = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const range = (i: Incidencia) =>
  i.from === i.to ? formatShortDate(i.from) : `${formatShortDate(i.from)} – ${formatShortDate(i.to)}`

/**
 * Vacaciones: lo que piden los empleados desde su portal llega aquí como "pendiente" y un revisor
 * lo aprueba o lo rechaza. Aprobadas, cuentan como ausencia justificada (no como falta).
 */
export function VacationsPage() {
  const { accessibleEmployees, incidencias, schedules } = useScopedData()
  const users = useDataStore((s) => s.users)
  const currentUser = useDataStore((s) => s.currentUser)
  const reviewIncidencia = useDataStore((s) => s.reviewIncidencia)
  const { can } = usePermissions()
  const canReview = can('incidencias.review')
  const today = useToday()

  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [review, setReview] = useState<{ item: Incidencia; status: 'approved' | 'rejected' } | null>(null)
  const [done, setDone] = useState<{ status: 'approved' | 'rejected'; name: string } | null>(null)

  const empById = useMemo(() => new Map(accessibleEmployees.map((e) => [e.id, e])), [accessibleEmployees])
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules])

  const vacations = useMemo(
    () =>
      incidencias
        .filter((i) => i.type === 'vacaciones')
        .filter((i) => {
          const emp = empById.get(i.employeeId)
          return !!emp && matchesEmployee(emp, query)
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [incidencias, empById, query],
  )
  const pending = vacations.filter((i) => i.status === 'pending')
  const resolved = vacations.filter((i) => i.status !== 'pending')
  const onVacationToday = vacations.filter((i) => i.status === 'approved' && today >= i.from && today <= i.to)
  const upcoming = vacations.filter((i) => i.status === 'approved' && i.from > today)

  const balances = useMemo(
    () =>
      accessibleEmployees
        .filter((e) => e.status === 'active' && matchesEmployee(e, query))
        .map((e) => ({ employee: e, balance: vacationBalance(e, incidencias, scheduleById.get(e.scheduleId), today) }))
        .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)),
    [accessibleEmployees, incidencias, scheduleById, today, query],
  )

  const days = (i: Incidencia) => {
    const emp = empById.get(i.employeeId)
    return countVacationDays(i.from, i.to, emp ? scheduleById.get(emp.scheduleId) : undefined)
  }
  const requester = (i: Incidencia) =>
    users.find((u) => u.id === i.requestedById)?.name ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vacaciones"
        description="Solicitudes de tu equipo y días disponibles de cada persona."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plane className="h-4 w-4" />
            Registrar vacaciones
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Hourglass} tone="bg-amber-400/15 text-amber-600 dark:text-amber-300" label="Por revisar" value={pending.length} />
        <Stat icon={TreePalm} tone="bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" label="De vacaciones hoy" value={onVacationToday.length} />
        <Stat icon={CalendarClock} tone="bg-sky-500/12 text-sky-600 dark:text-sky-300" label="Próximas aprobadas" value={upcoming.length} />
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o número de empleado" className="pl-9" />
      </div>

      <Tabs defaultValue="solicitudes">
        <TabsList>
          <TabsTrigger value="solicitudes">
            Solicitudes
            {pending.length > 0 ? <Badge variant="warning" className="ml-2">{pending.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="saldos">Días disponibles</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitudes" className="space-y-6">
          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold">Por revisar</h2>
            {pending.length === 0 ? (
              <EmptyState
                icon={Plane}
                title="Nada pendiente"
                description="Cuando alguien pida vacaciones desde el portal de empleados, la solicitud aparecerá aquí."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <AnimatePresence initial={false}>
                  {pending.map((i, index) => {
                    const emp = empById.get(i.employeeId)!
                    const balance = vacationBalance(emp, incidencias, scheduleById.get(emp.scheduleId), today)
                    const asks = days(i)
                    return (
                      <motion.div
                        key={i.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.22, delay: Math.min(index, 6) * 0.04 }}
                      >
                        <Card className="overflow-hidden">
                          <div className="flex items-start gap-3 p-4">
                            <Avatar name={emp.fullName} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{emp.fullName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {emp.employeeNumber} · {emp.position}
                              </p>
                            </div>
                            <IncidenciaStatusBadge status={i.status} />
                          </div>
                          <div className="flex items-center gap-3 border-y border-border bg-secondary/40 px-4 py-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-300">
                              <Plane className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{range(i)}</p>
                              <p className="text-xs text-muted-foreground">
                                {asks} {asks === 1 ? 'día laborable' : 'días laborables'}
                                {balance.entitled > 0 ? ` · le quedan ${balance.available} de ${balance.entitled}` : ' · aún no cumple un año'}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3 p-4">
                            {i.reason ? <p className="text-sm text-muted-foreground">«{i.reason}»</p> : null}
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {requester(i) ? null : <Smartphone className="h-3.5 w-3.5" />}
                              Pidió {requester(i) ?? 'el empleado, desde su portal'} · {fmtStamp(i.createdAt)}
                            </p>
                            {balance.entitled > 0 && asks > balance.available ? (
                              <p className="rounded-md bg-amber-400/15 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                                Pide más días de los que le quedan por ley este año.
                              </p>
                            ) : null}
                            {canReview ? (
                              <div className="flex gap-2">
                                <Button variant="success" className="flex-1" onClick={() => setReview({ item: i, status: 'approved' })}>
                                  <Check className="h-4 w-4" />
                                  Aprobar
                                </Button>
                                <Button variant="secondary" className="flex-1 text-destructive" onClick={() => setReview({ item: i, status: 'rejected' })}>
                                  <X className="h-4 w-4" />
                                  Rechazar
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </Card>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </section>

          {resolved.length > 0 ? (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold">Historial</h2>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Fechas</TableHead>
                      <TableHead className="text-center">Días</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden lg:table-cell">Revisó</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolved.map((i) => {
                      const emp = empById.get(i.employeeId)!
                      return (
                        <TableRow key={i.id}>
                          <TableCell>
                            <div className="flex min-w-[180px] items-center gap-3">
                              <Avatar name={emp.fullName} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{emp.fullName}</p>
                                <p className="text-xs text-muted-foreground">{emp.employeeNumber}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{range(i)}</TableCell>
                          <TableCell className="text-center text-sm font-semibold tabular-nums">{days(i)}</TableCell>
                          <TableCell>
                            <IncidenciaStatusBadge status={i.status} />
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                            {i.reviewedByName ? (
                              <>
                                {i.reviewedByName} · {fmtStamp(i.updatedAt)}
                                {i.reviewNote ? <span className="block">{i.reviewNote}</span> : null}
                              </>
                            ) : (
                              `Registró ${requester(i) ?? '—'}`
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Card>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="saldos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="hidden md:table-cell">Ingreso</TableHead>
                  <TableHead className="text-center">Antigüedad</TableHead>
                  <TableHead className="text-center">Por ley</TableHead>
                  <TableHead className="text-center">Tomados</TableHead>
                  <TableHead className="text-center">Disponibles</TableHead>
                  <TableHead className="hidden lg:table-cell">Año vacacional</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map(({ employee, balance }) => {
                  const used = balance.entitled > 0 ? Math.min(100, Math.round((balance.taken / balance.entitled) * 100)) : 0
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex min-w-[180px] items-center gap-3">
                          <Avatar name={employee.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{employee.fullName}</p>
                            <p className="text-xs text-muted-foreground">{employee.employeeNumber}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                        {new Date(`${employee.hireDate}T00:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {balance.yearsOfService} {balance.yearsOfService === 1 ? 'año' : 'años'}
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold tabular-nums">{balance.entitled}</TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {balance.taken}
                        {balance.pending > 0 ? <span className="text-xs text-warning"> +{balance.pending} pend.</span> : null}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-full px-2.5 text-xs font-semibold tabular-nums',
                            balance.entitled === 0
                              ? 'bg-muted text-muted-foreground'
                              : balance.available === 0
                                ? 'bg-rose-600 text-white'
                                : 'bg-emerald-600 text-white',
                          )}
                        >
                          {balance.entitled === 0 ? '—' : balance.available}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {balance.entitled > 0 ? (
                          <div className="min-w-[150px]">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className="h-full rounded-full bg-emerald-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${used}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatShortDate(balance.periodStart)} – {formatShortDate(balance.periodEnd)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Cumple un año el {formatShortDate(balance.nextAnniversary)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">
            Días por ley según el Art. 76 de la LFT (12 al cumplir un año, +2 por año hasta 20 y después +2 cada 5 años),
            contando solo los días que cada persona trabaja. Es una referencia: tu empresa puede otorgar más.
          </p>
        </TabsContent>
      </Tabs>

      <IncidenciaFormDialog open={formOpen} onOpenChange={setFormOpen} defaultType="vacaciones" />

      <ReviewDialog
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
        title={review?.status === 'approved' ? 'Aprobar vacaciones' : 'Rechazar vacaciones'}
        description={review ? `${empById.get(review.item.employeeId)?.fullName} · ${range(review.item)}` : undefined}
        noteLabel={review?.status === 'rejected' ? 'Motivo del rechazo' : 'Comentario para el empleado'}
        noteRequired={review?.status === 'rejected'}
        confirmLabel={review?.status === 'rejected' ? 'Rechazar' : 'Aprobar'}
        destructive={review?.status === 'rejected'}
        onConfirm={(note) => {
          if (!review) return null
          try {
            reviewIncidencia(review.item.id, review.status, note, currentUser)
          } catch (e) {
            return e instanceof Error ? e.message : 'No se pudo completar.'
          }
          setDone({ status: review.status, name: empById.get(review.item.employeeId)?.firstName ?? 'El empleado' })
          return null
        }}
      />

      <SuccessDialog
        open={!!done}
        onOpenChange={(o) => !o && setDone(null)}
        title={done?.status === 'approved' ? '¡Vacaciones aprobadas!' : 'Solicitud rechazada'}
      >
        {done?.status === 'approved'
          ? `${done.name} verá la aprobación en su portal. Esos días ya no cuentan como falta.`
          : `${done?.name} verá el motivo en su portal.`}
      </SuccessDialog>
    </div>
  )
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Plane
  tone: string
  label: string
  value: number
}) {
  return (
    <Card className="flex items-center gap-3.5 p-4">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  )
}
