import { beforeEach, describe, expect, it } from 'vitest'
import { PermissionError, useDataStore } from '@/store/dataStore'
import type { RoleKey, User } from '@/types'

const as = (role: RoleKey, extra: Partial<User> = {}): User => ({
  ...useDataStore.getState().currentUser,
  role,
  ...extra,
})
const TIMES = { entry: '09:00', lunch_out: null, lunch_in: null, exit: '17:00' }
const RANGE = { from: '2026-07-01', to: '2026-07-15' }

describe('cierre de periodo en el store', () => {
  beforeEach(() => {
    useDataStore.getState().switchToDemo()
    useDataStore.setState({ currentUser: as('admin') })
  })

  it('cierra, guarda la copia y deja huella en la auditoría', async () => {
    const admin = as('admin')
    const before = useDataStore.getState().audit.length
    const period = await useDataStore.getState().closePayrollPeriod(RANGE, ' revisado ', admin)
    const s = useDataStore.getState()
    expect(s.payrollPeriods).toHaveLength(1)
    expect(period).toMatchObject({ from: RANGE.from, to: RANGE.to, note: 'revisado', closedByName: admin.name })
    expect(period.summary.length).toBe(period.totals.employees)
    expect(s.audit.length).toBe(before + 1)
    expect(s.audit[0].action).toBe('payroll.close')
  })

  it('no cierra un periodo que no ha terminado, ni uno repetido o cruzado', async () => {
    const admin = as('admin')
    await expect(
      useDataStore.getState().closePayrollPeriod({ from: '2026-09-01', to: '2026-09-15' }, '', admin),
    ).rejects.toThrow(/todavía no termina/)
    await useDataStore.getState().closePayrollPeriod(RANGE, '', admin)
    await expect(useDataStore.getState().closePayrollPeriod(RANGE, '', admin)).rejects.toThrow(/se cruza/)
    await expect(
      useDataStore.getState().closePayrollPeriod({ from: '2026-07-10', to: '2026-07-20' }, '', admin),
    ).rejects.toThrow(/se cruza/)
  })

  it('un periodo cerrado no deja editar sus días, y uno vecino sí', async () => {
    const admin = as('admin')
    const emp = useDataStore.getState().employees[0]
    await useDataStore.getState().closePayrollPeriod(RANGE, '', admin)
    const blocked = useDataStore.getState().editAttendanceDay({
      employeeId: emp.id,
      date: '2026-07-08',
      times: TIMES,
      reason: 'prueba',
    })
    expect(blocked).toMatchObject({ error: expect.stringMatching(/periodo cerrado/) })
    const outside = useDataStore.getState().editAttendanceDay({
      employeeId: emp.id,
      date: '2026-07-16',
      times: TIMES,
      reason: 'prueba',
    })
    expect('error' in outside).toBe(false)
  })

  it('tampoco deja pedir una corrección de un día cerrado', async () => {
    const admin = as('admin')
    const emp = useDataStore.getState().employees[0]
    await useDataStore.getState().closePayrollPeriod(RANGE, '', admin)
    const result = useDataStore
      .getState()
      .submitCorrection({ employeeId: emp.id, date: '2026-07-08', type: 'exit', time: '18:00', reason: 'olvidó' }, admin)
    expect(result).toMatch(/periodo cerrado/)
  })

  it('solo propietario o administrador reabren; al reabrir vuelve a poder editarse y se conserva el historial', async () => {
    const admin = as('admin')
    const emp = useDataStore.getState().employees[0]
    const period = await useDataStore.getState().closePayrollPeriod(RANGE, '', admin)

    useDataStore.setState({ currentUser: as('hr') })
    await expect(useDataStore.getState().reopenPayrollPeriod(period.id, 'corregir una salida', as('hr'))).rejects.toThrow(PermissionError)

    useDataStore.setState({ currentUser: admin })
    await expect(useDataStore.getState().reopenPayrollPeriod(period.id, 'ya', admin)).rejects.toThrow(/motivo/)
    await useDataStore.getState().reopenPayrollPeriod(period.id, 'corregir una salida', admin)

    const s = useDataStore.getState()
    expect(s.payrollPeriods).toHaveLength(1)
    expect(s.payrollPeriods[0]).toMatchObject({ reopenReason: 'corregir una salida', reopenedByName: admin.name })
    expect(s.audit[0].action).toBe('payroll.reopen')
    const edit = s.editAttendanceDay({
      employeeId: emp.id,
      date: '2026-07-08',
      times: TIMES,
      reason: 'prueba',
    })
    expect('error' in edit).toBe(false)
    await expect(s.reopenPayrollPeriod(period.id, 'otra vez', admin)).rejects.toThrow(/ya no está cerrado/)
    // Y puede cerrarse de nuevo.
    await useDataStore.getState().closePayrollPeriod(RANGE, '', admin)
    expect(useDataStore.getState().payrollPeriods).toHaveLength(2)
  })

  it('quien no tiene el permiso, o ve solo algunas sucursales, no cierra', async () => {
    const sup = as('supervisor')
    useDataStore.setState({ currentUser: sup })
    await expect(useDataStore.getState().closePayrollPeriod(RANGE, '', sup)).rejects.toThrow(PermissionError)

    const hr = as('hr', { branchIds: ['una-sucursal'] })
    useDataStore.setState({ currentUser: hr })
    await expect(useDataStore.getState().closePayrollPeriod(RANGE, '', hr)).rejects.toThrow(/todas las sucursales/)
  })
})
