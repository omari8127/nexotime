import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label, Textarea } from '@/components/ui/input'

/** Asks for an (optionally required) note before confirming a decision. The
 *  caller returns an error message to keep the dialog open, or null when done. */
export function ReviewDialog({
  open,
  onOpenChange,
  title,
  description,
  noteLabel = 'Comentario',
  noteRequired = false,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  noteLabel?: string
  noteRequired?: boolean
  confirmLabel: string
  destructive?: boolean
  onConfirm: (note: string) => string | null
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNote('')
      setError(null)
    }
  }, [open])

  const confirm = () => {
    if (noteRequired && !note.trim()) {
      setError('Este campo es obligatorio.')
      return
    }
    const failure = onConfirm(note)
    if (failure) {
      setError(failure)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>
            {noteLabel}
            {noteRequired ? '' : ' (opcional)'}
          </Label>
          <Textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              setError(null)
            }}
            rows={3}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
