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
import { buildEmployeeImportTemplate, parseEmployeeImportRows, type EmployeeImportResult } from '@/lib/employeeImport'
import { useDataStore } from '@/store/dataStore'
import { useScopedData } from '@/hooks/useScopedData'
import { useToday } from '@/hooks/useToday'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bulk employee alta: download a template (pre-filled with the company's own
 * sucursales/horarios as a guide), fill it in Excel, upload it back. Nothing is
 * created until "Importar" is confirmed on the preview.
 */
export function ImportEmployeesDialog({ open, onOpenChange }: Props) {
  const { allBranches, schedules } = useScopedData()
  const employees = useDataStore((s) => s.employees)
  const importEmployees = useDataStore((s) => s.importEmployees)
  const currentUser = useDataStore((s) => s.currentUser)
  const today = useToday()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<EmployeeImportResult | null>(null)
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
    downloadWorkbook(buildEmployeeImportTemplate({ branches: allBranches, schedules }), 'nexotime-plantilla-empleados')
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
      setResult(
        parseEmployeeImportRows(headers, records, {
          branches: allBranches,
          schedules,
          existingEmployeeNumbers: employees.map((e) => e.employeeNumber),
          todayISO: today,
        }),
      )
    } catch (e) {
      toast.error('No se pudo leer el archivo', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }

  const confirmImport = () => {
    if (!result) return
    const inputs = result.rows.filter((r) => r.input).map((r) => r.input!)
    if (inputs.length === 0) return
    setImporting(true)
    try {
      importEmployees(inputs, currentUser)
      toast.success('Empleados importados', `${inputs.length} ${inputs.length === 1 ? 'empleado nuevo' : 'empleados nuevos'}.`)
      close(false)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar empleados</DialogTitle>
          <DialogDescription>
            Da de alta a varios empleados a la vez desde un archivo Excel o CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3.5 text-sm">
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">1. Descarga la plantilla</p>
              <p className="text-muted-foreground">
                Trae los nombres de tus sucursales y horarios ya escritos en la hoja de instrucciones.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={downloadTemplate}>
              Descargar
            </Button>
          </div>

          <div className="rounded-lg border border-border p-3.5 text-sm">
            <p className="font-medium">2. Súbela ya llena</p>
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
                <Badge variant={result.validCount > 0 ? 'success' : 'muted'}>{result.validCount} listos para importar</Badge>
                {result.errorCount > 0 ? <Badge variant="warning">{result.errorCount} con errores</Badge> : null}
              </div>
              <div className="max-h-64 divide-y divide-border overflow-auto rounded-lg border border-border">
                {result.rows.map((r) => (
                  <div key={r.rowNumber} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                    {r.errors.length === 0 ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="text-xs text-muted-foreground">Fila {r.rowNumber} · </span>
                        {r.preview.name} <span className="text-muted-foreground">· {r.preview.number}</span>
                      </p>
                      {r.errors.length > 0 ? (
                        <p className="text-xs text-warning">{r.errors.join(' ')}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {r.preview.branch} · {r.preview.schedule}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmImport} disabled={!result || result.validCount === 0 || importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Importar {result && result.validCount > 0 ? `(${result.validCount})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
