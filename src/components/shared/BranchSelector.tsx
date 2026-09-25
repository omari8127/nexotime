import { Building2, Check, ChevronDown } from 'lucide-react'
import { Dropdown, DropdownItem, DropdownLabel } from '@/components/ui/dropdown'
import { useUIStore } from '@/store/uiStore'
import { useScopedData } from '@/hooks/useScopedData'

export function BranchSelector() {
  const branchFilter = useUIStore((s) => s.branchFilter)
  const setBranchFilter = useUIStore((s) => s.setBranchFilter)
  const { allBranches, branches, isBranchRestricted } = useScopedData()

  const selectable = isBranchRestricted ? branches : allBranches
  const current =
    branchFilter === 'all'
      ? isBranchRestricted && branches.length === 1
        ? branches[0].name
        : 'Todas las sucursales'
      : (allBranches.find((b) => b.id === branchFilter)?.name ?? 'Todas las sucursales')

  return (
    <Dropdown
      align="end"
      className="w-60"
      trigger={
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-secondary"
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="max-w-[92px] truncate sm:max-w-[160px]">{current}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      }
    >
      <DropdownLabel>Sucursal</DropdownLabel>
      {!isBranchRestricted && (
        <DropdownItem onSelect={() => setBranchFilter('all')}>
          <span className="flex-1">Todas las sucursales</span>
          {branchFilter === 'all' && <Check className="h-4 w-4 text-primary" />}
        </DropdownItem>
      )}
      {selectable.map((b) => (
        <DropdownItem key={b.id} onSelect={() => setBranchFilter(b.id)}>
          <span className="flex-1">{b.name}</span>
          {branchFilter === b.id && <Check className="h-4 w-4 text-primary" />}
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
