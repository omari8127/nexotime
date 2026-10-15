import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Puts each column's title on its cells (`data-label`), so on a phone a row can show as a card of
 * "Título: valor" lines (see `.nx-stack` in index.css) instead of a table that has to be slid sideways.
 * Re-labels whenever rows change; a cell spanning the whole row (an empty-state message) gets no label.
 */
function useCellLabels(table: React.RefObject<HTMLTableElement | null>, enabled: boolean) {
  React.useLayoutEffect(() => {
    const el = table.current
    if (!el || !enabled) return
    const label = () => {
      const heads = [...el.querySelectorAll<HTMLTableCellElement>('thead tr:first-child > th')]
      const names = heads.flatMap((th) => Array<string>(th.colSpan || 1).fill(th.textContent?.trim() ?? ''))
      el.querySelectorAll<HTMLTableRowElement>('tbody > tr').forEach((tr) => {
        let column = 0
        for (const cell of Array.from(tr.cells)) {
          const name = cell.colSpan >= names.length ? '' : names[column]
          if (name) {
            if (cell.getAttribute('data-label') !== name) cell.setAttribute('data-label', name)
          } else if (cell.hasAttribute('data-label')) cell.removeAttribute('data-label')
          column += cell.colSpan || 1
        }
      })
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(el, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [table, enabled])
}

export function Table({
  className,
  stack = true,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  /** On phones, show each row as a card instead of a wide table (default). */
  stack?: boolean
}) {
  const ref = React.useRef<HTMLTableElement>(null)
  useCellLabels(ref, stack)
  return (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', stack && 'nx-stack', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-secondary/50 data-[state=selected]:bg-secondary',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-3 align-middle', className)} {...props} />
}
