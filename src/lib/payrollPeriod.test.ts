import { describe, expect, it } from 'vitest'
import { recomputeRecord } from '@/lib/attendance'
import {
  changedSince,
  checkReadiness,
  closedPeriodOn,
  daysInRange,
  formatPeriod,
  hoursDecimal,
  lastFinishedPeriod,
  nextPeriod,
  periodFor,
  previousPeriod,
  summarizePeriod,
  summaryRows,
  type ReadinessInput,
} from '@/lib/payrollPeriod'
import type {
  AttendanceRecord,
  AttendanceSettings,
  Employee,
  Incidencia,
  PayrollPeriod,
  Punch,
  Schedule,
  Weekday,
} from '@/types'

const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const schedule: Schedule = {
  id: 's1',
  companyId: 'c1',
  name: 'Lunes a viernes',
  weeklyTargetHours: 40,
  color: '#000',
  days: WEEK.map((weekday) => ({
    weekday,
    enabled: weekday !== 'sat' && weekday !== 'sun',
    entry: '09:00',
    exit: '17:00',
  })),
}
const settings: AttendanceSettings = {
  entryToleranceMinutes: 10,
  absenceThresholdMinutes: 60,
  allowEarlyLeave: true,
  trackLunch: false,
  allowMultipleEntries: false,
  overtimeThresholdMinutes: 0,
  roundingMinutes: 0,
}
const employee = (id: string, name: string, extra: Partial<Employee> = {}): Employee =>
  ({
    id,
    companyId: 'c1',
    branchId: 'b1',
    employeeNumber: `EMP-${id}`,
    firstName: name,
    lastNamePaternal: 'X',
    fullName: name,
    position: 'Cajero',
    department: 'Tienda',
    status: 'active',
    hireDate: '2020-01-01',
    scheduleId: 's1',
    identifications: [],
    ...extra,
  }) as Employee

const TODAY = '2026-10-16'
const punch = (type: Punch['type'], time: string): Punch => ({ type, time, method: 'pin' })
const day = (employeeId: string, date: string, entry: string, exit?: string): AttendanceRecord =>
  recomputeRecord(
    {
      id: `${employeeId}-${date}`,
      companyId: 'c1',
      branchId: 'b1',
      employeeId,
      date,
      scheduleId: 's1',
      punches: [punch('entry', entry), ...(exit ? [punch('exit', exit)] : [])],
      status: 'present',
      workedMinutes: 0,
      scheduledMinutes: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
      missingMinutes: 0,
    },
    schedule,
    settings,
    TODAY,
  )

const input = (over: Partial<Parameters<typeof summarizePeriod>[0]> = {}) => ({
  range: { from: '2026-10-05', to: '2026-10-11' }, // lunes a domingo
  employees: [employee('1', 'Ana')],
  records: [] as AttendanceRecord[],
  schedules: [schedule],
  incidencias: [] as Incidencia[],
  settings,
  branches: [{ id: 'b1', name: 'Matriz' }],
  todayISO: TODAY,
  ...over,
})

describe('periodos', () => {
  it('semana de lunes a domingo', () => {
    expect(periodFor('weekly', '2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(periodFor('weekly', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(periodFor('weekly', '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })

  it('quincena: 1 al 15 y 16 a fin de mes (febrero y años bisiestos incluidos)', () => {
    expect(periodFor('biweekly', '2026-10-15')).toEqual({ from: '2026-10-01', to: '2026-10-15' })
    expect(periodFor('biweekly', '2026-10-16')).toEqual({ from: '2026-10-16', to: '2026-10-31' })
    expect(periodFor('biweekly', '2027-02-20')).toEqual({ from: '2027-02-16', to: '2027-02-28' })
    expect(periodFor('biweekly', '2028-02-20')).toEqual({ from: '2028-02-16', to: '2028-02-29' })
  })

  it('mes completo', () => {
    expect(periodFor('monthly', '2026-04-10')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })

  it('anterior y siguiente cruzan mes y año sin saltos ni huecos', () => {
    expect(previousPeriod('biweekly', { from: '2026-10-01', to: '2026-10-15' })).toEqual({ from: '2026-09-16', to: '2026-09-30' })
    expect(nextPeriod('biweekly', { from: '2026-12-16', to: '2026-12-31' })).toEqual({ from: '2027-01-01', to: '2027-01-15' })
    expect(previousPeriod('weekly', { from: '2026-10-05', to: '2026-10-11' })).toEqual({ from: '2026-09-28', to: '2026-10-04' })
  })

  it('el último periodo terminado nunca incluye hoy', () => {
    expect(lastFinishedPeriod('biweekly', '2026-10-16')).toEqual({ from: '2026-10-01', to: '2026-10-15' })
    expect(lastFinishedPeriod('weekly', '2026-10-12')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(lastFinishedPeriod('monthly', '2026-10-01')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('texto y duración', () => {
    expect(formatPeriod({ from: '2026-10-01', to: '2026-10-15' })).toBe('1 al 15 de octubre de 2026')
    expect(formatPeriod({ from: '2026-09-28', to: '2026-10-04' })).toBe('28 de septiembre al 4 de octubre de 2026')
    expect(formatPeriod({ from: '2026-12-28', to: '2027-01-03' })).toBe('28 de diciembre de 2026 al 3 de enero de 2027')
    expect(daysInRange({ from: '2026-10-01', to: '2026-10-15' })).toBe(15)
  })
})

describe('cuentas del periodo', () => {
  it('cuenta días, retardos, faltas y horas', () => {
    const records = [
      day('1', '2026-10-05', '09:00', '17:00'),
      day('1', '2026-10-06', '09:30', '17:00'), // retardo
      day('1', '2026-10-07', '09:00', '17:00'),
      // jueves 8 sin registro → falta; viernes 9 con registro
      day('1', '2026-10-09', '09:00', '17:00'),
    ]
    const { rows, totals } = summarizePeriod(input({ records }))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ daysWorked: 4, absences: 1, lates: 1, incompleteDays: 0 })
    expect(rows[0].workedMinutes).toBe(8 * 60 * 3 + 7.5 * 60)
    expect(totals).toMatchObject({ employees: 1, daysWorked: 4, absences: 1, lates: 1 })
  })

  it('una vacación aprobada no es falta y se cuenta como día de vacaciones', () => {
    const vacaciones: Incidencia = {
      id: 'i1',
      companyId: 'c1',
      employeeId: '1',
      type: 'vacaciones',
      from: '2026-10-05',
      to: '2026-10-09',
      status: 'approved',
      requestedById: '',
      createdAt: '2026-10-01T00:00:00Z',
    }
    const { rows } = summarizePeriod(input({ incidencias: [vacaciones] }))
    expect(rows[0]).toMatchObject({ absences: 0, vacationDays: 5, daysWorked: 0 })
  })

  it('una vacación pendiente sigue contando como falta', () => {
    const pendiente: Incidencia = {
      id: 'i1',
      companyId: 'c1',
      employeeId: '1',
      type: 'vacaciones',
      from: '2026-10-05',
      to: '2026-10-09',
      status: 'pending',
      requestedById: '',
      createdAt: '2026-10-01T00:00:00Z',
    }
    const { rows } = summarizePeriod(input({ incidencias: [pendiente] }))
    expect(rows[0].absences).toBe(5)
    expect(rows[0].vacationDays).toBe(0)
  })

  it('separa incapacidad y permisos', () => {
    const mk = (id: string, type: Incidencia['type'], from: string, to: string): Incidencia => ({
      id, companyId: 'c1', employeeId: '1', type, from, to, status: 'approved', requestedById: '', createdAt: '2026-10-01T00:00:00Z',
    })
    const { rows } = summarizePeriod(
      input({
        incidencias: [
          mk('a', 'incapacidad', '2026-10-05', '2026-10-05'),
          mk('b', 'permiso_con_goce', '2026-10-06', '2026-10-06'),
          mk('c', 'permiso_sin_goce', '2026-10-07', '2026-10-07'),
        ],
      }),
    )
    expect(rows[0]).toMatchObject({ sickDays: 1, paidLeaveDays: 1, unpaidLeaveDays: 1, absences: 2 })
  })

  it('las horas extra de la semana se reparten en dobles (hasta 9 h) y triples', () => {
    // 5 días de 8 h + 3 h extra cada uno (09:00 a 20:00) = 15 h extra en la semana.
    const records = ['05', '06', '07', '08', '09'].map((d) => day('1', `2026-10-${d}`, '09:00', '20:00'))
    const { rows } = summarizePeriod(input({ records }))
    expect(rows[0].overtimeMinutes).toBe(15 * 60)
    expect(rows[0].overtimeDoubleMinutes).toBe(9 * 60)
    expect(rows[0].overtimeTripleMinutes).toBe(6 * 60)
    expect(rows[0].ordinaryMinutes).toBe(rows[0].workedMinutes - 15 * 60)
  })

  it('un día con entrada y sin salida queda como incompleto', () => {
    const { rows } = summarizePeriod(input({ records: [day('1', '2026-10-05', '09:00')] }))
    expect(rows[0].incompleteDays).toBe(1)
  })

  it('no incluye a quien ingresó después del periodo ni a un inactivo sin movimientos', () => {
    const { rows } = summarizePeriod(
      input({
        employees: [
          employee('1', 'Ana'),
          employee('2', 'Beto', { hireDate: '2026-10-20' }),
          employee('3', 'Carla', { status: 'inactive' }),
        ],
      }),
    )
    expect(rows.map((r) => r.name)).toEqual(['Ana'])
  })

  it('un inactivo con movimientos en el periodo sí aparece (se le debe pagar)', () => {
    const { rows } = summarizePeriod(
      input({
        employees: [employee('3', 'Carla', { status: 'inactive' })],
        records: [day('3', '2026-10-05', '09:00', '17:00')],
      }),
    )
    expect(rows.map((r) => r.name)).toEqual(['Carla'])
  })

  it('las horas van en decimal para la hoja de nómina', () => {
    expect(hoursDecimal(450)).toBe(7.5)
    expect(hoursDecimal(100)).toBe(1.67)
    const { rows } = summarizePeriod(input({ records: [day('1', '2026-10-05', '09:00', '17:30')] }))
    expect(summaryRows(rows)[0]).toMatchObject({ number: 'EMP-1', name: 'Ana', workedHours: 8.5, daysWorked: 1 })
  })
})

describe('¿se puede cerrar?', () => {
  const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
    range: { from: '2026-10-01', to: '2026-10-15' },
    todayISO: TODAY,
    rows: [],
    incidencias: [],
    corrections: [],
    employees: [employee('1', 'Ana')],
    periods: [],
    pendingSync: 0,
    online: true,
    ...over,
  })
  const closed = (from: string, to: string, over: Partial<PayrollPeriod> = {}): PayrollPeriod => ({
    id: 'p',
    companyId: 'c1',
    from,
    to,
    summary: [],
    totals: { employees: 0, daysWorked: 0, absences: 0, lates: 0, workedMinutes: 0, overtimeMinutes: 0, overtimeDoubleMinutes: 0, overtimeTripleMinutes: 0 },
    closedAt: '2026-10-16T10:00:00Z',
    closedByName: 'Admin',
    ...over,
  })

  it('un periodo terminado y limpio se puede cerrar', () => {
    expect(checkReadiness(base()).blockers).toEqual([])
  })

  it('no deja cerrar un periodo que incluye hoy o el futuro', () => {
    expect(checkReadiness(base({ range: { from: '2026-10-16', to: '2026-10-31' } })).blockers[0]).toMatch(/todavía no termina/)
    expect(checkReadiness(base({ range: { from: '2026-10-10', to: TODAY } })).blockers[0]).toMatch(/todavía no termina/)
  })

  it('bloquea con incidencias o correcciones pendientes del periodo (y solo de ese periodo)', () => {
    const inc = (from: string, to: string): Incidencia => ({
      id: from, companyId: 'c1', employeeId: '1', type: 'vacaciones', from, to, status: 'pending', requestedById: '', createdAt: '',
    })
    const r = checkReadiness(base({ incidencias: [inc('2026-10-14', '2026-10-20'), inc('2026-11-01', '2026-11-02')] }))
    expect(r.blockers.join(' ')).toMatch(/1 incidencia pendiente/)
    const c = checkReadiness(
      base({
        corrections: [
          { id: 'c', companyId: 'c1', employeeId: '1', date: '2026-10-03', punchType: 'exit', previousTime: null, requestedTime: '17:00', reason: 'x', status: 'pending', requestedById: '', requestedByName: '', createdAt: '' },
        ],
      }),
    )
    expect(c.blockers.join(' ')).toMatch(/1 solicitud de corrección pendiente/)
  })

  it('bloquea sin internet o con checadas por sincronizar', () => {
    expect(checkReadiness(base({ online: false })).blockers.join(' ')).toMatch(/Sin internet/)
    expect(checkReadiness(base({ pendingSync: 3 })).blockers.join(' ')).toMatch(/3 movimientos sin enviar/)
  })

  it('bloquea el cruce con otro periodo cerrado, pero no con uno reabierto', () => {
    const clash = checkReadiness(base({ periods: [closed('2026-10-10', '2026-10-20')] }))
    expect(clash.blockers.join(' ')).toMatch(/se cruza/)
    const reopened = checkReadiness(base({ periods: [closed('2026-10-10', '2026-10-20', { reopenedAt: '2026-10-16T12:00:00Z' })] }))
    expect(reopened.blockers).toEqual([])
  })

  it('avisa (sin bloquear) de los días sin salida', () => {
    const { rows } = summarizePeriod(input({ range: { from: '2026-10-05', to: '2026-10-11' }, records: [day('1', '2026-10-05', '09:00')] }))
    const r = checkReadiness(base({ range: { from: '2026-10-05', to: '2026-10-11' }, rows }))
    expect(r.blockers).toEqual([])
    expect(r.warnings.join(' ')).toMatch(/sin salida/)
  })

  it('encuentra el periodo cerrado que cubre una fecha', () => {
    const periods = [closed('2026-10-01', '2026-10-15'), closed('2026-09-01', '2026-09-15', { reopenedAt: '2026-10-01T00:00:00Z' })]
    expect(closedPeriodOn(periods, '2026-10-15')?.from).toBe('2026-10-01')
    expect(closedPeriodOn(periods, '2026-10-16')).toBeUndefined()
    expect(closedPeriodOn(periods, '2026-09-10')).toBeUndefined()
  })
})

describe('comparar lo cerrado con hoy', () => {
  it('sin cambios no marca a nadie; un cambio marca a la persona', () => {
    const records = [day('1', '2026-10-05', '09:00', '17:00')]
    const saved = summarizePeriod(input({ records })).rows
    expect(changedSince(saved, summarizePeriod(input({ records })).rows)).toEqual([])
    const edited = [day('1', '2026-10-05', '09:00', '19:00')]
    expect(changedSince(saved, summarizePeriod(input({ records: edited })).rows)).toEqual(['Ana'])
  })

  it('detecta a quien aparece o desaparece', () => {
    const a = summarizePeriod(input()).rows
    const b = summarizePeriod(input({ employees: [employee('1', 'Ana'), employee('2', 'Beto')] })).rows
    expect(changedSince(a, b)).toEqual(['Beto'])
    expect(changedSince(b, a)).toEqual(['Beto'])
  })
})
