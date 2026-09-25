import * as React from 'react'
import { cn, initials } from '@/lib/utils'

/* --------------------------------- Avatar -------------------------------- */

export function Avatar({
  name,
  src,
  className,
  size = 'md',
}: {
  name: string
  src?: string
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
    xl: 'h-20 w-20 text-xl',
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground',
        sizes[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}

/* -------------------------------- Progress ------------------------------- */

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number
  className?: string
  indicatorClassName?: string
}) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full bg-primary transition-all', indicatorClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

/* ------------------------------- Separator ------------------------------- */

export function Separator({
  className,
  orientation = 'horizontal',
}: {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}) {
  return (
    <div
      className={cn(
        'bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  )
}

/* -------------------------------- Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

/* -------------------------------- Tooltip -------------------------------- */

export function Tooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  )
}
