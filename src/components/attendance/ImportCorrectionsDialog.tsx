import { useRef, useState } from 'react'
import { CheckCircle2, Download, Loader2, TriangleAlert, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { downloadWorkbook } from '@/services/exportService'
import { readSpreadsheetRows, rowsToRecords } from '@/lib/spreadsheet'
import { buildCorrectionTemplate, formatChangeSummary, parseCorrectionRows, type CorrectionImportResult } from '@/lib/attendanceImport'
import { useDataStore } from '@/store/dataStore'
import type { AttendanceRecord, Employee } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: Employee[]
  attendance: AttendanceRecord[]
  from: string
  to: string
}

/**
 * Bulk attendance correction: download the period's punches already filled in,
 * edit only the wrong ones in Excel, re-upload. Blank cells are left untouched —
 * this can only ever set a punch to a new time, never delete one.
 */
export function ImportCorrectionsDialog({ open, onOpenChange, employees, attendance, from, to }: Props) {
  const importCorrections = useDataStore((s) => s.importAttendanceCorrections)
  const currentUser = useDataStore((s) => s.currentUser)
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<CorrectionImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  const reset = () => {
    setFileName('')
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }
  const close = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const downloadTemplate = () => {
    downloadWorkbook(buildCorrectionTemplate({ employees, attendance, from, to }), `nexotime-plantilla-correcciones-${from}_${to}`)
  }

  const handleFile = async (file: File) => {
    setLoading(true)
    setResult(null)
    setFileName(file.name)
    try {
      const rows = await readSpreadsheetRows(file)
      const { headers, records } = rowsToRecords(rows)
      if (records.length === 0) {
        toast.error('Archivo vacío', 'No se encontraron filas con datos.')
        return
      }
      setResult(parseCorrectionRows(headers, records, { employees, attendance }))
    } catch (e) {
      toast.error('No se pudo leer el archivo', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }

  const confirmImport = () => {
    if (!result) return
    const changes = result.rows.flatMap((r) => r.changes)
    if (changes.length === 0) return
    setImporting(true)
    try {
      const { applied, failed } = importCorrections(changes, currentUser)
      if (failed.length === 0) {
        toast.success('Correcciones aplicadas', `${applied} ${applied === 1 ? 'checada corregida' : 'checadas corregidas'}.`)
      } else {
        toast.error('Algunas correcciones no se aplicaron', `${applied} aplicadas, ${failed.length} con error.`)
      }
      close(false)
    } finally {
      setImporting(false)
    }
  }

  const rowsWithErrors = result?.rows.filter((r) => r.errors.length > 0) ?? []
  const rowsWithChanges = result?.rows.filter((r) => r.changes.length > 0) ?? []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar correcciones de asistencia</DialogTitle>
          <DialogDescription>
            Corrige varias checadas a la vez para el periodo {from} a {to}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3.5 text-sm">
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">1. Descarga la plantilla del periodo</p>
              <p className="text-muted-foreground">Ya trae las horas registradas. Cambia solo lo que esté mal.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={downloadTemplate}>
              Descargar
            </Button>
          </div>

          <div className="rounded-lg border border-border p-3.5 text-sm">
            <p className="font-medium">2. Súbela corregida</p>
            <p className="mt-1 text-muted-foreground">Formatos aceptados: .xlsx y .csv.</p>
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Elegir archivo
              </Button>
              {fileName ? <span className="truncate text-xs text-muted-foreground">{fileName}</span> : null}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
            </div>
          </div>

          {result ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={result.changeCount > 0 ? 'success' : 'muted'}>{result.changeCount} {result.changeCount === 1 ? 'cambio detectado' : 'cambios detectados'}</Badge>
                {result.errorRowCount > 0 ? <Badge variant="warning">{result.errorRowCount} filas con error</Badge> : null}
              </div>
              {result.changeCount === 0 && result.errorRowCount === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No hay diferencias con lo ya registrado.
                </p>
              ) : (
                <div className="max-h-64 divide-y divide-border overflow-auto rounded-lg border border-border">
                  {rowsWithErrors.map((r) => (
                    <div key={`e-${r.rowNumber}`} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="text-xs text-muted-foreground">Fila {r.rowNumber} · </span>
                          {r.preview.employee} · {r.preview.date}
                        </p>
                        <p className="text-xs text-warning">{r.errors.join(' ')}</p>
                      </div>
                    </div>
                  ))}
                  {rowsWithChanges.flatMap((r) => r.changes).map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <p className="min-w-0 flex-1 truncate">{formatChangeSummary(c)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmImport} disabled={!result || result.changeCount === 0 || importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Aplicar {result && result.changeCount > 0 ? `(${result.changeCount})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
