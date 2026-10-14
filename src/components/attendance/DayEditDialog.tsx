import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, Plus, RotateCcw, SquarePen, Trash2, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AttendanceStatusBadge, METHOD_META } from '@/components/shared/badges'
import { SuccessDialog } from '@/components/shared/SuccessDialog'
import { useDataStore } from '@/store/dataStore'
import { useScopedData } from '@/hooks/useScopedData'
import { useToday } from '@/hooks/useToday'
import { PUNCH_ORDER, applyDayEdit, dayTimesOf, type DayTimes } from '@/lib/dayEdit'
import { PUNCH_STYLE } from '@/lib/punchStyle'
import { scheduleDayFor, weekdayFromISO } from '@/lib/attendance'
import { cn, formatLongDate, formatTime12 } from '@/lib/utils'
import type { PunchType } from '@/types'

/**
 * "Editar día completo": the four movements of one day on one screen, for when someone forgot to
 * check out, checked twice, or the day has to be captured by hand. Every save needs a reason and is
 * written to the audit log with the value before and after.
 *
 * Opened from a row it edits that day; with `pick` the administrator chooses the employee and the
 * date first (a day that has no record yet).
 */
export function DayEditDialog({
  open,
  onOpenChange,
  employeeId,
  date,
  pick = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId?: string
  date?: string
  pick?: boolean
}) {
  const today = useToday()
  const { employees, allBranches, schedules } = useScopedData()
  const attendance = useDataStore((s) => s.attendance)
  const editAttendanceDay = useDataStore((s) => s.editAttendanceDay)

  const sorted = useMemo(
    () => employees.filter((e) => e.status === 'active').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees],
  )
  const [empId, setEmpId] = useState(employeeId ?? '')
  const [day, setDay] = useState(date ?? today)
  /** Only what the administrator changed; everything else shows what is registered. */
  const [edits, setEdits] = useState<Partial<DayTimes>>({})
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ added: number; edited: number; removed: number } | null>(null)

  const employee = employees.find((e) => e.id === empId)
  const record = useMemo(
    () => attendance.find((r) => r.employeeId === empId && r.date === day),
    [attendance, empId, day],
  )
  const original = useMemo(() => dayTimesOf(record?.punches ?? []), [record])
  const times: DayTimes = useMemo(() => ({ ...original, ...edits }), [original, edits])

  // Whenever the dialog opens (or another person/day is picked) start from what is registered.
  useEffect(() => {
    if (!open) return
    setEmpId(employeeId ?? (pick ? (sorted[0]?.id ?? '') : ''))
    setDay(date ?? today)
    setEdits({})
    setReason('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, date])

  const preview = useMemo(() => applyDayEdit(record?.punches ?? [], times), [record, times])
  const dirty = !('error' in preview) && preview.changes.length > 0
  const schedule = schedules.find((s) => s.id === employee?.scheduleId)
  const planned = schedule && day ? scheduleDayFor(schedule, weekdayFromISO(day)) : undefined
  /** The hour proposed when adding a movement: the one in the person's schedule for that day. */
  const suggested: Record<PunchType, string> = {
    entry: planned?.entry ?? '09:00',
    lunch_out: planned?.lunchOut ?? '14:00',
    lunch_in: planned?.lunchIn ?? '15:00',
    exit: planned?.exit ?? '18:00',
  }

  const set = (type: PunchType, value: string | null) => {
    setEdits((e) => ({ ...e, [type]: value }))
    setError(null)
  }

  const save = () => {
    if (!employee) {
      setError('Elige un empleado.')
      return
    }
    if ('error' in preview) {
      setError(preview.error)
      return
    }
    try {
      const result = editAttendanceDay({ employeeId: employee.id, date: day, times, reason })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      setSaved(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  const branch = allBranches.find((b) => b.id === employee?.branchId)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl" hideClose>
          <div className="-mx-6 -mt-6 mb-4 flex items-center gap-3.5 rounded-t-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-6 py-4 text-white">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <SquarePen className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">Editar día completo</h2>
              <p className="truncate text-xs text-white/85">
                {employee ? employee.fullName : 'Elige al empleado'}
                {day ? ` | ${formatLongDate(new Date(`${day}T00:00:00`))}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Cerrar"
              className="rounded-md p-1.5 text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {pick ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <div className="space-y-1.5">
                <Label>Empleado</Label>
                <Select
                  value={empId}
                  onValueChange={(id) => {
                    setEmpId(id)
                    setEdits({})
                  }}
                  options={sorted.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.employeeNumber}` }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Día</Label>
                <Input type="date" value={day} max={today} onChange={(e) => {
                    setDay(e.target.value || today)
                    setEdits({})
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="font-semibold">Estado actual:</span>
              {record && record.punches.length > 0 ? (
                <AttendanceStatusBadge status={record.status} />
              ) : (
                <span className="text-muted-foreground">Sin checadas</span>
              )}
            </span>
            <span>
              <span className="font-semibold">Sucursal:</span>{' '}
              <span className="text-muted-foreground">{branch?.name ?? '—'}</span>
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-center gap-2 bg-slate-800 px-3 py-2 text-xs font-semibold text-white">
              <span>Tipo</span>
              <span>Hora</span>
              <span className="hidden sm:block">Origen</span>
              <span className="w-[5.5rem] text-right">Acciones</span>
            </div>
            {PUNCH_ORDER.map((type) => {
              const style = PUNCH_STYLE[type]
              const value = times[type]
              const current = record?.punches.find((p) => p.type === type)
              const changed = value !== original[type]
              return (
                <div
                  key={type}
                  className={cn(
                    'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-center gap-2 border-t border-border px-3 py-2 transition-colors',
                    changed && 'bg-amber-400/10',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <style.Icon className={cn('h-4 w-4 shrink-0', style.text)} />
                    <span className="truncate">{style.label}</span>
                  </span>

                  <AnimatePresence mode="wait" initial={false}>
                    {value ? (
                      <motion.div key="time" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                        <Input
                          type="time"
                          value={value}
                          onChange={(e) => set(type, e.target.value || null)}
                          aria-label={`Hora de ${style.label}`}
                          className="h-8 w-full max-w-[8.5rem] tabular-nums"
                        />
                      </motion.div>
                    ) : (
                      <motion.span key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="text-sm text-muted-foreground">
                        {original[type] ? `Se elimina (${formatTime12(original[type])})` : 'Sin registro'}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <span className="hidden truncate text-xs text-muted-foreground sm:block">
                    {changed ? 'Ajuste manual' : current ? METHOD_META[current.method].label : '—'}
                  </span>

                  <span className="flex w-[5.5rem] justify-end gap-1">
                    {value ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        title={`Quitar ${style.label.toLowerCase()}`}
                        aria-label={`Quitar ${style.label.toLowerCase()}`}
                        onClick={() => set(type, null)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" className="h-8 px-2.5" onClick={() => set(type, original[type] ?? suggested[type])}>
                        {original[type] ? <RotateCcw className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {original[type] ? 'Deshacer' : 'Agregar'}
                      </Button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

          {planned?.enabled ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Horario de ese día: {formatTime12(planned.entry)} a {formatTime12(planned.exit)}
              {planned.lunchOut && planned.lunchIn ? ` · comida ${formatTime12(planned.lunchOut)} a ${formatTime12(planned.lunchIn)}` : ''}
            </p>
          ) : null}

          <div className="mt-4 space-y-1.5">
            <Label>Motivo del cambio</Label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
              placeholder="Ej. Olvidó checar su salida; salió a las 6:00 p.m."
              rows={2}
              className="min-h-[60px]"
            />
            <p className="text-xs text-muted-foreground">
              Queda en Auditoría con tu usuario y el valor anterior y nuevo de cada hora.
            </p>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                className="mt-3 overflow-hidden rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="-mx-6 -mb-6 mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-6 py-3.5">
            <Button
              variant="secondary"
              disabled={!dirty && !error}
              onClick={() => {
                setEdits({})
                setError(null)
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button variant="success" disabled={!dirty || !employee} onClick={save}>
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SuccessDialog open={!!saved} onOpenChange={(o) => !o && setSaved(null)}>
        <p>Cambios aplicados:</p>
        <p className="mt-0.5">
          <b className="text-foreground">{saved?.added ?? 0}</b> agregados,{' '}
          <b className="text-foreground">{saved?.edited ?? 0}</b> editados,{' '}
          <b className="text-foreground">{saved?.removed ?? 0}</b> eliminados
        </p>
      </SuccessDialog>
    </>
  )
}
