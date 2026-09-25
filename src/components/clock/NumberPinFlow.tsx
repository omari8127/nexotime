import { useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Employee } from '@/types'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

export function NumberPinFlow({
  employees,
  onIdentified,
  onCancel,
}: {
  employees: Employee[]
  onIdentified: (employee: Employee) => void
  onCancel: () => void
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

  const title =
    step === 'number'
      ? 'Ingresa tu número de empleado'
      : `Hola ${candidate?.firstName}, ingresa tu PIN`
  const example = employees[0]?.employeeNumber ?? 'EMP-001'
  const exampleDigits = String(Number(example.replace(/\D/g, '')) || 1)

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
      const found = employees.find((e) => {
        const empDigits = e.employeeNumber.replace(/\D/g, '')
        return (
          e.employeeNumber.toLowerCase() === value.toLowerCase() ||
          empDigits === digits ||
          (digits !== '' && Number(empDigits) === Number(digits))
        )
      })
      if (!found) {
        setError('No se encontró ese número de empleado. No es tu PIN: el PIN se pide en el siguiente paso.')
        return
      }
      const pinEnabled = found.identifications.find((i) => i.method === 'pin')?.enabled
      if (pinEnabled && !found.pin) {
        // Never let someone in by number alone when the PIN is supposed to protect the punch.
        setError('Este empleado no tiene PIN configurado. Pide a RH que lo asigne.')
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
        setError('PIN incorrecto')
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
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Paso {step === 'number' ? '1' : '2'} de 2
        </p>
        <p className="text-lg font-medium">{title}</p>
        {step === 'number' ? (
          <p className="text-sm text-muted-foreground">
            Tu número de empleado, no tu PIN. Ejemplo: {example} → escribe {exampleDigits}.
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'flex h-16 w-full max-w-xs items-center justify-center rounded-lg border bg-white text-3xl font-semibold tracking-[0.3em]',
          error ? 'border-destructive' : 'border-slate-300',
        )}
      >
        {step === 'pin'
          ? '•'.repeat(value.length) || <span className="text-muted-foreground/40">••••</span>
          : value || <span className="text-muted-foreground/40 tracking-normal text-lg">Ej. 1, 2, 3…</span>}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="flex h-16 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            {key === 'back' ? (
              <Delete className="h-5 w-5" />
            ) : key === 'clear' ? (
              <span className="text-sm font-medium text-muted-foreground">C</span>
            ) : (
              key
            )}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-xs gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
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
        <Button size="lg" className="flex-1" disabled={!value} onClick={submit}>
          Continuar
        </Button>
      </div>
    </div>
  )
}
