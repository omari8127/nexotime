import { LockKeyhole, Monitor, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Asked once, on a device that opens the reloj checador signed in as someone who can administer: is this
 * the company's clock (then the panel is locked behind the exit code), or the administrator's own
 * computer? Until it is answered the device is treated as a normal computer.
 */
export function KioskSetupPrompt({
  open,
  usingDefaultCode,
  onKiosk,
  onPanel,
  onLater,
}: {
  open: boolean
  /** The exit code is still the factory one (1234): anyone who watched a checada could guess it. */
  usingDefaultCode: boolean
  onKiosk: () => void
  onPanel: () => void
  onLater: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : onLater())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Este equipo es el reloj checador?</DialogTitle>
          <DialogDescription>
            Este equipo tiene la sesión de un administrador abierta. Si es la tablet donde checa el personal,
            conviene que al abrir la app siempre llegue al reloj y que el panel solo se abra con el código de
            salida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button size="xl" className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left" onClick={onKiosk}>
            <LockKeyhole className="h-5 w-5 shrink-0" />
            <span>
              <span className="block font-semibold">Sí, es el reloj de la empresa</span>
              <span className="block text-xs font-normal opacity-90">
                Siempre abre en el reloj. El panel pide el código de salida y se vuelve a cerrar a los 15 minutos.
              </span>
            </span>
          </Button>
          <Button
            variant="secondary"
            size="xl"
            className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
            onClick={onPanel}
          >
            <Monitor className="h-5 w-5 shrink-0" />
            <span>
              <span className="block font-semibold">No, es mi computadora o solo estoy probando</span>
              <span className="block text-xs font-normal text-muted-foreground">
                El panel sigue abriéndose como siempre. Puedes cambiarlo en Configuración → Reloj checador.
              </span>
            </span>
          </Button>
        </div>

        {usingDefaultCode ? (
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            El código de salida sigue siendo el de fábrica (1234). Cámbialo en Configuración → Reloj checador.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
