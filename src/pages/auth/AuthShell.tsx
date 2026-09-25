import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { NexotimeLogo } from '@/components/shared/Logo'

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
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <motion.div
        initial={{ y: 10 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md"
      >
        <div className="mb-5 flex items-center justify-between">
          <NexotimeLogo tone="dark" />
          <Link
            to="/bienvenida"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>

          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </motion.div>
    </div>
  )
}
