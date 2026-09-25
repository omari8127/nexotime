import { beforeEach, describe, expect, it } from 'vitest'
import { can, ROLES } from '@/data/roles'
import { PermissionError, PunchError, useDataStore } from '@/store/dataStore'
import type { RoleKey, User } from '@/types'

const as = (role: RoleKey): User => ({ ...useDataStore.getState().currentUser, role })

describe('matriz de permisos', () => {
  it('solo propietario y administrador manejan datos biométricos', () => {
    expect(can('owner', 'biometrics.manage')).toBe(true)
    expect(can('admin', 'biometrics.manage')).toBe(true)
    for (const r of ['hr', 'supervisor', 'employee'] as const) expect(can(r, 'biometrics.manage')).toBe(false)
  })
  it('el empleado solo ve su propia asistencia', () => {
    expect(ROLES.employee.permissions).toEqual(expect.arrayContaining(['self.view']))
    for (const p of ['employees.view', 'reports.view', 'settings.manage', 'users.manage', 'audit.view'] as const) {
      expect(can('employee', p)).toBe(false)
    }
  })
  it('el supervisor consulta pero no edita empleados ni configuración', () => {
    expect(can('supervisor', 'employees.view')).toBe(true)
    expect(can('supervisor', 'employees.edit')).toBe(false)
    expect(can('supervisor', 'settings.manage')).toBe(false)
  })
  it('RRHH no administra usuarios ni configuración crítica', () => {
    expect(can('hr', 'employees.edit')).toBe(true)
    expect(can('hr', 'users.manage')).toBe(false)
    expect(can('hr', 'settings.manage')).toBe(false)
  })
})

describe('las acciones del store se protegen solas', () => {
  beforeEach(() => useDataStore.getState().switchToDemo?.())

  it('RRHH no puede registrar ni borrar un rostro aunque llame a la acción directamente', () => {
    const s = useDataStore.getState()
    const target = s.employees[0]
    const hr = as('hr')
    useDataStore.setState({ currentUser: hr })
    expect(() => s.enrollFace(target.id, [[0.1, 0.2]], hr)).toThrow(PermissionError)
    expect(() => s.removeFace(target.id, hr)).toThrow(PermissionError)
  })
  it('el administrador sí puede, y queda en auditoría', () => {
    const admin = as('admin')
    useDataStore.setState({ currentUser: admin })
    const s = useDataStore.getState()
    const target = s.employees[0]
    const before = s.audit.length
    s.enrollFace(target.id, [[0.1, 0.2], [0.3, 0.4]], admin)
    const after = useDataStore.getState()
    expect(after.audit.length).toBe(before + 1)
    expect(after.employees[0].identifications.find((i) => i.method === 'face')?.descriptors).toHaveLength(2)
    after.removeFace(target.id, admin)
    expect(useDataStore.getState().employees[0].identifications.find((i) => i.method === 'face')?.descriptors).toBeUndefined()
  })
  it('un supervisor no puede modificar la configuración', () => {
    const sup = as('supervisor')
    useDataStore.setState({ currentUser: sup })
    expect(() => useDataStore.getState().updateSettings({ trackLunch: false }, sup)).toThrow(PermissionError)
  })
  it('no se registra una checada imposible ni de un empleado inexistente', () => {
    const admin = as('admin')
    useDataStore.setState({ currentUser: admin })
    const s = useDataStore.getState()
    expect(() => s.registerPunch({ employeeId: 'no-existe', type: 'entry', time: '09:00', method: 'qr' })).toThrow(PunchError)
  })
})
