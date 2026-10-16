import { useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  TriangleAlert,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { useToday } from '@/hooks/useToday'
import { useDataStore } from '@/store/dataStore'
import { useSyncStore } from '@/store/syncStore'
import { formatDuration } from '@/lib/utils'
import {
  PERIOD_KINDS,
  activePeriods,
  changedSince,
  checkReadiness,
  daysInRange,
  formatPeriod,
  lastFinishedPeriod,
  nextPeriod,
  previousPeriod,
  rangesOverlap,
  summarizePeriod,
  totalsOf,
  type PeriodKind,
  type PeriodRange,
} from '@/lib/payrollPeriod'
import { buildPayrollSheets, payrollFileName, payrollSummaryPayload } from '@/services/payrollExport'
import { downloadCSV, downloadWorkbook } from '@/services/exportService'
import type { PayrollEmployeeRow, PayrollPeriod } from '@/types'

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function PayrollPeriodPage() {
  const today = useToday()
  const online = useOnline()
  const pendingSync = useSyncStore((s) => s.pending)

  // This page works on the whole company (not the top-bar branch filter): a close freezes everyone.
  const company = useDataStore((s) => s.company)
  const employees = useDataStore((s) => s.employees)
  const attendance = useDataStore((s) => s.attendance)
  const schedules = useDataStore((s) => s.schedules)
  const branches = useDataStore((s) => s.branches)
  const incidencias = useDataStore((s) => s.incidencias)
  const corrections = useDataStore((s) => s.corrections)
  const periods = useDataStore((s) => s.payrollPeriods)
  const currentUser = useDataStore((s) => s.currentUser)
  const closePayrollPeriod = useDataStore((s) => s.closePayrollPeriod)
  const reopenPayrollPeriod = useDataStore((s) => s.reopenPayrollPeriod)

  const [kind, setKind] = useState<PeriodKind>('biweekly')
  const [range, setRange] = useState<PeriodRange>(() => lastFinishedPeriod('biweekly', today))
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenTarget, setReopenTarget] = useState<PayrollPeriod>()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const canReopen = currentUser.role === 'owner' || currentUser.role === 'admin'
  const restricted = currentUser.branchIds.length > 0

  const live = useMemo(
    () =>
      summarizePeriod({
        range,
        employees,
        records: attendance,
        schedules,
        incidencias,
        settings: company.attendanceSettings,
        branches,
        todayISO: today,
      }),
    [range, employees, attendance, schedules, incidencias, company.attendanceSettings, branches, today],
  )

  const closed = useMemo(
    () => activePeriods(periods).find((p) => p.from === range.from && p.to === range.to),
    [periods, range],
  )
  const crossing = useMemo(
    () => (closed ? undefined : activePeriods(periods).find((p) => rangesOverlap(p, range))),
    [periods, range, closed],
  )

  const rows: PayrollEmployeeRow[] = closed ? closed.summary : live.rows
  const totals = closed ? closed.totals : live.totals
  const drift = useMemo(() => (closed ? changedSince(closed.summary, live.rows) : []), [closed, live.rows])

  const readiness = useMemo(() => {
    const r = checkReadiness({
      range,
      todayISO: today,
      rows: live.rows,
      incidencias,
      corrections,
      employees,
      periods,
      pendingSync,
      online,
    })
    if (restricted) {
      r.blockers.unshift('Tu usuario solo ve algunas sucursales. Para cerrar un periodo necesitas ver toda la empresa.')
    }
    return r
  }, [range, today, live.rows, incidencias, corrections, employees, periods, pendingSync, online, restricted])

  const finished = range.to < today
  const history = useMemo(() => [...periods].sort((a, b) => b.closedAt.localeCompare(a.closedAt)), [periods])

  const exportInput = () => ({
    companyName: company.name,
    range,
    rows,
    records: attendance,
    incidencias,
    period: closed,
    generatedBy: currentUser.name,
  })
  const downloadExcel = () => {
    downloadWorkbook(buildPayrollSheets(exportInput()), payrollFileName(range))
    toast.success('Excel exportado', `${rows.length} empleados · ${formatPeriod(range)}`)
  }
  const downloadSummaryCsv = () => {
    downloadCSV(payrollSummaryPayload(exportInput()), payrollFileName(range))
    toast.success('CSV exportado', `${rows.length} empleados`)
  }

  const changeKind = (value: string) => {
    const next = value as PeriodKind
    setKind(next)
    setRange(lastFinishedPeriod(next, today))
  }

  const doClose = async () => {
    setBusy(true)
    try {
      await closePayrollPeriod(range, note, currentUser)
      toast.success('Periodo cerrado', formatPeriod(range))
      setCloseOpen(false)
      setNote('')
    } catch (e) {
      toast.error('No se pudo cerrar el periodo', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const doReopen = async () => {
    if (!reopenTarget) return
    setBusy(true)
    try {
      await reopenPayrollPeriod(reopenTarget.id, reason, currentUser)
      toast.success('Periodo reabierto', formatPeriod(reopenTarget))
      setReopenTarget(undefined)
      setReason('')
    } catch (e) {
      toast.error('No se pudo reabrir el periodo', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cierre de periodo"
        description="Revisa la quincena, expórtala para la nómina y ciérrala: nadie podrá cambiar sus checadas después."
      />

      {/* Which period */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Periodo anterior"
              onClick={() => setRange(previousPeriod(kind, range))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 px-1 text-center sm:min-w-[19rem]">
              <p className="text-base font-semibold leading-tight">{formatPeriod(range)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{daysInRange(range)} días</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Periodo siguiente"
              onClick={() => setRange(nextPeriod(kind, range))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40">
              <Select
                value={kind}
                onValueChange={changeKind}
                options={PERIOD_KINDS.map((k) => ({ value: k.value, label: k.label }))}
              />
            </div>
            {closed ? (
              <Badge variant="success">
                <Lock className="h-3 w-3" />
                Cerrado
              </Badge>
            ) : finished ? (
              <Badge variant="warning">Abierto</Badge>
            ) : (
              <Badge variant="muted">En curso</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status and actions */}
      {closed ? (
        <Card className="border-success/30">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="font-semibold">Periodo cerrado</p>
                <p className="text-sm text-muted-foreground">
                  Lo cerró {closed.closedByName || 'un administrador'} el {when(closed.closedAt)}. Sus checadas ya no se pueden
                  agregar, cambiar ni borrar.
                </p>
                {closed.note ? <p className="mt-1 text-sm">Nota: {closed.note}</p> : null}
              </div>
            </div>
            {drift.length > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Los números de hoy ya no coinciden con los que se cerraron ({drift.slice(0, 4).join(', ')}
                  {drift.length > 4 ? '…' : ''}). Pasa, por ejemplo, si después se aprobó una incidencia. Lo que se exporta es lo
                  cerrado; si hay que corregirlo, reabre el periodo y ciérralo de nuevo.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadExcel}>
                <FileSpreadsheet className="h-4 w-4" />
                Descargar Excel
              </Button>
              <Button variant="secondary" onClick={downloadSummaryCsv}>
                <FileText className="h-4 w-4" />
                CSV del resumen
              </Button>
              {canReopen ? (
                <Button variant="secondary" onClick={() => setReopenTarget(closed)}>
                  <LockOpen className="h-4 w-4" />
                  Reabrir…
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {crossing ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Estas fechas se cruzan con un periodo ya cerrado ({formatPeriod(crossing)}).
              </div>
            ) : null}

            {readiness.blockers.length === 0 && readiness.warnings.length === 0 ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <p className="font-semibold">Listo para cerrar</p>
                  <p className="text-sm text-muted-foreground">
                    No hay pendientes en este periodo. Revisa los números y ciérralo cuando quieras.
                  </p>
                </div>
              </div>
            ) : null}

            {readiness.blockers.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold">Antes de cerrar</p>
                <ul className="space-y-1.5">
                  {readiness.blockers.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {readiness.warnings.length > 0 ? (
              <ul className="space-y-1.5">
                {readiness.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-sm">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button disabled={readiness.blockers.length > 0} onClick={() => setCloseOpen(true)}>
                <Lock className="h-4 w-4" />
                Cerrar periodo…
              </Button>
              <Button variant="secondary" onClick={downloadExcel}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel (vista previa)
              </Button>
              <Button variant="secondary" onClick={downloadSummaryCsv}>
                <FileText className="h-4 w-4" />
                CSV del resumen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Empleados" value={String(totals.employees)} />
        <Stat label="Días trabajados" value={String(totals.daysWorked)} />
        <Stat label="Faltas" value={String(totals.absences)} tone={totals.absences > 0 ? 'bad' : undefined} />
        <Stat
          label="Horas extra"
          value={formatDuration(totals.overtimeMinutes)}
          hint={`${formatDuration(totals.overtimeDoubleMinutes)} dobles · ${formatDuration(totals.overtimeTripleMinutes)} triples`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen por empleado</CardTitle>
          <p className="text-sm text-muted-foreground">
            {closed ? 'Números congelados al cerrar.' : 'Así quedaría el cierre con los datos de hoy.'} El Excel trae además el
            detalle día por día y las incidencias.
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No hay empleados con movimientos en este periodo.
            </p>
          ) : (
            <div className="space-y-2.5">
              {rows.map((r) => (
                <EmployeeCard key={r.employeeId} row={r} />
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Total: {formatDuration(totalsOf(rows).workedMinutes)} trabajadas en {rows.length}{' '}
                {rows.length === 1 ? 'empleado' : 'empleados'}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4" />
              Historial de cierres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold hover:underline"
                    onClick={() => setRange({ from: p.from, to: p.to })}
                  >
                    {formatPeriod(p)}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Cerrado por {p.closedByName || '—'} · {when(p.closedAt)}
                  </p>
                  {p.reopenedAt ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Reabierto por {p.reopenedByName || '—'} · {when(p.reopenedAt)} — {p.reopenReason}
                    </p>
                  ) : null}
                </div>
                {p.reopenedAt ? <Badge variant="muted">Reabierto</Badge> : <Badge variant="success">Cerrado</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Close dialog */}
      <Dialog open={closeOpen} onOpenChange={(o) => !busy && setCloseOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar el periodo del {formatPeriod(range)}</DialogTitle>
            <DialogDescription>
              Se guarda una copia de los números ({live.totals.employees} empleados) y se bloquean las checadas de esas fechas.
              Si después hay que corregir algo, un administrador puede reabrirlo.
            </DialogDescription>
          </DialogHeader>
          {readiness.warnings.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              {readiness.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-1.5">
            <Label>Nota (opcional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Revisado con contabilidad"
              rows={2}
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setCloseOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={doClose}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Cerrar periodo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog */}
      <Dialog open={!!reopenTarget} onOpenChange={(o) => !busy && !o && setReopenTarget(undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir el periodo</DialogTitle>
            <DialogDescription>
              {reopenTarget ? formatPeriod(reopenTarget) : ''}. Sus checadas volverán a poder editarse y queda registrado quién lo
              reabrió y por qué. Al terminar, ciérralo de nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Falta corregir la salida de un empleado"
              rows={2}
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setReopenTarget(undefined)}>
              Cancelar
            </Button>
            <Button disabled={busy || reason.trim().length < 5} onClick={doReopen}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
              Reabrir periodo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'bad' }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-destructive' : ''}`}>{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

function EmployeeCard({ row }: { row: PayrollEmployeeRow }) {
  const justified = row.vacationDays + row.sickDays + row.paidLeaveDays + row.unpaidLeaveDays
  const figures: Array<[string, string]> = [
    ['Días trabajados', String(row.daysWorked)],
    ['Faltas', String(row.absences)],
    ['Retardos', String(row.lates)],
    ['Horas trabajadas', formatDuration(row.workedMinutes)],
    ['Horas extra', row.overtimeMinutes > 0 ? `${formatDuration(row.overtimeDoubleMinutes)} / ${formatDuration(row.overtimeTripleMinutes)}` : '—'],
    [
      'Festivos',
      (row.holidaysWorked ?? 0) + (row.holidaysOff ?? 0) === 0
        ? '—'
        : [
            row.holidaysWorked ? `${row.holidaysWorked} trabajado${row.holidaysWorked === 1 ? '' : 's'} (doble)` : '',
            row.holidaysOff ? `${row.holidaysOff} descansado${row.holidaysOff === 1 ? '' : 's'}` : '',
          ]
            .filter(Boolean)
            .join(', '),
    ],
    [
      'Días justificados',
      justified === 0
        ? '—'
        : [
            row.vacationDays ? `${row.vacationDays} vac.` : '',
            row.sickDays ? `${row.sickDays} incap.` : '',
            row.paidLeaveDays ? `${row.paidLeaveDays} perm. c/g` : '',
            row.unpaidLeaveDays ? `${row.unpaidLeaveDays} perm. s/g` : '',
          ]
            .filter(Boolean)
            .join(', '),
    ],
  ]
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {row.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {row.number} · {row.department || 'Sin departamento'}
          </span>
        </p>
        <div className="flex gap-1.5">
          {row.absences > 0 ? <Badge variant="destructive">{row.absences} {row.absences === 1 ? 'falta' : 'faltas'}</Badge> : null}
          {row.incompleteDays > 0 ? <Badge variant="warning">Sin salida: {row.incompleteDays}</Badge> : null}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-2">
        {figures.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-[11px] font-medium text-muted-foreground">{label}</dt>
            <dd className="break-words text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
