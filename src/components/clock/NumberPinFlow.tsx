import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Delete } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KioskAlert } from '@/components/clock/KioskAlert'
import { cn } from '@/lib/utils'
import type { Employee } from '@/types'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
export function NumberPinFlow({
  employees,
  onIdentified,
  onCancel,
  steps = 2,
}: {
  employees: Employee[]
  onIdentified: (employee: Employee) => void
  onCancel: () => void
  /** 3 when a camera step follows the PIN (face check / entry photo), so the person knows what is next. */
  steps?: 2 | 3
}) {
  const [step, setStep] = useState<'number' | 'pin'>('number')
  const [value, setValueState] = useState('')
  // Mirror of `value` that is always current, so a fast typist's Enter never reads stale state.
  const valueRef = useRef('')
  const setValue = (next: string | ((v: string) => string)) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next
    valueRef.current = resolved
    setValueState(resolved)
  }
  const [candidate, setCandidate] = useState<Employee | null>(null)
  const [error, setError] = useState('')
  const [errorTick, setErrorTick] = useState(0)

  const title =
    step === 'number'
      ? 'Ingresa tu número de empleado'
      : `Hola ${candidate?.firstName}, ingresa tu PIN`
  const example = employees[0]?.employeeNumber ?? 'EMP-001'
  const exampleDigits = String(Number(example.replace(/\D/g, '')) || 1)

  const flagError = (message: string) => {
    setError(message)
    setErrorTick((t) => t + 1)
  }

  const press = (key: string) => {
    setError('')
    if (key === 'clear') return setValue('')
    if (key === 'back') return setValue((v) => v.slice(0, -1))
    setValue((v) => (v.length >= 8 ? v : v + key))
  }

  const submit = () => {
    const value = valueRef.current
    if (!value) return
    if (step === 'number') {
      const digits = value.replace(/\D/g, '')
      const matches = employees.filter((e) => {
        const empDigits = e.employeeNumber.replace(/\D/g, '')
        return (
          e.employeeNumber.toLowerCase() === value.toLowerCase() ||
          empDigits === digits ||
          (digits !== '' && Number(empDigits) === Number(digits))
        )
      })
      if (matches.length > 1) {
        flagError('Hay varios empleados con ese número abreviado. Pide a RH revisar la numeración o usa tu credencial.')
        return
      }
      const found = matches[0]
      if (!found) {
        flagError('No se encontró ese número de empleado. No es tu PIN: el PIN se pide en el siguiente paso.')
        return
      }
      const pinEnabled = found.identifications.find((i) => i.method === 'pin')?.enabled
      if (pinEnabled && !found.pin) {
        // Never let someone in by number alone when the PIN is supposed to protect the punch.
        flagError('Este empleado no tiene PIN configurado. Pide a RH que lo asigne.')
        return
      }
      if (pinEnabled) {
        setCandidate(found)
        setStep('pin')
        setValue('')
      } else {
        onIdentified(found)
      }
    } else if (candidate) {
      if (value === candidate.pin) {
        onIdentified(candidate)
      } else {
        flagError('PIN incorrecto')
        setValue('')
      }
    }
  }

  // Physical / on-screen keyboard: digits, Backspace, Enter, Escape. The latest
  // handlers are kept in a ref so the listener is attached only once.
  const handlers = useRef({ press, submit, onCancel })
  useEffect(() => {
    handlers.current = { press, submit, onCancel }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^\d$/.test(e.key)) handlers.current.press(e.key)
      else if (e.key === 'Backspace') handlers.current.press('back')
      else if (e.key === 'Delete') handlers.current.press('clear')
      else if (e.key === 'Enter') handlers.current.submit()
      else if (e.key === 'Escape') handlers.current.onCancel()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])


  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="space-y-2.5">
        <div className="flex items-center justify-center gap-1.5">
          <span className="h-1.5 w-9 rounded-full bg-primary" />
          <span className={cn('h-1.5 w-9 rounded-full transition-colors', step === 'pin' ? 'bg-primary' : 'bg-slate-200')} />
          {steps === 3 ? <span className="h-1.5 w-9 rounded-full bg-slate-200" /> : null}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Paso {step === 'number' ? '1' : '2'} de {steps}
        </p>
        <p className="text-xl font-semibold tracking-tight text-slate-900">{title}</p>
        {step === 'number' ? (
          <p className="text-sm text-muted-foreground">
            Tu número de empleado, no tu PIN. Ejemplo: {example} → escribe {exampleDigits}.
            {steps === 3 ? ' Después de tu PIN, la cámara comprobará que eres tú.' : ''}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'flex h-20 w-full max-w-xs items-center justify-center rounded-2xl border-2 bg-white shadow-sm transition-colors',
          error ? 'border-destructive bg-destructive/5' : 'border-slate-200',
        )}
      >
        {step === 'pin' ? (
          value ? (
            <div className="flex items-center gap-2.5">
              {Array.from(value).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  className="h-3.5 w-3.5 rounded-full bg-slate-900"
                />
              ))}
            </div>
          ) : (
            <span className="flex items-center gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-3.5 w-3.5 rounded-full border-2 border-slate-200" />
              ))}
            </span>
          )
        ) : value ? (
          <motion.span
            key={value.length}
            initial={{ scale: 0.85, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="text-4xl font-bold tabular-nums tracking-[0.2em] text-slate-900"
          >
            {value}
          </motion.span>
        ) : (
          <span className="text-lg tracking-normal text-muted-foreground/40">Ej. 1, 2, 3…</span>
        )}
      </div>

      {error ? (
        <div className="w-full max-w-md">
          <KioskAlert message={error} shakeKey={errorTick} />
        </div>
      ) : null}

      <div className="grid w-full max-w-xs grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <motion.button
            key={key}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => press(key)}
            className={cn(
              'flex h-[4.5rem] items-center justify-center rounded-2xl border text-2xl font-semibold shadow-sm transition-colors active:bg-slate-100',
              key === 'clear'
                ? 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
            )}
          >
            {key === 'back' ? (
              <Delete className="h-6 w-6" />
            ) : key === 'clear' ? (
              <span className="text-base font-semibold">C</span>
            ) : (
              key
            )}
          </motion.button>
        ))}
      </div>

      <div className="flex w-full max-w-xs gap-3">
        <Button
          variant="secondary"
          size="xl"
          className="flex-1 text-base"
          onClick={() => {
            if (step === 'pin') {
              setStep('number')
              setValue('')
              setCandidate(null)
            } else {
              onCancel()
            }
          }}
        >
          {step === 'pin' ? 'Atrás' : 'Cancelar'}
        </Button>
        <Button size="xl" className="flex-1 text-base" disabled={!value} onClick={submit}>
          Continuar
        </Button>
      </div>
    </div>
  )
}
