import { Fingerprint } from 'lucide-react'
import type { AttendanceRecord, Schedule } from '@/types'
import { PUNCH_TYPE_LABEL, scheduleDayFor, weekdayFromISO } from '@/lib/attendance'
import { METHOD_META, AttendanceStatusBadge } from '@/components/shared/badges'
import { formatDuration, formatTime12 } from '@/lib/utils'

export function AttendanceTimeline({
  record,
  schedule,
}: {
  record: AttendanceRecord
  schedule?: Schedule
}) {
  const day = schedule ? scheduleDayFor(schedule, weekdayFromISO(record.date)) : undefined
  const ordered = [...record.punches].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <div className="space-y-4">
      <ol className="relative space-y-4 border-l border-border pl-6">
        {ordered.length === 0 ? (
          <li className="text-sm text-muted-foreground">Sin registros para este día.</li>
        ) : (
          ordered.map((punch, i) => {
            const Method = METHOD_META[punch.method].Icon
            return (
              <li key={`${punch.type}-${i}`} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-primary bg-card" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold tabular-nums">{formatTime12(punch.time)}</span>
                  <span className="text-sm font-medium text-foreground">
                    {PUNCH_TYPE_LABEL[punch.type]}
                  </span>
                  {punch.edited ? (
                    <span className="text-xs text-warning">· ajuste manual</span>
                  ) : null}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Method className="h-3.5 w-3.5" />
                  Registrado mediante {METHOD_META[punch.method].label}
                </p>
              </li>
            )
          })
        )}
      </ol>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:grid-cols-4">
        <Metric label="Horas trabajadas" value={formatDuration(record.workedMinutes)} />
        <Metric
          label="Horario esperado"
          value={day ? `${formatTime12(day.entry)} – ${formatTime12(day.exit)}` : '—'}
        />
        <Metric
          label="Retardo"
          value={record.lateMinutes ? `${record.lateMinutes} min` : 'A tiempo'}
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Estado</p>
          <AttendanceStatusBadge status={record.status} />
        </div>
      </div>

      {record.note ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
          <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {record.note}
        </p>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
