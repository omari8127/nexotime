import type { ComponentType } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  icon: ComponentType<{ className?: string }>
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' }
  accent?: 'primary' | 'success' | 'warning' | 'destructive'
  index?: number
}

const ACCENT = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  destructive: 'bg-destructive/12 text-destructive',
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  accent = 'primary',
  index = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ y: 14 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', ACCENT[accent])}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </span>
          {trend ? (
            <span
              className={cn(
                'mb-1 inline-flex items-center gap-0.5 text-xs font-medium',
                trend.direction === 'up' && 'text-success',
                trend.direction === 'down' && 'text-destructive',
                trend.direction === 'neutral' && 'text-muted-foreground',
              )}
            >
              {trend.direction === 'up' && <ArrowUpRight className="h-3.5 w-3.5" />}
              {trend.direction === 'down' && <ArrowDownRight className="h-3.5 w-3.5" />}
              {trend.value}
            </span>
          ) : null}
        </div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </Card>
    </motion.div>
  )
}
