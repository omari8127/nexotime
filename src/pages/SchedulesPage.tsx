import { useMemo, useState } from 'react'
import { CalendarPlus, Clock, PencilLine, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScheduleFormDialog } from '@/components/schedules/ScheduleFormDialog'
import { useScopedData, usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { WEEKDAY_SHORT, scheduledMinutesForDay } from '@/lib/attendance'
import { formatDuration, formatTime12 } from '@/lib/utils'
import type { Schedule } from '@/types'

export function SchedulesPage() {
  const schedules = useDataStore((s) => s.schedules)
  const { employees } = useScopedData()
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | undefined>()

  const countBySchedule = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of employees) map.set(e.scheduleId, (map.get(e.scheduleId) ?? 0) + 1)
    return map
  }, [employees])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Horarios"
        description="Gestiona las jornadas laborales de tu empresa."
        actions={
          can('schedules.manage') ? (
            <Button
              onClick={() => {
                setEditing(undefined)
                setOpen(true)
              }}
            >
              <CalendarPlus className="h-4 w-4" />
              Nuevo horario
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {schedules.map((s) => {
          const activeDays = s.days.filter((d) => d.enabled)
          const first = activeDays[0]
          const computed = s.days.reduce((a, d) => a + scheduledMinutesForDay(d), 0)
          return (
            <Card key={s.id}>
              <CardHeader className="space-y-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {activeDays.map((d) => WEEKDAY_SHORT[d.weekday]).join(' · ')}
                      </p>
                    </div>
                  </div>
                  {can('schedules.manage') ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(s)
                        setOpen(true)
                      }}
                    >
                      <PencilLine className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {first ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Row label="Entrada" value={formatTime12(first.entry)} />
                    <Row
                      label="Salida comida"
                      value={first.lunchOut ? formatTime12(first.lunchOut) : '—'}
                    />
                    <Row
                      label="Regreso"
                      value={first.lunchIn ? formatTime12(first.lunchIn) : '—'}
                    />
                    <Row label="Salida" value={formatTime12(first.exit)} />
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(computed)} / sem · objetivo {s.weeklyTargetHours} h
                  </span>
                  <Badge variant="secondary">
                    <Users className="h-3 w-3" />
                    {countBySchedule.get(s.id) ?? 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ScheduleFormDialog open={open} onOpenChange={setOpen} schedule={editing} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  )
}
