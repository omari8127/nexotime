import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Printer, ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AttendanceStatusBadge } from '@/components/shared/badges'
import { useDataStore } from '@/store/dataStore'
import { weekDates } from '@/lib/week'
import { calculateWeeklyHours } from '@/lib/attendance'
import { formatDuration, formatShortDate, formatTime12 } from '@/lib/utils'
import { buildWorkbookPayload, downloadCSV } from '@/services/exportService'
import { toast } from '@/components/ui/toast'
import { useToday } from '@/hooks/useToday'
import type { Employee } from '@/types'

/**
 * Documento de evidencia individual: entrada, salida, comida, horas
 * ordinarias/dobles/triples de un empleado en una semana — pensado para
 * mostrarse o entregarse ante un requerimiento de la STPS.
 */
export function LegalEvidenceDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee
}) {
  const company = useDataStore((s) => s.company)
  const branches = useDataStore((s) => s.branches)
  const schedules = useDataStore((s) => s.schedules)
  const attendance = useDataStore((s) => s.attendance)

  const today = useToday()
  const [weekAnchor, setWeekAnchor] = useState(today)

  const branch = branches.find((b) => b.id === employee.branchId)
  const schedule = schedules.find((s) => s.id === employee.scheduleId)

  const week = useMemo(() => weekDates(weekAnchor), [weekAnchor])
  const records = useMemo(
    () =>
      attendance
        .filter((r) => r.employeeId === employee.id && r.date >= week[0] && r.date <= week[6])
        .sort((a, b) => a.date.localeCompare(b.date)),
    [attendance, employee.id, week],
  )
  const totals = useMemo(
    () => calculateWeeklyHours(records, schedule?.weeklyTargetHours ?? company.weeklyTargetHours),
    [records, schedule, company.weeklyTargetHours],
  )

  const folio = `NXT-${employee.employeeNumber}-${week[0].replace(/-/g, '')}`

  const shiftWeek = (days: number) => {
    const d = new Date(`${weekAnchor}T00:00:00`)
    d.setDate(d.getDate() + days)
    setWeekAnchor(d.toISOString().slice(0, 10))
  }

  const exportCsv = () => {
    const payload = buildWorkbookPayload(
      'Evidencia de jornada',
      [
        { key: 'date', header: 'Fecha' },
        { key: 'entry', header: 'Entrada' },
        { key: 'lunchOut', header: 'Salida a comer' },
        { key: 'lunchIn', header: 'Entrada de comer' },
        { key: 'exit', header: 'Salida' },
        { key: 'ordinary', header: 'Horas ordinarias' },
        { key: 'overtime', header: 'Horas extra' },
        { key: 'status', header: 'Estado' },
      ],
      records.map((r) => {
        const p = (t: string) => r.punches.find((x) => x.type === t)?.time
        return {
          date: r.date,
          entry: p('entry') ? formatTime12(p('entry')) : '—',
          lunchOut: p('lunch_out') ? formatTime12(p('lunch_out')) : '—',
          lunchIn: p('lunch_in') ? formatTime12(p('lunch_in')) : '—',
          exit: p('exit') ? formatTime12(p('exit')) : '—',
          ordinary: formatDuration(Math.max(0, r.workedMinutes - r.overtimeMinutes)),
          overtime: r.overtimeMinutes ? formatDuration(r.overtimeMinutes) : '—',
          status: r.status,
        }
      }),
      {
        empresa: company.legalName,
        rfc: company.rfc,
        empleado: employee.fullName,
        numero: employee.employeeNumber,
        semana: `${formatShortDate(week[0])} - ${formatShortDate(week[6])}`,
        folio,
      },
    )
    downloadCSV(payload, `evidencia-jornada-${employee.employeeNumber}-${week[0]}`)
    toast.success('Evidencia exportada', folio)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Evidencia de jornada laboral
          </DialogTitle>
          <DialogDescription>
            Registro consultable para inspección de la autoridad laboral (Art. 132 fracc. XXXIV
            y Art. 66-68 LFT).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/30 p-4 sm:grid-cols-4">
            <Info label="Empresa" value={company.legalName} />
            <Info label="RFC" value={company.rfc} />
            <Info label="Empleado" value={`${employee.fullName} · ${employee.employeeNumber}`} />
            <Info label="Sucursal" value={branch?.name ?? '—'} />
            <Info label="Puesto" value={employee.position} />
            <Info label="Horario asignado" value={schedule?.name ?? '—'} />
            <Info label="Folio" value={folio} mono />
            <Info label="Generado" value={new Date().toLocaleString('es-MX')} />
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => shiftWeek(-7)}>
              <ChevronLeft className="h-4 w-4" />
              Semana anterior
            </Button>
            <p className="text-sm font-medium">
              Semana del {formatShortDate(week[0])} al {formatShortDate(week[6])}
            </p>
            <Button variant="ghost" size="sm" onClick={() => shiftWeek(7)}>
              Semana siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Comida</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Ordinarias</TableHead>
                  <TableHead>Extra</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Sin registros en esta semana.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => {
                    const p = (t: string) => r.punches.find((x) => x.type === t)?.time
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs font-medium">
                          {formatShortDate(r.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {p('entry') ? formatTime12(p('entry')) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {p('lunch_out') ? formatTime12(p('lunch_out')) : '—'}
                          {p('lunch_in') ? ` – ${formatTime12(p('lunch_in'))}` : ''}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {p('exit') ? formatTime12(p('exit')) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {formatDuration(Math.max(0, r.workedMinutes - r.overtimeMinutes))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {r.overtimeMinutes ? formatDuration(r.overtimeMinutes) : '—'}
                        </TableCell>
                        <TableCell>
                          <AttendanceStatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Total label="Ordinarias" value={formatDuration(totals.ordinaryMinutes)} />
            <Total
              label="Extra dobles (200%)"
              value={formatDuration(totals.overtimeDoubleMinutes)}
              accent="text-success"
            />
            <Total
              label="Extra triples (300%)"
              value={formatDuration(totals.overtimeTripleMinutes)}
              accent="text-warning"
            />
            <div className="flex flex-col items-start justify-center gap-1 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Cumplimiento</span>
              {totals.exceedsLegalLimit ? (
                <Badge variant="destructive">Revisar</Badge>
              ) : (
                <Badge variant="success">En regla</Badge>
              )}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Documento generado automáticamente a partir de los registros electrónicos de entrada,
            salida y periodo de comida capturados en el reloj checador NEXOTIME. Cada corrección
            manual queda trazada en el módulo de Auditoría con usuario, fecha, motivo y valores
            anterior/posterior. Este resumen es de carácter informativo y no sustituye asesoría
            legal.
          </p>
        </div>

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </Button>
          <Button onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-xs' : 'text-sm font-medium'}>{value}</p>
    </div>
  )
}

function Total({
  label,
  value,
  accent = 'text-foreground',
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}
