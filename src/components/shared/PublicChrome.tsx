import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { NexotimeMark } from '@/components/shared/Logo'
import { LegalLinks } from '@/components/shared/LegalLinks'
import { copyrightLine } from '@/data/legal'
import { cn } from '@/lib/utils'

/**
 * The look of every page that is not the panel or the kiosk: the same as the welcome page. White,
 * slate text, the four colours of the day's movements as the thread, rounded white cards with a thin
 * ring. The shared form controls take their accent from `--primary`; here it is the same near-black the
 * welcome page uses for its buttons, scoped to this subtree so the panel keeps its own blue.
 */
export const PUBLIC_VARS = {
  '--primary': '222 47% 11%',
  '--primary-foreground': '0 0% 100%',
  '--ring': '215 20% 35%',
} as CSSProperties

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <NexotimeMark className="h-8 w-8" />
      <span className="text-[19px] font-bold leading-none tracking-[-0.03em] text-slate-900">Nexotime</span>
    </span>
  )
}

/** Entrada · comida · regreso · salida: the same four colours as the movements in the product. */
export function ColorStrip({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-1.5', className)} aria-hidden>
      <span className="flex-1 bg-emerald-500" />
      <span className="flex-1 bg-amber-400" />
      <span className="flex-1 bg-sky-500" />
      <span className="flex-1 bg-rose-500" />
    </div>
  )
}

/** Header and footer of the public pages (login, sign-up, activation, legal, 404, set-up). */
export function PublicPage({
  children,
  back = '/bienvenida',
  backLabel = 'Volver',
  mainClassName,
  actions,
}: {
  children: ReactNode
  back?: string
  backLabel?: string
  mainClassName?: string
  actions?: ReactNode
}) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-white font-sans text-slate-900 antialiased"
      style={PUBLIC_VARS}
    >
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link
            to="/bienvenida"
            aria-label="NEXOTIME, inicio"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
          >
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            {actions}
            <Link
              to={back}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 sm:text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className={cn('flex-1', mainClassName)}>{children}</main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <LegalLinks className="text-slate-500 hover:text-slate-900" />
          <p className="text-xs text-slate-500">{copyrightLine()}</p>
        </div>
      </footer>
    </div>
  )
}

/** Soft backdrop used behind the centered cards (login, sign-up, activation, 404, set-up). */
export const PUBLIC_BACKDROP =
  'bg-[radial-gradient(60%_50%_at_50%_0%,#f1f5f9_0%,rgba(255,255,255,0)_70%)]'
