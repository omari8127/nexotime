import { useState } from 'react'
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
import { useScopedData } from '@/hooks/useScopedData'
import { INCIDENCIA_META, INCIDENCIA_TYPES } from '@/data/incidencias'
import { useToday } from '@/hooks/useToday'
import type { IncidenciaType } from '@/types'

export function IncidenciaFormDialog({
  open,
  onOpenChange,
  employeeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selecciona al empleado (p. ej. abierto desde su perfil). */
  employeeId?: string
}) {
  const { employees } = useScopedData()
  const addIncidencia = useDataStore((s) => s.addIncidencia)
  const currentUser = useDataStore((s) => s.currentUser)

  const [empId, setEmpId] = useState(employeeId ?? employees[0]?.id ?? '')
  const [type, setType] = useState<IncidenciaType>('permiso_con_goce')
  const today = useToday()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState('')

  const submit = () => {
    if (!empId) {
      toast.error('Selecciona un empleado')
      return
    }
    if (to < from) {
      toast.error('La fecha final no puede ser anterior a la inicial')
      return
    }
    const employee = employees.find((e) => e.id === empId)
    try {
      addIncidencia({ employeeId: empId, type, from, to, reason: reason.trim() || undefined }, currentUser)
    } catch (e) {
      toast.error('No se pudo registrar', e instanceof Error ? e.message : undefined)
      return
    }
    toast.success('Incidencia registrada', `${INCIDENCIA_META[type].label} · ${employee?.fullName}`)
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar incidencia</DialogTitle>
          <DialogDescription>
            Vacaciones, permisos e incapacidades aprobados quedan como ausencia justificada — no
            cuentan como falta ni disparan alertas. Las demás incidencias documentan el evento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!employeeId ? (
            <div className="space-y-1.5">
              <Label>Empleado</Label>
              <Select
                value={empId}
                onValueChange={setEmpId}
                options={employees
                  .slice()
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((e) => ({ value: e.id, label: `${e.fullName} · ${e.employeeNumber}` }))}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Tipo de incidencia</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as IncidenciaType)}
              options={INCIDENCIA_TYPES.map((t) => ({ value: t, label: INCIDENCIA_META[t].label }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Incapacidad temporal por enfermedad general (IMSS)"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
