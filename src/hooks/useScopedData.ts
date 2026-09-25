import { useMemo } from 'react'
import { useDataStore } from '@/store/dataStore'
import { useUIStore } from '@/store/uiStore'
import { can } from '@/data/roles'
import { canAccessEmployee } from '@/lib/scope'
import type { Permission } from '@/types'

/**
 * Returns company data filtered to what the current user is allowed to see:
 *  - an employee sees only their own records
 *  - users with an empty `branchIds` see the whole company, otherwise only
 *    their assigned branches
 *  - supervisors with departments are limited to those departments too
 * The global branch selector then narrows further within that set.
 */
export function useScopedData() {
  const currentUser = useDataStore((s) => s.currentUser)
  const employees = useDataStore((s) => s.employees)
  const attendance = useDataStore((s) => s.attendance)
  const devices = useDataStore((s) => s.devices)
  const branches = useDataStore((s) => s.branches)
  const schedules = useDataStore((s) => s.schedules)
  const incidencias = useDataStore((s) => s.incidencias)
  const corrections = useDataStore((s) => s.corrections)
  const branchFilter = useUIStore((s) => s.branchFilter)

  return useMemo(() => {
    // Everyone this user is allowed to see, regardless of the top-bar branch filter.
    const accessibleEmployees = employees.filter((e) => canAccessEmployee(currentUser, e))
    const accessibleIds = new Set(accessibleEmployees.map((e) => e.id))

    const allowedBranchIds =
      currentUser.role === 'employee'
        ? new Set(accessibleEmployees.map((e) => e.branchId))
        : currentUser.branchIds.length > 0
          ? new Set(currentUser.branchIds)
          : new Set(branches.map((b) => b.id))

    const visibleBranches = branches.filter((b) => allowedBranchIds.has(b.id))

    const branchScope = (id: string) =>
      allowedBranchIds.has(id) && (branchFilter === 'all' || branchFilter === id)

    return {
      currentUser,
      schedules,
      branches: visibleBranches,
      allBranches: branches,
      accessibleEmployees,
      employees: accessibleEmployees.filter((e) => branchScope(e.branchId)),
      attendance: attendance.filter((r) => accessibleIds.has(r.employeeId) && branchScope(r.branchId)),
      devices: currentUser.role === 'employee' ? [] : devices.filter((d) => branchScope(d.branchId)),
      incidencias: incidencias.filter((i) => accessibleIds.has(i.employeeId)),
      corrections: corrections.filter((c) => accessibleIds.has(c.employeeId)),
      isBranchRestricted: currentUser.branchIds.length > 0,
    }
  }, [
    currentUser,
    employees,
    attendance,
    devices,
    branches,
    schedules,
    incidencias,
    corrections,
    branchFilter,
  ])
}

export function usePermission(permission: Permission): boolean {
  const role = useDataStore((s) => s.currentUser.role)
  return can(role, permission)
}

export function usePermissions() {
  const role = useDataStore((s) => s.currentUser.role)
  return useMemo(
    () => ({
      role,
      can: (permission: Permission) => can(role, permission),
    }),
    [role],
  )
}
