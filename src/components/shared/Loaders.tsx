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
