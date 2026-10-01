import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AttendanceRecord } from '@/types'
import { weekDates, dayLabel } from '@/lib/week'
import { useElementWidth } from '@/hooks/useElementWidth'
import { useToday } from '@/hooks/useToday'

export function WeeklyHoursChart({ records }: { records: AttendanceRecord[] }) {
  const today = useToday()
  const data = useMemo(() => {
    const week = weekDates(today)
    return week.map((iso) => {
      const dayRecords = records.filter((r) => r.date === iso)
      const worked = dayRecords.reduce((a, r) => a + r.workedMinutes, 0) / 60
      const scheduled = dayRecords.reduce((a, r) => a + r.scheduledMinutes, 0) / 60
      const overtime = dayRecords.reduce((a, r) => a + r.overtimeMinutes, 0) / 60
      const missing = Math.max(0, scheduled - worked)
      // Today's day is still open and future days haven't happened — show only
      // the planned hours for those, not worked / missing / overtime.
      const settled = iso < today
      return {
        day: dayLabel(iso),
        Programadas: Math.round(scheduled),
        Trabajadas: settled ? Math.round(worked) : null,
        Faltantes: settled ? Math.round(missing) : null,
        Extra: settled ? Math.round(overtime) : null,
        future: iso >= today,
      }
    })
  }, [records, today])

  const { ref, width } = useElementWidth<HTMLDivElement>()

  return (
    <div ref={ref} className="h-[280px] w-full">
      {width > 0 ? (
      <ComposedChart data={data} width={width} height={280} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v) => `${v}h`}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid hsl(var(--border))',
            fontSize: 13,
            boxShadow: '0 8px 24px -8px rgb(16 24 40 / 0.16)',
          }}
          formatter={((value: number, name: string) => [`${value} h`, name]) as never}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={30}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
          formatter={((value: string) => (
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>
          )) as never}
        />
        <Bar
          dataKey="Programadas"
          fill="hsl(var(--border))"
          radius={[3, 3, 0, 0]}
          maxBarSize={26}
          isAnimationActive={false}
        />
        <Bar
          dataKey="Trabajadas"
          fill="hsl(var(--primary))"
          radius={[3, 3, 0, 0]}
          maxBarSize={26}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.future ? 'hsl(var(--secondary))' : 'hsl(var(--primary))'} />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="Extra"
          stroke="hsl(var(--success))"
          strokeWidth={2}
          dot={{ r: 3, fill: 'hsl(var(--success))' }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="Faltantes"
          stroke="hsl(var(--warning))"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
      ) : null}
    </div>
  )
}
