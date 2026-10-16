import { useMemo, useState } from 'react'
import { CalendarHeart, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { useToday } from '@/hooks/useToday'
import { WEEKDAY_LABEL, weekdayFromISO } from '@/lib/attendance'
import { customHolidayProblem, officialHolidays, suggestedHolidays } from '@/lib/holidays'
import { formatPeriod } from '@/lib/payrollPeriod'
import type { CompanyHoliday, HolidaySettings } from '@/types'

const dayText = (date: string) => `${WEEKDAY_LABEL[weekdayFromISO(date)]} ${formatPeriod({ from: date, to: date })}`

/**
 * Configuración → Días festivos: the days of rest by law (Art. 74 LFT) and the ones this company adds. A
 * holiday is not a falta; whoever works it is counted apart so it can be paid double (Art. 75 LFT).
 */
export function HolidaysPanel() {
  const settings = useDataStore((s) => s.company.attendanceSettings)
  const updateSettings = useDataStore((s) => s.updateSettings)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  const canManage = can('settings.manage')
  const today = useToday()

  const holidays: HolidaySettings = useMemo(() => settings.holidays ?? {}, [settings.holidays])
  const officialOn = holidays.official !== false
  const skipped = useMemo(() => new Set(holidays.skipped ?? []), [holidays.skipped])
  const custom = useMemo(() => holidays.custom ?? [], [holidays.custom])

  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const save = (next: HolidaySettings, message: string) => {
    updateSettings({ holidays: next }, currentUser)
    toast.success(message)
  }

  const official = officialHolidays(year)
  const customOfYear = custom.filter((c) => c.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date))
  const suggestions = suggestedHolidays(year).filter(
    (s) => !customOfYear.some((c) => c.date === s.date) && !official.some((o) => o.date === s.date && !skipped.has(o.date) && officialOn),
  )

  const add = (item: CompanyHoliday) => {
    const problem = customHolidayProblem(item.date, item.name, holidays)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    save({ ...holidays, custom: [...custom, { date: item.date, name: item.name.trim() }] }, 'Día festivo agregado')
    setDate('')
    setName('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarHeart className="h-4 w-4 text-primary" />
          Días festivos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Un festivo en un día laborable no cuenta como falta. Si alguien trabaja ese día, el cierre de periodo lo cuenta aparte
          para pagarlo doble (Art. 75 LFT).
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Descansar los días de la Ley Federal del Trabajo</p>
            <p className="text-xs text-muted-foreground">
              Año Nuevo, 5 de febrero, 21 de marzo, 1 de mayo, 16 de septiembre, 20 de noviembre y Navidad (y el 1 de octubre
              cada seis años). Los lunes ya vienen recorridos como marca la ley.
            </p>
          </div>
          <Switch
            checked={officialOn}
            disabled={!canManage}
            onCheckedChange={(value) =>
              save({ ...holidays, official: value }, value ? 'Se descansan los festivos de la ley' : 'Ya no se descansan los festivos de la ley')
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" aria-label="Año anterior" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-base font-semibold tabular-nums">{year}</p>
          <Button variant="secondary" size="sm" aria-label="Año siguiente" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {officialOn
            ? official.map((h) => {
                const observed = !skipped.has(h.date)
                return (
                  <div
                    key={h.date}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                  >
                    <div className={observed ? 'min-w-0' : 'min-w-0 opacity-50'}>
                      <p className="text-sm font-semibold">{h.name}</p>
                      <p className="text-xs text-muted-foreground">{dayText(h.date)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant="secondary">LFT</Badge>
                      <div className="flex items-center gap-2">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {observed ? 'Se descansa' : 'Se trabaja'}
                        </span>
                        <Switch
                          checked={observed}
                          disabled={!canManage}
                          aria-label={`Se descansa: ${h.name}`}
                          onCheckedChange={(value) =>
                            save(
                              {
                                ...holidays,
                                skipped: value ? (holidays.skipped ?? []).filter((d) => d !== h.date) : [...(holidays.skipped ?? []), h.date],
                              },
                              value ? `${h.name}: se descansa` : `${h.name}: se trabaja`,
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            : null}

          {customOfYear.map((c) => (
            <div key={c.date} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{dayText(c.date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant="default">De la empresa</Badge>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar ${c.name}`}
                    onClick={() => save({ ...holidays, custom: custom.filter((x) => x.date !== c.date) }, 'Día festivo quitado')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}

          {!officialOn && customOfYear.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Este año no hay días festivos. Agrega los de tu empresa abajo.
            </p>
          ) : null}
        </div>

        {canManage ? (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">Agregar un día de la empresa</p>
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Button key={s.date} variant="secondary" size="sm" onClick={() => add(s)}>
                    <Plus className="h-3.5 w-3.5" />
                    {s.name} · {s.date.slice(8)}/{s.date.slice(5, 7)}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Puente, aniversario de la empresa" maxLength={60} />
              </div>
              <Button onClick={() => add({ date, name })}>
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
