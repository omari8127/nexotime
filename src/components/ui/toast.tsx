import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
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

/** A mistake has to be read and understood, so it stays longer than a confirmation. */
const DURATION_MS: Record<ToastVariant, number> = { success: 4500, info: 6000, error: 8000 }

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), DURATION_MS[t.variant])
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
  success: CircleCheck,
  error: TriangleAlert,
  info: Info,
}

/** Each kind has its own tint, border and icon disc: told apart at a glance, not by a thin edge. */
const STYLE: Record<ToastVariant, { box: string; disc: string }> = {
  success: { box: 'border-success/40 bg-success/10', disc: 'bg-success text-success-foreground shadow-success/30' },
  error: { box: 'border-destructive/40 bg-destructive/10', disc: 'bg-destructive text-destructive-foreground shadow-destructive/30' },
  info: { box: 'border-primary/40 bg-primary/10', disc: 'bg-primary text-primary-foreground shadow-primary/30' },
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore()
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2.5 px-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.variant]
          const style = STYLE[t.variant]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => dismiss(t.id)}
              className={cn(
                'pointer-events-auto flex w-full max-w-lg cursor-pointer items-start gap-3.5 rounded-2xl border-2 bg-card p-4 pr-3 shadow-xl backdrop-blur-sm',
                style.box,
              )}
              role={t.variant === 'error' ? 'alert' : 'status'}
            >
              <span
                className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md', style.disc)}
              >
                <Icon className="h-5 w-5" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-base font-semibold leading-snug text-foreground">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-[15px] leading-snug text-foreground/80">{t.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={(e) => {
                  e.stopPropagation()
                  dismiss(t.id)
                }}
                className="rounded-lg p-1.5 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
