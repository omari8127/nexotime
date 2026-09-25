import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { useToday } from '@/hooks/useToday'
import { PUNCH_TYPE_LABEL } from '@/lib/attendance'
import { formatTime12 } from '@/lib/utils'
import type { PunchType } from '@/types'

const TYPES: PunchType[] = ['entry', 'lunch_out', 'lunch_in', 'exit']

/**
 * "Olvidé registrar mi salida": crea una solicitud de corrección para un día
 * (con o sin registro). No modifica la asistencia — solo un revisor autorizado
 * puede aprobarla.
 */
export function CorrectionRequestDialog({
  open,
  onOpenChange,
  employeeId,
  date: initialDate,
  type: initialType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  date?: string
  type?: PunchType
}) {
  const today = useToday()
  const attendance = useDataStore((s) => s.attendance)
  const currentUser = useDataStore((s) => s.currentUser)
  const submitCorrection = useDataStore((s) => s.submitCorrection)

  const [date, setDate] = useState(initialDate ?? today)
  const [type, setType] = useState<PunchType>(initialType ?? 'exit')
  const [time, setTime] = useState('17:00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const d = initialDate ?? today
    setDate(d)
    const record = attendance.find((r) => r.employeeId === employeeId && r.date === d)
    const missing = TYPES.find((t) => !record?.punches.some((p) => p.type === t))
    const t = initialType ?? missing ?? 'exit'
    setType(t)
    setTime(record?.punches.find((p) => p.type === t)?.time ?? '17:00')
    setReason('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate, initialType, employeeId])

  const record = attendance.find((r) => r.employeeId === employeeId && r.date === date)
  const current = record?.punches.find((p) => p.type === type)

  const submit = () => {
    try {
      const failure = submitCorrection({ employeeId, date, type, time, reason }, currentUser)
      if (failure) {
        setError(failure)
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud.')
      return
    }
    toast.success('Solicitud enviada', 'Te avisaremos cuando sea aprobada o rechazada.')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar corrección de asistencia</DialogTitle>
          <DialogDescription>
            Tu registro no cambia hasta que un revisor autorizado apruebe la solicitud.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => {
                  setDate(e.target.value)
                  setError(null)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Movimiento</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as PunchType)
                  setError(null)
                }}
                options={TYPES.map((t) => ({ value: t, label: PUNCH_TYPE_LABEL[t] }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Hora solicitada</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                setError(null)
              }}
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {PUNCH_TYPE_LABEL[type]}: {current ? formatTime12(current.time) : 'sin registro'}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{time ? formatTime12(time) : '—'}</span>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
              placeholder="Ej. Olvidé registrar mi salida."
              rows={3}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Enviar solicitud</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
