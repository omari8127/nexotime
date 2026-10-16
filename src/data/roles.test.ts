import { describe, expect, it } from 'vitest'
import { ROLE_LIST, ROLES, can, homePathFor, isStaffRole } from '@/data/roles'
import type { Permission } from '@/types'

describe('cuenta dedicada del reloj checador', () => {
  it('solo puede usar el reloj: ningún permiso del panel', () => {
    expect(ROLES.kiosk.permissions).toEqual(['clock.use'])
    const panel: Permission[] = [
      'dashboard.view', 'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
      'attendance.view', 'attendance.edit', 'attendance.request_correction', 'schedules.view', 'schedules.manage',
      'branches.view', 'branches.manage', 'reports.view', 'reports.export', 'devices.view', 'devices.manage',
      'users.view', 'users.manage', 'audit.view', 'settings.view', 'settings.manage', 'incidencias.view',
      'incidencias.review', 'corrections.view', 'corrections.review', 'biometrics.manage', 'payroll.manage', 'self.view',
    ]
    for (const permission of panel) expect(can('kiosk', permission), permission).toBe(false)
    expect(can('kiosk', 'clock.use')).toBe(true)
  })

  it('al abrir la app cae en el reloj, nunca en el panel', () => {
    expect(homePathFor('kiosk')).toBe('/clock')
    expect(homePathFor('employee')).toBe('/mi-asistencia')
    expect(homePathFor('admin')).toBe('/')
  })

  it('no cuenta como personal del panel', () => {
    expect(isStaffRole('kiosk')).toBe(false)
    expect(isStaffRole('employee')).toBe(false)
    expect(isStaffRole('supervisor')).toBe(true)
  })

  it('ningún otro rol recibe el permiso del reloj por accidente', () => {
    for (const role of ROLE_LIST) {
      if (role.key !== 'kiosk') expect(role.permissions, role.key).not.toContain('clock.use')
    }
  })
})
