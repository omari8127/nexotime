import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/** A green check that draws itself: the ring first, then the tick. */
export function AnimatedCheck({ className = 'h-20 w-20' }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 80 80"
      className={className}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      aria-hidden
    >
      <circle cx="40" cy="40" r="36" className="fill-success/10" />
      <motion.circle
        cx="40"
        cy="40"
        r="36"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-success"
        initial={{ pathLength: 0, rotate: -90 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        style={{ transformOrigin: '40px 40px' }}
      />
      <motion.path
        d="M25 41.5 L35.5 52 L56 30"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-success"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.35, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

/** "¡Guardado!" — a short, clear confirmation after something that changes records. */
export function SuccessDialog({
  open,
  onOpenChange,
  title = '¡Guardado!',
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center" hideClose>
        <div className="flex flex-col items-center gap-3 py-2">
          <AnimatedCheck />
          <motion.h2
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xl font-semibold tracking-tight"
          >
            {title}
          </motion.h2>
          {children ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-muted-foreground"
            >
              {children}
            </motion.div>
          ) : null}
          <Button variant="success" className="mt-2 min-w-24" autoFocus onClick={() => onOpenChange(false)}>
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
