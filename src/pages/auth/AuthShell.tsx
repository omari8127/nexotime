import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { NexotimeLogo } from '@/components/shared/Logo'
import { BrandDarkBackdrop } from '@/components/shared/BrandDarkBackdrop'
import { LegalLinks } from '@/components/shared/LegalLinks'
import { copyrightLine } from '@/data/legal'

/**
 * Shell for the public login/signup pages. Like WelcomePage, it always uses
 * the dark brand palette instead of the saved light/dark theme — same first
 * impression for every visitor. The `dark` class is scoped to this subtree
 * (not applied to <html>) so the shared Input/Button/Label components pick
 * up their dark-mode colors here without changing the rest of the app.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      className="dark relative flex min-h-dvh items-center justify-center overflow-hidden bg-sidebar px-6 py-12 text-sidebar-foreground"
      // The dark theme lightens --primary for text on dark surfaces; buttons here need the stronger blue
      // so their white label keeps WCAG AA contrast (links on this dark shell use sky-300 instead).
      style={{ '--primary': '222 89% 55%' } as CSSProperties}
    >
      <BrandDarkBackdrop />
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="mb-5 flex items-center justify-between">
          <NexotimeLogo tone="light" />
          <Link
            to="/bienvenida"
            className="inline-flex items-center gap-1.5 text-[13px] text-sidebar-foreground/75 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-sidebar-foreground/75">{description}</p>

          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-sidebar-foreground/75">{footer}</div> : null}
        <div className="mt-6 flex flex-col items-center gap-2.5">
          <LegalLinks className="text-sidebar-foreground/70 hover:text-white" />
          <p className="text-center text-xs text-sidebar-foreground/75">{copyrightLine()}</p>
        </div>
      </motion.div>
    </div>
  )
}
