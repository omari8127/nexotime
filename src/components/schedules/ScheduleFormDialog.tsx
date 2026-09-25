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
import { Input, Label, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/switch'
import { WeeklyHoursPicker } from '@/components/shared/WeeklyHoursPicker'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import {
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  scheduledMinutesForDay,
} from '@/lib/attendance'
import { formatDuration } from '@/lib/utils'
import type { Schedule, ScheduleDay } from '@/types'

const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ea580c', '#16a34a']

function defaultDays(): ScheduleDay[] {
  return WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    enabled: weekday !== 'sat' && weekday !== 'sun',
    entry: '09:00',
    lunchOut: '14:00',
    lunchIn: '15:00',
    exit: '18:00',
  }))
}

export function ScheduleFormDialog({
  open,
  onOpenChange,
  schedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule?: Schedule
}) {
  const addSchedule = useDataStore((s) => s.addSchedule)
  const updateSchedule = useDataStore((s) => s.updateSchedule)
  const currentUser = useDataStore((s) => s.currentUser)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState(45)
  const [color, setColor] = useState(COLORS[0])
  const [days, setDays] = useState<ScheduleDay[]>(defaultDays())

  useEffect(() => {
    if (!open) return
    if (schedule) {
      setName(schedule.name)
      setDescription(schedule.description ?? '')
      setTarget(schedule.weeklyTargetHours)
      setColor(schedule.color)
      setDays(schedule.days.map((d) => ({ ...d })))
    } else {
      setName('')
      setDescription('')
      setTarget(45)
      setColor(COLORS[0])
      setDays(defaultDays())
    }
  }, [open, schedule])

  const computedWeekly = days.reduce((a, d) => a + scheduledMinutesForDay(d), 0)

  const patchDay = (weekday: string, patch: Partial<ScheduleDay>) =>
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))

  const save = () => {
    if (!name.trim()) {
      toast.error('Falta el nombre del horario')
      return
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      weeklyTargetHours: target,
      color,
      days,
    }
    if (schedule) {
      updateSchedule(schedule.id, payload, currentUser)
      toast.success('Horario actualizado', 'Se recalculó la asistencia asociada.')
    } else {
      addSchedule(payload, currentUser)
      toast.success('Horario creado', payload.name)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule ? 'Editar horario' : 'Nuevo horario'}</DialogTitle>
          <DialogDescription>
            Define la jornada por día. El objetivo semanal es configurable — no está fijo en 46 horas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Horario Administrativo" />
            </div>
            <div className="space-y-1.5">
              <Label>Horas semanales objetivo</Label>
              <WeeklyHoursPicker value={target} onChange={setTarget} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c ? 'scale-110 border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="hidden grid-cols-[110px_1fr_1fr_1fr_1fr] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
              <span>Día</span>
              <span>Entrada</span>
              <span>Salida comida</span>
              <span>Regreso</span>
              <span>Salida</span>
            </div>
            {days.map((d) => (
              <div
                key={d.weekday}
                className="grid grid-cols-2 items-center gap-2 rounded-lg bg-card p-2 sm:grid-cols-[110px_1fr_1fr_1fr_1fr]"
              >
                <label className="col-span-2 flex items-center gap-2 text-sm font-medium sm:col-span-1">
                  <Checkbox
                    checked={d.enabled}
                    onCheckedChange={(v) => patchDay(d.weekday, { enabled: v })}
                  />
                  {WEEKDAY_LABEL[d.weekday]}
                </label>
                <TimeCell value={d.entry} disabled={!d.enabled} onChange={(v) => patchDay(d.weekday, { entry: v })} />
                <TimeCell
                  value={d.lunchOut ?? ''}
                  disabled={!d.enabled}
                  onChange={(v) => patchDay(d.weekday, { lunchOut: v })}
                />
                <TimeCell
                  value={d.lunchIn ?? ''}
                  disabled={!d.enabled}
                  onChange={(v) => patchDay(d.weekday, { lunchIn: v })}
                />
                <TimeCell value={d.exit} disabled={!d.enabled} onChange={(v) => patchDay(d.weekday, { exit: v })} />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            <span>Horas calculadas por semana</span>
            <span className="font-semibold tabular-nums">
              {formatDuration(computedWeekly)}{' '}
              <span className="font-normal">· objetivo {target} h</span>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>{schedule ? 'Guardar cambios' : 'Crear horario'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TimeCell({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-8"
    />
  )
}
