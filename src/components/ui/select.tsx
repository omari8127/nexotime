import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options?: SelectOption[]
  onValueChange?: (value: string) => void
  placeholder?: string
}

/** Native select styled to match the design system. Reliable, accessible, no portal. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, onValueChange, placeholder, children, ...props }, ref) => (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-input bg-white text-foreground dark:bg-background pl-3 pr-9 text-sm shadow-xs',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        onChange={(e) => onValueChange?.(e.target.value)}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
)
Select.displayName = 'Select'
