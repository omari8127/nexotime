import { beforeEach, describe, expect, it } from 'vitest'
import { scheduleDayFor, weekdayFromISO } from '@/lib/attendance'
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

  it('cambiar la configuración recalcula los días abiertos pero no toca los de un periodo cerrado', async () => {
    const admin = as('admin')
    const st = useDataStore.getState()
    const emp = st.employees[0]
    const schedule = st.schedules.find((s) => s.id === emp.scheduleId) ?? st.schedules[0]
    const workdays = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-20', '2026-07-21'].filter(
      (d) => scheduleDayFor(schedule, weekdayFromISO(d))?.enabled,
    )
    const [inClosed, inOpen] = [workdays[0], workdays[workdays.length - 1]]
    expect(inClosed < '2026-07-16' && inOpen > '2026-07-16').toBe(true)

    // Una entrada muy tarde: con tolerancia enorme no es retardo.
    st.updateSettings({ entryToleranceMinutes: 600 }, admin)
    const times = { entry: '17:00', lunch_out: null, lunch_in: null, exit: '18:00' }
    for (const date of [inClosed, inOpen]) {
      expect('error' in useDataStore.getState().editAttendanceDay({ employeeId: emp.id, date, times, reason: 'prueba' })).toBe(false)
    }
    const status = (date: string) => useDataStore.getState().attendance.find((r) => r.employeeId === emp.id && r.date === date)?.status
    expect(status(inClosed)).not.toBe('late')

    await useDataStore.getState().closePayrollPeriod(RANGE, '', admin)
    useDataStore.getState().updateSettings({ entryToleranceMinutes: 0 }, admin)
    expect(status(inOpen)).toBe('late') // el día abierto sí se recalcula
    expect(status(inClosed)).not.toBe('late') // el cerrado queda como se cerró
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
