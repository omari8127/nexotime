import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}

const MenuCtx = React.createContext<{ close: () => void }>({ close: () => {} })

/** Room the menu needs to open downwards before we flip it above the trigger. */
const FLIP_THRESHOLD = 240

interface Position {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

/**
 * The menu is rendered in a portal on <body> with fixed positioning, so it is
 * never clipped by a scrollable ancestor (tables, cards, dialogs) and flips
 * above the trigger when there is no room below.
 */
export function Dropdown({ trigger, children, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<Position>({})
  const triggerRef = React.useRef<HTMLSpanElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const place = React.useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const next: Position =
      below < FLIP_THRESHOLD && r.top > below
        ? { bottom: window.innerHeight - r.top + 6 }
        : { top: r.bottom + 6 }
    if (align === 'end') next.right = Math.max(8, window.innerWidth - r.right)
    else next.left = Math.max(8, r.left)
    setPos(next)
  }, [align])

  React.useEffect(() => {
    if (!open) return
    place()
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onMove = () => setOpen(false) // a menu that drifts away from its button is worse than closing
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  return (
    <div className="relative inline-flex">
      <span
        ref={triggerRef}
        onClick={() => {
          if (!open) place()
          setOpen((o) => !o)
        }}
      >
        {trigger}
      </span>
      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ position: 'fixed', ...pos }}
              className={cn(
                'z-[70] min-w-[11rem] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
                className,
              )}
            >
              <MenuCtx.Provider value={{ close: () => setOpen(false) }}>{children}</MenuCtx.Provider>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

export function DropdownItem({
  className,
  onSelect,
  children,
  destructive,
  disabled,
}: {
  className?: string
  onSelect?: () => void
  children: React.ReactNode
  destructive?: boolean
  disabled?: boolean
}) {
  const { close } = React.useContext(MenuCtx)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onSelect?.()
        close()
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        'disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground',
        destructive
          ? 'text-destructive hover:bg-destructive/10 [&_svg]:text-destructive'
          : 'hover:bg-secondary',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{children}</div>
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border" />
}
