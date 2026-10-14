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
import { credentialFacts, printCredentials } from '@/lib/credentialPrint'
import type { Employee } from '@/types'

/** The employee's badge: real QR + Code 128 barcode, employee ID and RFC, printable in CR80 size. */
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
            <DialogTitle>Gafete de {employee.firstName}</DialogTitle>
            <DialogDescription>
              Así se imprime (tamaño tarjeta, vertical): el código QR grande arriba y debajo su RFC y su ID de empleado.
            </DialogDescription>
          </DialogHeader>

          {/* Same order and proportions as the printed card (54 × 85.6 mm). */}
          <div className="mx-auto flex aspect-[54/85.6] w-[236px] flex-col items-center rounded-xl border border-slate-300 bg-white px-4 pb-3 pt-4 text-center text-slate-900 shadow-md">
            <p className="w-full truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {companyName}
            </p>
            {qr ? (
              <div
                className="mt-2 h-[176px] w-[176px] shrink-0 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrMarkup }}
              />
            ) : (
              <p className="mt-2 flex h-[176px] w-[176px] items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                Código QR desactivado
              </p>
            )}
            <dl className="mt-2 w-full space-y-1">
              {credentialFacts(employee).map((f) => (
                <div key={f.label}>
                  <dt className="text-[8px] font-bold tracking-[0.14em] text-slate-500">{f.label}</dt>
                  <dd className="text-[17px] font-bold leading-tight tracking-wide tabular-nums">{f.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1.5 w-full truncate text-[11px] text-slate-600">{employee.fullName}</p>
            {bar ? (
              <div
                className="mt-auto w-full [&_svg]:h-auto [&_svg]:max-h-9 [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: barcodeSvg(bar, { height: 26 }) }}
              />
            ) : null}
          </div>

          {!employee.rfc && can('employees.edit') ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Este empleado no tiene RFC registrado: agrégalo desde «Editar» para que salga en el gafete.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            ¿Se perdió el gafete? Regenera los códigos: los anteriores dejan de funcionar al instante.
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
              Imprimir gafete
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
