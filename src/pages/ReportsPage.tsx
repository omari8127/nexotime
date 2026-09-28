import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, Printer, Upload } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { useScopedData } from '@/hooks/useScopedData'
import { REPORT_TYPES, buildFullAttendanceReport, buildReport } from '@/services/reportService'
import {
  buildWorkbookPayload,
  downloadCSV,
  downloadExcel,
  downloadWorkbook,
} from '@/services/exportService'
import { ImportCorrectionsDialog } from '@/components/attendance/ImportCorrectionsDialog'
import { INCIDENCIA_META, INCIDENCIA_TYPES } from '@/data/incidencias'
import { STATUS_LABEL } from '@/services/reportService'
import { useToday } from '@/hooks/useToday'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import type { ReportType } from '@/types'

export function ReportsPage() {
  const { employees, attendance, schedules, allBranches, incidencias } = useScopedData()
  const company = useDataStore((s) => s.company)
  const settings = company.attendanceSettings
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  const today = useToday()
  const [importOpen, setImportOpen] = useState(false)

  const [type, setType] = useState<ReportType>('attendance_general')
  // Default period: from the 1st of the current month up to today.
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`)
  const [to, setTo] = useState(today)
  const [branch, setBranch] = useState('all')
  const [department, setDepartment] = useState('all')
  const [employeeId, setEmployeeId] = useState('all')
  const [status, setStatus] = useState('all')
  const [incType, setIncType] = useState('all')

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees],
  )

  const scopedEmployees = useMemo(() => {
    const withIncType = new Set(
      incidencias.filter((i) => i.type === incType && i.to >= from && i.from <= to).map((i) => i.employeeId),
    )
    return employees
      .filter((e) => (branch === 'all' ? true : e.branchId === branch))
      .filter((e) => (department === 'all' ? true : e.department === department))
      .filter((e) => (employeeId === 'all' ? true : e.id === employeeId))
      .filter((e) => (incType === 'all' ? true : withIncType.has(e.id)))
  }, [employees, incidencias, branch, department, employeeId, incType, from, to])

  const recordBased = ['attendance_general', 'worked_hours', 'late_arrivals', 'overtime'].includes(type)
  const records = useMemo(
    () => (recordBased && status !== 'all' ? attendance.filter((r) => r.status === status) : attendance),
    [attendance, recordBased, status],
  )

  const result = useMemo(
    () =>
      buildReport(type, {
        records,
        employees: scopedEmployees,
        schedules,
        branches: allBranches,
        from,
        to,
        settings,
        incidencias,
        todayISO: today,
      }),
    [type, records, scopedEmployees, schedules, allBranches, from, to, settings, incidencias, today],
  )

  const payload = () =>
    buildWorkbookPayload(result.title, result.columns, result.rows, {
      periodo: `${from} a ${to}`,
      generado: new Date().toLocaleString('es-MX'),
    })

  const fileName = `nexotime-${type}-${from}_${to}`

  const downloadFullReport = () => {
    const sheets = buildFullAttendanceReport({
      records: attendance,
      employees: scopedEmployees,
      schedules,
      branches: allBranches,
      from,
      to,
      settings,
      incidencias,
      todayISO: today,
      companyName: company.name,
      generatedBy: currentUser.name,
    })
    downloadWorkbook(
      sheets.map((s) => buildWorkbookPayload(s.title, s.columns, s.rows, { periodo: `${from} a ${to}` })),
      `nexotime-reporte-completo-${from}_${to}`,
    )
    toast.success('Reporte completo exportado', `${sheets.length - 1} secciones en un solo Excel.`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Analiza y exporta la asistencia de tu empresa."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadFullReport}>
              <FileSpreadsheet className="h-4 w-4" />
              Reporte completo (Excel)
            </Button>
            {can('attendance.edit') ? (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Importar correcciones
              </Button>
            ) : null}
          </div>
        }
      />
      <ImportCorrectionsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        employees={scopedEmployees}
        attendance={attendance}
        from={from}
        to={to}
      />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tipo de reporte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {REPORT_TYPES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setType(r.value)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    type === r.value
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'hover:bg-secondary'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Periodo y filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Desde</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hasta</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sucursal</Label>
                <Select
                  value={branch}
                  onValueChange={setBranch}
                  options={[
                    { value: 'all', label: 'Todas' },
                    ...allBranches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Select
                  value={department}
                  onValueChange={setDepartment}
                  options={[
                    { value: 'all', label: 'Todos' },
                    ...departments.map((d) => ({ value: d, label: d })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Empleado</Label>
                <Select
                  value={employeeId}
                  onValueChange={setEmployeeId}
                  options={[
                    { value: 'all', label: 'Todos' },
                    ...employees
                      .slice()
                      .sort((a, b) => a.fullName.localeCompare(b.fullName))
                      .map((e) => ({ value: e.id, label: e.fullName })),
                  ]}
                />
              </div>
              {recordBased ? (
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={status}
                    onValueChange={setStatus}
                    options={[
                      { value: 'all', label: 'Todos' },
                      ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
                    ]}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>Tipo de incidencia</Label>
                <Select
                  value={incType}
                  onValueChange={setIncType}
                  options={[
                    { value: 'all', label: 'Cualquiera' },
                    ...INCIDENCIA_TYPES.map((t) => ({ value: t, label: INCIDENCIA_META[t].label })),
                  ]}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>{result.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.rows.length} filas · {from} a {to}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  downloadCSV(payload(), fileName)
                  toast.success('CSV exportado', `${result.rows.length} filas`)
                }}
              >
                <FileText className="h-4 w-4" />
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  downloadExcel(payload(), fileName)
                  toast.success('Excel exportado', `${result.rows.length} filas`)
                }}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[540px] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    {result.columns.map((c) => (
                      <TableHead key={c.key}>{c.header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.slice(0, 200).map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((c) => (
                        <TableCell key={c.key} className="whitespace-nowrap text-sm tabular-nums">
                          {String(row[c.key] ?? '—')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {result.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={result.columns.length} className="text-center text-sm text-muted-foreground">
                        Sin datos para el periodo seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
