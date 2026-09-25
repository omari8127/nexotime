import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsCtx {
  value: string
  setValue: (v: string) => void
}
const Ctx = React.createContext<TabsCtx | null>(null)

interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  className?: string
  children: React.ReactNode
}

export function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? '')
  const current = value ?? internal
  const setValue = (v: string) => {
    setInternal(v)
    onValueChange?.(v)
  }
  return (
    <Ctx.Provider value={{ value: current, setValue }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  )
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(Ctx)!
  const active = ctx.value === value
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-card text-foreground shadow-xs' : 'hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(Ctx)!
  if (ctx.value !== value) return null
  return <div className={cn('mt-4 focus-visible:outline-none', className)}>{children}</div>
}
