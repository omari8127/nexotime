import { useEffect, useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { barcodeSvg, credentialValue, qrSvg } from '@/lib/credentials'
import { printCredentials } from '@/lib/credentialPrint'
import type { Employee } from '@/types'

/** The employee's credential: real QR + Code 128 barcode, printable as a CR80 badge. */
export function QrPreviewDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee
}) {
  const companyName = useDataStore((s) => s.company.name)
  const currentUser = useDataStore((s) => s.currentUser)
  const regenerate = useDataStore((s) => s.regenerateCredentials)
  const { can } = usePermissions()

  const qr = credentialValue(employee, 'qr')
  const bar = credentialValue(employee, 'barcode')
  const [qrMarkup, setQrMarkup] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (open && qr) {
      qrSvg(qr).then((svg) => {
        if (!cancelled) setQrMarkup(svg)
      })
    } else {
      setQrMarkup('')
    }
    return () => {
      cancelled = true
    }
  }, [open, qr])

  const print = async () => {
    const result = await printCredentials([employee], companyName)
    if (result === 'blocked') {
      toast.error('No se pudo abrir la impresión', 'Permite las ventanas emergentes para este sitio.')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Credencial de {employee.firstName}</DialogTitle>
            <DialogDescription>
              Código QR y código de barras únicos para registrar asistencia en el reloj checador.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4 text-slate-900">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {companyName}
              </p>
              <p className="mt-2 text-base font-semibold leading-tight">{employee.fullName}</p>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {employee.employeeNumber} · {employee.position}
              </p>
              {bar ? (
                <div
                  className="mt-auto pt-4 [&_svg]:h-auto [&_svg]:max-h-14 [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: barcodeSvg(bar, { height: 34 }) }}
                />
              ) : (
                <p className="mt-auto pt-4 text-xs text-slate-500">Código de barras desactivado</p>
              )}
            </div>
            {qr ? (
              <div
                className="h-32 w-32 shrink-0 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrMarkup }}
              />
            ) : (
              <p className="w-32 self-center text-center text-xs text-slate-500">
                Código QR desactivado
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            ¿Se perdió la credencial? Regenera los códigos: los anteriores dejan de funcionar al instante.
          </p>

          <DialogFooter>
            {can('employees.edit') ? (
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                <RefreshCw className="h-4 w-4" />
                Regenerar códigos
              </Button>
            ) : null}
            <Button onClick={print} disabled={!qr && !bar}>
              <Printer className="h-4 w-4" />
              Imprimir credencial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Regenerar los códigos de esta credencial?"
        description="La credencial impresa actual dejará de funcionar. Tendrás que imprimir una nueva."
        confirmLabel="Regenerar"
        destructive
        onConfirm={() => {
          try {
            regenerate(employee.id, currentUser)
            toast.success('Códigos regenerados', 'Imprime la nueva credencial.')
          } catch (e) {
            toast.error('No se pudo regenerar', e instanceof Error ? e.message : undefined)
          }
        }}
      />
    </>
  )
}
