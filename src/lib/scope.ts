import type { Employee, User } from '@/types'

/**
 * Whether `user` may see data about `employee`:
 *  - an employee only sees themselves
 *  - branch-restricted users only see their branches
 *  - supervisors with departments only see those departments
 * Used by the UI hooks *and* by the store's actions, so a permission is never
 * enforced only by hiding a button.
 */
export function canAccessEmployee(user: User, employee: Employee): boolean {
  if (user.role === 'employee') return user.employeeId === employee.id
  if (user.branchIds.length > 0 && !user.branchIds.includes(employee.branchId)) return false
  if (user.role === 'supervisor' && user.departments && user.departments.length > 0) {
    return user.departments.includes(employee.department)
  }
  return true
}
