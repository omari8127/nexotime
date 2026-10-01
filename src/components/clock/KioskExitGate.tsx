import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Delete, LockKeyhole, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

/**
 * Hidden behind a long-press on the kiosk logo (there is no visible "exit" button —
 * the reloj checador is meant to stay open for employees). Only someone who knows
 * the code set in Configuración → Reloj checador can get back to the admin panel.
 */
export function KioskExitGate({
  open,
  expectedPin,
  onClose,
  onSuccess,
}: {
  open: boolean
  expectedPin: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [errorTick, setErrorTick] = useState(0)

  useEffect(() => {
    if (open) {
      setValue('')
      setError(false)
    }
  }, [open])

  const press = (key: string) => {
    setError(false)
    if (key === 'clear') return setValue('')
    if (key === 'back') return setValue((v) => v.slice(0, -1))
    setValue((v) => (v.length >= 8 ? v : v + key))
  }

  const submitRef = useRef<() => void>(() => {})
  submitRef.current = () => {
    if (!value) return
    if (value === expectedPin) {
      onSuccess()
    } else {
      setError(true)
      setErrorTick((t) => t + 1)
      setValue('')
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter') submitRef.current()
      else if (e.key === 'Escape') onClose()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs text-center" hideClose>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <p className="mt-3 text-base font-semibold text-slate-900">Código de salida</p>
        <p className="mt-1 text-sm text-muted-foreground">Solo el administrador puede salir del reloj checador.</p>

        <div
          className={cn(
            'mx-auto mt-4 flex h-14 w-full items-center justify-center rounded-xl border-2 bg-white',
            error ? 'border-destructive bg-destructive/5' : 'border-slate-200',
          )}
        >
          {value ? (
            <div className="flex items-center gap-2.5">
              {Array.from(value).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  className="h-3 w-3 rounded-full bg-slate-900"
                />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground/50">Ingresa el código</span>
          )}
        </div>

        {error ? (
          <motion.div
            key={errorTick}
            initial={{ x: 0 }}
            animate={{ x: [0, -6, 6, -4, 4, 0] }}
            transition={{ duration: 0.35 }}
            className="mx-auto mt-2.5 flex w-fit items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive"
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            Código incorrecto
          </motion.div>
        ) : null}

        <div className="mx-auto mt-4 grid max-w-[15rem] grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className={cn(
                'flex h-12 items-center justify-center rounded-lg border text-lg font-semibold active:bg-slate-100',
                key === 'clear'
                  ? 'border-slate-200 bg-slate-50 text-slate-500'
                  : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
              )}
            >
              {key === 'back' ? (
                <Delete className="h-5 w-5" />
              ) : key === 'clear' ? (
                <span className="text-sm font-medium">C</span>
              ) : (
                key
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={!value} onClick={() => submitRef.current()}>
            Entrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
