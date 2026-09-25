import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastStore {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'error' }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'info' }),
}

const ICONS = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

const ACCENT = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
}

/** Thin status bar on the left edge — the only colour the toast carries. */
const BAR = {
  success: 'bg-success',
  error: 'bg-destructive',
  info: 'bg-primary',
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore()
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.variant]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border border-border bg-card py-3 pl-4 pr-3 shadow-md"
              role={t.variant === 'error' ? 'alert' : 'status'}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', BAR[t.variant])} />
              <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', ACCENT[t.variant])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-5 text-foreground">{t.title}</p>
                {t.description ? (
                  <p className="text-[13px] leading-5 text-muted-foreground">{t.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
