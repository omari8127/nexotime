import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ColorStrip, PUBLIC_BACKDROP, PublicPage } from '@/components/shared/PublicChrome'
import { cn } from '@/lib/utils'

/**
 * Shell for the public login / sign-up / activation pages. Same look as the welcome page: white page,
 * a centered white card with a thin ring and the four-colour thread on top.
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
    <PublicPage mainClassName={cn('flex items-start justify-center px-5 py-10 sm:items-center sm:py-16', PUBLIC_BACKDROP)}>
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/[0.06] ring-1 ring-slate-200">
          <ColorStrip />
          <div className="p-7 sm:p-8">
            <h1 className="font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>

            <div className="mt-6">{children}</div>
          </div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-slate-600">{footer}</div> : null}
      </motion.div>
    </PublicPage>
  )
}
