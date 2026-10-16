import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { exitCodeProblem } from '@/lib/exitCode'

/**
 * A device that has just been turned into the company's clock still has the factory exit code (1234).
 * It cannot be skipped or closed: the clock does not open for the staff until the person who set the
 * tablet up chooses their own code. (It is shown only to someone who can change the company's settings;
 * the dedicated clock account cannot, and has no panel to protect anyway.)
 */
export function ExitCodeSetup({ open, onSave }: { open: boolean; onSave: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const problem = code || again ? exitCodeProblem(code, again) : null
  const ready = code.length > 0 && exitCodeProblem(code, again) === null

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-w-md" hideClose>
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle>Elige el código de salida de esta tablet</DialogTitle>
          <DialogDescription>
            Es lo único que separa a los empleados del panel de administración: se pide al tocar el logo 5 veces
            seguidas. Usa de 4 a 8 dígitos que no sean obvios y compártelo solo con quien administra la tablet.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) onSave(code)
          }}
        >
          <div className="space-y-1.5">
            <Label>Código nuevo</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Escríbelo otra vez</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={8}
              value={again}
              onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          </div>
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={!ready}>
            Guardar y abrir el reloj
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
