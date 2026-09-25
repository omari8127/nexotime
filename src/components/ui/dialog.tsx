import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

interface DialogContentProps {
  children: React.ReactNode
  className?: string
  /** Hide the default close button (e.g. clock confirmations). */
  hideClose?: boolean
  onClose?: () => void
}

const DialogCtx = React.createContext<{ onOpenChange: (o: boolean) => void }>({
  onOpenChange: () => {},
})

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onOpenChange])

  return (
    <DialogCtx.Provider value={{ onOpenChange }}>
      {createPortal(
        <AnimatePresence>{open ? children : null}</AnimatePresence>,
        document.body,
      )}
    </DialogCtx.Provider>
  )
}

export function DialogContent({ children, className, hideClose, onClose }: DialogContentProps) {
  const { onOpenChange } = React.useContext(DialogCtx)
  const close = () => {
    onClose?.()
    onOpenChange(false)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-slate-950/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={close}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl',
          'max-h-[calc(100vh-2rem)] overflow-y-auto',
          className,
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      >
        {!hideClose && (
          <button
            type="button"
            onClick={close}
            className="absolute right-3.5 top-3.5 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </motion.div>
    </div>
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('-mx-6 -mt-6 mb-5 flex flex-col gap-1 rounded-t-xl border-b border-border px-6 pb-4 pt-5 pr-12', className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold leading-6 tracking-tight', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        '-mx-6 -mb-6 mt-6 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-secondary/40 px-6 py-3.5 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}
