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
import { usePermissions } from '@/hooks/useScopedData'
import { PUNCH_TYPE_LABEL } from '@/lib/attendance'
import { formatShortDate, formatTime12 } from '@/lib/utils'
import type { AttendanceRecord, Employee, PunchType } from '@/types'

const TYPES: PunchType[] = ['entry', 'lunch_out', 'lunch_in', 'exit']

/**
 * RH / administrador: corrige el registro directamente (queda en auditoría).
 * Supervisor: crea una solicitud de corrección que RH o un revisor autorizado
 * aprueba o rechaza — el registro no cambia hasta entonces.
 */
export function CorrectionDialog({
  open,
  onOpenChange,
  record,
  employee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: AttendanceRecord
  employee?: Employee
}) {
  const applyCorrection = useDataStore((s) => s.applyCorrection)
  const submitCorrection = useDataStore((s) => s.submitCorrection)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  const canEdit = can('attendance.edit')

  const [type, setType] = useState<PunchType>('exit')
  const [time, setTime] = useState('17:00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !record) return
    const missing = TYPES.find((t) => !record.punches.some((p) => p.type === t))
    setType(missing ?? 'exit')
    setTime(record.punches.find((p) => p.type === (missing ?? 'exit'))?.time ?? '17:00')
    setReason('')
    setError(null)
  }, [open, record])

  if (!record) return null

  const current = record.punches.find((p) => p.type === type)

  const submit = () => {
    if (!reason.trim()) {
      setError('Toda corrección debe incluir una justificación.')
      return
    }
    if (!time) {
      setError('Indica la hora correcta.')
      return
    }
    try {
      const failure = canEdit
        ? applyCorrection({ recordId: record.id, type, time, reason: reason.trim(), actor: currentUser })
        : submitCorrection(
            { employeeId: record.employeeId, date: record.date, type, time, reason },
            currentUser,
          )
      if (failure) {
        setError(failure)
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
      return
    }
    if (canEdit) toast.success('Corrección aplicada', 'El cambio quedó registrado en auditoría.')
    else toast.success('Solicitud enviada', 'Un revisor autorizado aprobará o rechazará la corrección.')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{canEdit ? 'Corregir registro' : 'Solicitar corrección'}</DialogTitle>
          <DialogDescription>
            {employee?.fullName} · {formatShortDate(record.date)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de registro</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as PunchType)
                setTime(record.punches.find((p) => p.type === v)?.time ?? time)
                setError(null)
              }}
              options={TYPES.map((t) => ({ value: t, label: PUNCH_TYPE_LABEL[t] }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Hora correcta</Label>
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
              {current ? formatTime12(current.time) : 'Sin registro'}
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
              placeholder="Ej. Olvidó registrar salida"
              rows={3}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {canEdit
              ? 'Se guardará el valor anterior, el nuevo valor, tu usuario y la fecha en el registro de auditoría.'
              : 'No se modifica el registro directamente: la solicitud queda pendiente hasta que un revisor autorizado la resuelva.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>{canEdit ? 'Guardar corrección' : 'Enviar solicitud'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
