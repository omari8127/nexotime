import type { ReactNode } from 'react'
import { NexotimeMark } from '@/components/shared/Logo'
import { Skeleton } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

/** Branded loader: the logo with a soft pulse and an indeterminate bar. Mirrors the
 *  boot screen in index.html so the hand-off to React is seamless. */
export function BrandLoader({ label = 'Cargando…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-5', className)}>
      <div className="relative">
        <span className="absolute inset-0 rounded-[14px] bg-primary/25 motion-safe:animate-ping" aria-hidden />
        <NexotimeMark className="relative h-14 w-14" />
      </div>
      <div className="h-[3px] w-28 overflow-hidden rounded-full bg-muted-foreground/20" aria-hidden>
        <div className="h-full w-[45%] rounded-full bg-primary motion-safe:animate-indeterminate" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <BrandLoader />
    </div>
  )
}

/** Stand-in for a page while its code downloads: same rhythm as a real page
 *  (title, a row of figures, a main block) so nothing jumps when it arrives. */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

export interface PreparingStep {
  label: string
  state: 'done' | 'working' | 'waiting'
}

/**
 * Full-screen "getting ready" cover for work that keeps the page busy for a moment (the face engine
 * compiling its GPU programs). Only CSS animations, which keep moving while the page is busy — a
 * JavaScript animation would freeze with it. It fades away on its own when `show` turns false.
 */
export function PreparingScreen({
  show,
  title,
  detail,
  steps,
  action,
}: {
  show: boolean
  title: string
  detail?: string
  steps?: PreparingStep[]
  /** Shown under the steps (e.g. "Continuar sin esperar"). */
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!show}
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-white/95 px-6 backdrop-blur-sm transition-opacity duration-500',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <BrandLoader label={title} />
        <p className="mt-6 text-xl font-semibold tracking-tight text-slate-900">{title}</p>
        {detail ? <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{detail}</p> : null}
        {steps?.length ? (
          <ul className="mt-6 w-full space-y-2 text-left">
            {steps.map((step) => (
              <li
                key={step.label}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                  step.state === 'done'
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                    : step.state === 'working'
                      ? 'border-slate-200 bg-white font-medium text-slate-900 shadow-sm'
                      : 'border-dashed border-slate-200 text-slate-400',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    step.state === 'done' && 'bg-emerald-500 text-white',
                    step.state === 'waiting' && 'border-2 border-slate-200',
                  )}
                  aria-hidden
                >
                  {step.state === 'done' ? (
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : step.state === 'working' ? (
                    <span className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-primary motion-safe:animate-spin" />
                  ) : null}
                </span>
                {step.label}
              </li>
            ))}
          </ul>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}
