/**
 * Deterministic in-memory database for the NEXOTIME demo.
 *
 * Everything here is generated from a fixed seed so the demo looks identical on
 * every reload. The shape mirrors what a real API would return; swapping this
 * for Supabase / a REST client means reimplementing `src/services/*` only.
 */
import type {
  AttendanceRecord,
  AuditLog,
  Branch,
  Company,
  CorrectionRequest,
  Device,
  Employee,
  EmployeeIdentification,
  Incidencia,
  Punch,
  Schedule,
  User,
} from '@/types'
import { recomputeRecord, scheduleDayFor, weekdayFromISO } from '@/lib/attendance'
import { fromMinutes, toMinutes } from '@/lib/utils'
import {
  BRANCHES,
  COMPANY_ID,
  DEMO_TODAY,
  DEPARTMENTS,
  DEVICES_SEED,
  SCHEDULES,
} from '@/data/catalog'
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES } from '@/data/names'

export interface MockDatabase {
  company: Company
  branches: Branch[]
  schedules: Schedule[]
  users: User[]
  employees: Employee[]
  devices: Device[]
  attendance: AttendanceRecord[]
  audit: AuditLog[]
  incidencias: Incidencia[]
  corrections: CorrectionRequest[]
}

/* --------------------------- seeded RNG ----------------------------------- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ACCENTS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ñ: 'n',
}
function slug(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((c) => ACCENTS[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]/g, '')
}

const rng = mulberry32(20260910)
const rand = () => rng()
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const chance = (p: number) => rand() < p

/* --------------------------- company / branches -------------------------- */

const company: Company = {
  id: COMPANY_ID,
  name: 'NEXA SOLUCIONES',
  legalName: 'Nexa Soluciones Empresariales S.A. de C.V.',
  rfc: 'NSE210418QA7',
  industry: 'Servicios administrativos',
  timezone: 'America/Tijuana',
  weeklyTargetHours: 46,
  attendanceSettings: {
    entryToleranceMinutes: 10,
    absenceThresholdMinutes: 120,
    allowEarlyLeave: false,
    trackLunch: true,
    allowMultipleEntries: false,
    overtimeThresholdMinutes: 15,
    roundingMinutes: 1,
  },
  createdAt: '2021-04-18',
}

const branches: Branch[] = BRANCHES.map((b) => ({
  id: b.id,
  companyId: COMPANY_ID,
  name: b.name,
  code: b.code,
  address: b.address,
  city: b.city,
  timezone: 'America/Tijuana',
  phone: b.phone,
  active: true,
}))

const schedules: Schedule[] = SCHEDULES.map((s) => ({
  id: s.id,
  companyId: COMPANY_ID,
  name: s.name,
  description: s.description,
  color: s.color,
  weeklyTargetHours: s.weeklyTargetHours,
  days: s.days.map((d) => ({ ...d })),
}))

/* --------------------------- users -------------------------------------- */

const users: User[] = [
  {
    id: 'usr_omar',
    companyId: COMPANY_ID,
    name: 'Omar Bravo',
    email: 'omar@nexasoluciones.mx',
    role: 'admin',
    branchIds: [],
    active: true,
    lastLoginAt: `${DEMO_TODAY}T07:42:00`,
  },
  {
    id: 'usr_maria_rh',
    companyId: COMPANY_ID,
    name: 'María López Guzmán',
    email: 'mlopez@nexasoluciones.mx',
    role: 'hr',
    branchIds: [],
    active: true,
    lastLoginAt: `${DEMO_TODAY}T08:15:00`,
  },
  {
    id: 'usr_sup_centro',
    companyId: COMPANY_ID,
    name: 'Ricardo Salas Vega',
    email: 'rsalas@nexasoluciones.mx',
    role: 'supervisor',
    branchIds: ['br_centro'],
    active: true,
    lastLoginAt: `${DEMO_TODAY}T08:03:00`,
  },
  {
    id: 'usr_sup_otay',
    companyId: COMPANY_ID,
    name: 'Adriana Núñez Parra',
    email: 'anunez@nexasoluciones.mx',
    role: 'supervisor',
    branchIds: ['br_otay'],
    departments: ['Operaciones', 'Almacén'],
    active: true,
    lastLoginAt: '2026-09-09T18:22:00',
  },
  {
    id: 'usr_owner',
    companyId: COMPANY_ID,
    name: 'Verónica Bravo',
    email: 'vbravo@nexasoluciones.mx',
    role: 'owner',
    branchIds: [],
    active: true,
    lastLoginAt: '2026-09-08T20:10:00',
  },
  {
    // Acceso de empleado ligado a Juan Pérez (emp_1): solo ve "Mi asistencia".
    id: 'usr_emp_juan',
    companyId: COMPANY_ID,
    name: 'Juan Pérez López',
    email: 'jperez@nexasoluciones.mx',
    role: 'employee',
    branchIds: [],
    employeeId: 'emp_1',
    active: true,
    lastLoginAt: '2026-09-09T08:55:00',
  },
]

/* --------------------------- employees --------------------------------- */

function identifications(seed: number): EmployeeIdentification[] {
  const r = mulberry32(seed)
  return [
    { method: 'face', enabled: false }, // "Próximamente"
    { method: 'qr', enabled: true, value: `NXT:${seed.toString(36).toUpperCase()}` },
    { method: 'barcode', enabled: r() >= 0 /* always on; the draw is kept so the seeded PINs stay the same */, value: `${700000000000 + seed}` },
    { method: 'employee_number', enabled: true },
    { method: 'pin', enabled: r() > 0.3 },
  ]
}

interface EmpBlueprint {
  first: string
  p: string
  m: string
  position: string
  department: string
  branchId: string
  scheduleId: string
}

const NAMED: EmpBlueprint[] = [
  { first: 'Juan', p: 'Pérez', m: 'López', position: 'Cajero', department: 'Operaciones', branchId: 'br_centro', scheduleId: 'sch_matutino' },
  { first: 'María', p: 'González', m: 'Torres', position: 'Recepcionista', department: 'Atención a clientes', branchId: 'br_centro', scheduleId: 'sch_matutino' },
  { first: 'Carlos', p: 'Ramírez', m: 'Sánchez', position: 'Supervisor', department: 'Operaciones', branchId: 'br_centro', scheduleId: 'sch_administrativo' },
  { first: 'Ana', p: 'Martínez', m: 'López', position: 'Ejecutivo de Ventas', department: 'Ventas', branchId: 'br_centro', scheduleId: 'sch_matutino' },
  { first: 'Fernanda', p: 'López', m: 'Ríos', position: 'Auxiliar de Almacén', department: 'Almacén', branchId: 'br_otay', scheduleId: 'sch_operativo' },
  { first: 'Carlos', p: 'Hernández', m: 'Mora', position: 'Operador', department: 'Operaciones', branchId: 'br_otay', scheduleId: 'sch_operativo' },
  { first: 'Laura', p: 'Sánchez', m: 'Vega', position: 'Recursos Humanos', department: 'Recursos Humanos', branchId: 'br_centro', scheduleId: 'sch_administrativo' },
  { first: 'Jorge', p: 'Torres', m: 'Díaz', position: 'Gerente', department: 'Dirección', branchId: 'br_norte', scheduleId: 'sch_administrativo' },
]

const employees: Employee[] = []
let counter = 0

function makeEmployee(bp: EmpBlueprint, active = true): Employee {
  counter += 1
  const number = `EMP-${String(counter).padStart(3, '0')}`
  const maternal = bp.m ? ` ${bp.m}` : ''
  const fullName = `${bp.first} ${bp.p}${maternal}`
  const seed = 1000 + counter
  const idr = mulberry32(seed)
  return {
    id: `emp_${counter}`,
    companyId: COMPANY_ID,
    branchId: bp.branchId,
    employeeNumber: number,
    firstName: bp.first,
    lastNamePaternal: bp.p,
    lastNameMaternal: bp.m || undefined,
    fullName,
    position: bp.position,
    department: bp.department,
    email: `${slug(bp.first)}.${slug(bp.p)}@nexasoluciones.mx`,
    phone: `664 ${randInt(200, 799)} ${randInt(1000, 9999)}`,
    status: active ? 'active' : 'inactive',
    hireDate: `20${randInt(21, 25)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
    scheduleId: bp.scheduleId,
    identifications: identifications(seed),
    pin: idr() > 0.3 ? String(randInt(1000, 9999)) : undefined,
    curp: idr() > 0.7 ? undefined : `${bp.p.slice(0, 2).toUpperCase()}${bp.m.slice(0, 1).toUpperCase() || 'X'}${bp.first.slice(0, 1).toUpperCase()}${randInt(80, 99)}${String(randInt(1, 12)).padStart(2, '0')}${String(randInt(1, 28)).padStart(2, '0')}HBCXXX0${randInt(1, 9)}`,
  }
}

for (const bp of NAMED) employees.push(makeEmployee(bp))

const SCHEDULE_IDS = SCHEDULES.map((s) => s.id)
const BRANCH_IDS = BRANCHES.map((b) => b.id)
const POSITION_POOL = [
  'Ejecutivo de Ventas',
  'Operador',
  'Cajero',
  'Recepcionista',
  'Auxiliar de Almacén',
  'Soporte Técnico',
  'Supervisor',
]

while (employees.length < 32) {
  const female = chance(0.5)
  const first = female ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M)
  const p = pick(LAST_NAMES)
  let m = pick(LAST_NAMES)
  while (m === p) m = pick(LAST_NAMES)
  const position = pick(POSITION_POOL)
  const department =
    position === 'Supervisor'
      ? 'Operaciones'
      : position === 'Soporte Técnico'
        ? 'Sistemas'
        : position === 'Auxiliar de Almacén'
          ? 'Almacén'
          : position === 'Ejecutivo de Ventas'
            ? 'Ventas'
            : pick(DEPARTMENTS)
  employees.push(
    makeEmployee(
      {
        first,
        p,
        m,
        position,
        department,
        branchId: pick(BRANCH_IDS),
        scheduleId: pick(SCHEDULE_IDS),
      },
      chance(0.94),
    ),
  )
}

const employeeById = new Map(employees.map((e) => [e.id, e]))
const scheduleById = new Map(schedules.map((s) => [s.id, s]))

/* --------------------------- devices ---------------------------------- */

function localDateTime(base: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}T${p(base.getHours())}:${p(base.getMinutes())}:${p(base.getSeconds())}`
}

const devices: Device[] = DEVICES_SEED.map((d) => {
  const seen = new Date(`${DEMO_TODAY}T11:45:00`)
  seen.setMinutes(seen.getMinutes() - d.minutesAgo)
  return {
    id: d.id,
    companyId: COMPANY_ID,
    branchId: d.branchId,
    name: d.name,
    type: d.type,
    platform: d.platform,
    status: d.status,
    lastSeenAt: localDateTime(seen),
    pairingCode: `${randInt(100, 999)}-${randInt(100, 999)}`,
    enabledMethods: ['qr', 'barcode', 'employee_number', 'pin'],
  }
})

/* --------------------------- attendance ------------------------------- */

const CAPTURE_METHODS: Punch['method'][] = ['qr', 'barcode', 'employee_number', 'pin', 'face']

function dateRange(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const d = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

const DATES = dateRange('2026-08-10', DEMO_TODAY)
const attendance: AttendanceRecord[] = []

function jitter(base: string, spreadMin: number): string {
  return fromMinutes(toMinutes(base) + randInt(-spreadMin, spreadMin))
}

for (const emp of employees) {
  if (emp.status === 'inactive') continue
  const schedule = scheduleById.get(emp.scheduleId)!

  for (const date of DATES) {
    const weekday = weekdayFromISO(date)
    const day = scheduleDayFor(schedule, weekday)
    const isToday = date === DEMO_TODAY

    if (!day || !day.enabled) {
      // occasional overtime on a rest day
      if (!isToday && chance(0.04)) {
        const t = randInt(9, 11) * 60
        attendance.push(
          finalize({
            id: `att_${emp.id}_${date}`,
            companyId: COMPANY_ID,
            branchId: emp.branchId,
            employeeId: emp.id,
            date,
            scheduleId: schedule.id,
            punches: [
              { type: 'entry', time: fromMinutes(t), method: pick(CAPTURE_METHODS) },
              { type: 'exit', time: fromMinutes(t + randInt(180, 300)), method: pick(CAPTURE_METHODS) },
            ],
            note: 'Trabajo en día de descanso',
          }),
        )
      }
      continue
    }

    const nowMinToday = toMinutes('11:45')
    const shouldHaveArrived = toMinutes(day.entry) <= nowMinToday

    // absence (past days: random; today: only if their shift already started)
    if (!isToday && chance(0.045)) {
      attendance.push(
        finalize({
          id: `att_${emp.id}_${date}`,
          companyId: COMPANY_ID,
          branchId: emp.branchId,
          employeeId: emp.id,
          date,
          scheduleId: schedule.id,
          punches: [],
        }),
      )
      continue
    }
    if (isToday && shouldHaveArrived && chance(0.12)) {
      // Registered as a same-day absence once past the tolerance window.
      attendance.push(
        finalize({
          id: `att_${emp.id}_${date}`,
          companyId: COMPANY_ID,
          branchId: emp.branchId,
          employeeId: emp.id,
          date,
          scheduleId: schedule.id,
          punches: [],
        }),
      )
      continue
    }
    if (isToday && !shouldHaveArrived) {
      // shift hasn't started yet today -> nothing to record
      continue
    }

    const method = pick(CAPTURE_METHODS)
    const late = chance(isToday ? 0.18 : 0.14)
    const entryTime = late
      ? fromMinutes(toMinutes(day.entry) + randInt(11, 40))
      : jitter(day.entry, 8)

    const punches: Punch[] = [{ type: 'entry', time: entryTime, method }]

    // progressive punches for "today"
    const nowMin = toMinutes('11:45')
    const buildLunchAndExit = () => {
      if (day.lunchOut && day.lunchIn) {
        const lo = jitter(day.lunchOut, 6)
        punches.push({ type: 'lunch_out', time: lo, method: pick(CAPTURE_METHODS) })
        punches.push({ type: 'lunch_in', time: jitter(day.lunchIn, 8), method: pick(CAPTURE_METHODS) })
      }
      const overtime = chance(0.12)
      const exitTime = overtime
        ? fromMinutes(toMinutes(day.exit) + randInt(25, 95))
        : jitter(day.exit, 10)
      punches.push({ type: 'exit', time: exitTime, method: pick(CAPTURE_METHODS) })
    }

    if (isToday) {
      // only entry so far, unless schedule started early
      if (toMinutes(entryTime) < nowMin && day.lunchOut && toMinutes(day.lunchOut) < nowMin) {
        punches.push({ type: 'lunch_out', time: jitter(day.lunchOut, 5), method: pick(CAPTURE_METHODS) })
        if (day.lunchIn && toMinutes(day.lunchIn) < nowMin) {
          punches.push({ type: 'lunch_in', time: jitter(day.lunchIn, 5), method: pick(CAPTURE_METHODS) })
        }
      }
    } else if (chance(0.04)) {
      // incomplete: forgot to punch exit
      if (day.lunchOut && day.lunchIn) {
        punches.push({ type: 'lunch_out', time: jitter(day.lunchOut, 6), method: pick(CAPTURE_METHODS) })
        punches.push({ type: 'lunch_in', time: jitter(day.lunchIn, 8), method: pick(CAPTURE_METHODS) })
      }
    } else {
      buildLunchAndExit()
    }

    attendance.push(
      finalize({
        id: `att_${emp.id}_${date}`,
        companyId: COMPANY_ID,
        branchId: emp.branchId,
        employeeId: emp.id,
        date,
        scheduleId: schedule.id,
        punches,
      }),
    )
  }
}

function finalize(
  partial: Omit<
    AttendanceRecord,
    'status' | 'workedMinutes' | 'scheduledMinutes' | 'lateMinutes' | 'overtimeMinutes' | 'missingMinutes'
  >,
): AttendanceRecord {
  const base: AttendanceRecord = {
    ...partial,
    status: 'present',
    workedMinutes: 0,
    scheduledMinutes: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    missingMinutes: 0,
  }
  const schedule = scheduleById.get(partial.scheduleId)!
  return recomputeRecord(base, schedule, company.attendanceSettings)
}

/* --------- scripted scenarios for the demo narrative -------------------- */

function recordFor(empId: string, date: string) {
  return attendance.find((r) => r.employeeId === empId && r.date === date)
}

function upsertRecord(empId: string, date: string, punches: Punch[], note?: string) {
  const emp = employeeById.get(empId)
  if (!emp) return
  const schedule = scheduleById.get(emp.scheduleId)!
  const existing = attendance.find((r) => r.employeeId === empId && r.date === date)
  if (existing) {
    existing.punches = punches
    existing.note = note
    Object.assign(existing, recomputeRecord(existing, schedule, company.attendanceSettings))
  } else {
    attendance.push(
      finalize({
        id: `att_${empId}_${date}`,
        companyId: COMPANY_ID,
        branchId: emp.branchId,
        employeeId: empId,
        date,
        scheduleId: schedule.id,
        punches,
        note,
      }),
    )
  }
}

function removeRecord(empId: string, date: string) {
  const i = attendance.findIndex((r) => r.employeeId === empId && r.date === date)
  if (i >= 0) attendance.splice(i, 1)
}

// Juan Pérez (emp_1): two late arrivals earlier this week, and NO check-in yet
// today — so a live demo can register his entrada from the clock and watch it
// land on the dashboard.
upsertRecord('emp_1', '2026-09-08', [
  { type: 'entry', time: '09:21', method: 'qr' },
  { type: 'lunch_out', time: '14:02', method: 'qr' },
  { type: 'lunch_in', time: '15:01', method: 'qr' },
  { type: 'exit', time: '18:04', method: 'qr' },
])
upsertRecord('emp_1', '2026-09-09', [
  { type: 'entry', time: '09:17', method: 'employee_number' },
  { type: 'lunch_out', time: '14:00', method: 'employee_number' },
  { type: 'lunch_in', time: '14:58', method: 'employee_number' },
  { type: 'exit', time: '18:01', method: 'employee_number' },
])
removeRecord('emp_1', DEMO_TODAY)

// Fernanda López (emp_5): heavy overtime this week
for (const date of ['2026-09-07', '2026-09-08', '2026-09-09']) {
  const r = recordFor('emp_5', date)
  if (r && r.punches.length >= 2) {
    const exit = r.punches.find((p) => p.type === 'exit')
    if (exit) exit.time = fromMinutes(toMinutes(exit.time) + 130)
    Object.assign(r, recomputeRecord(r, scheduleById.get(r.scheduleId)!, company.attendanceSettings))
  }
}

// Jorge Torres Díaz (emp_8, Gerente): se queda varias noches — supera el
// límite legal de 16 h extra a la semana (Art. 66-68 LFT) para mostrar la
// alerta de cumplimiento en el Dashboard y en Evidencia legal.
for (const date of ['2026-09-07', '2026-09-08', '2026-09-09']) {
  const r = recordFor('emp_8', date)
  if (r && r.punches.length >= 2) {
    const exit = r.punches.find((p) => p.type === 'exit')
    if (exit) exit.time = '23:40'
    Object.assign(r, recomputeRecord(r, scheduleById.get(r.scheduleId)!, company.attendanceSettings))
  }
}

// Carlos Hernández (emp_6): forgot to punch exit the day before
upsertRecord('emp_6', '2026-09-09', [
  { type: 'entry', time: '06:58', method: 'barcode' },
  { type: 'lunch_out', time: '12:01', method: 'barcode' },
  { type: 'lunch_in', time: '12:59', method: 'barcode' },
])

/* --------------------------- incidencias -------------------------------- */

// Ana Mendoza Flores (emp_15): de vacaciones toda la semana — sus días sin
// checar no deben contar como falta.
for (const date of dateRange('2026-09-08', '2026-09-12')) removeRecord('emp_15', date)

// Gabriela Jiménez Gutiérrez (emp_20): incapacidad médica de 3 días.
for (const date of dateRange('2026-09-09', '2026-09-11')) removeRecord('emp_20', date)

const incidencias: Incidencia[] = [
  {
    id: 'inc_1',
    companyId: COMPANY_ID,
    employeeId: 'emp_15',
    type: 'vacaciones',
    from: '2026-09-08',
    to: '2026-09-12',
    reason: 'Periodo vacacional anual',
    status: 'approved',
    requestedById: 'usr_maria_rh',
    createdAt: '2026-08-25T11:00:00',
  },
  {
    id: 'inc_2',
    companyId: COMPANY_ID,
    employeeId: 'emp_20',
    type: 'incapacidad',
    from: '2026-09-09',
    to: '2026-09-11',
    reason: 'Incapacidad temporal por enfermedad general (IMSS)',
    status: 'approved',
    requestedById: 'usr_maria_rh',
    createdAt: '2026-09-09T08:30:00',
  },
  {
    id: 'inc_3',
    companyId: COMPANY_ID,
    employeeId: 'emp_7',
    type: 'permiso_con_goce',
    from: '2026-09-11',
    to: '2026-09-11',
    reason: 'Trámite personal, autorizado por RH',
    status: 'approved',
    requestedById: 'usr_maria_rh',
    createdAt: '2026-09-05T09:15:00',
  },
  {
    id: 'inc_4',
    companyId: COMPANY_ID,
    employeeId: 'emp_2',
    type: 'permiso_con_goce',
    from: '2026-09-14',
    to: '2026-09-14',
    reason: 'Cita médica de su hijo',
    status: 'pending',
    requestedById: 'usr_sup_centro',
    createdAt: '2026-09-09T17:20:00',
  },
  {
    id: 'inc_5',
    companyId: COMPANY_ID,
    employeeId: 'emp_5',
    type: 'hora_extra',
    from: '2026-09-08',
    to: '2026-09-08',
    reason: 'Descarga de mercancía fuera de horario',
    status: 'approved',
    requestedById: 'usr_sup_otay',
    createdAt: '2026-09-09T09:05:00',
    updatedAt: '2026-09-09T10:00:00',
    reviewedById: 'usr_maria_rh',
    reviewedByName: 'María López Guzmán',
    reviewNote: 'Autorizada por RH.',
  },
  {
    id: 'inc_6',
    companyId: COMPANY_ID,
    employeeId: 'emp_6',
    type: 'salida_olvidada',
    from: '2026-09-09',
    to: '2026-09-09',
    reason: 'No registró salida el 9 de septiembre',
    status: 'pending',
    requestedById: 'usr_sup_otay',
    createdAt: '2026-09-10T08:10:00',
  },
]

/* ------------------------ correction requests -------------------------- */

const corrections: CorrectionRequest[] = [
  {
    id: 'cor_1',
    companyId: COMPANY_ID,
    employeeId: 'emp_6',
    date: '2026-09-09',
    punchType: 'exit',
    previousTime: null,
    requestedTime: '16:04',
    reason: 'Olvidé registrar mi salida.',
    status: 'pending',
    requestedById: 'usr_sup_otay',
    requestedByName: 'Adriana Núñez Parra',
    createdAt: '2026-09-10T08:12:00',
  },
  {
    id: 'cor_2',
    companyId: COMPANY_ID,
    employeeId: 'emp_1',
    date: '2026-09-08',
    punchType: 'entry',
    previousTime: '09:21',
    requestedTime: '08:58',
    reason: 'La tablet estaba sin conexión y mi entrada quedó con retraso.',
    status: 'rejected',
    requestedById: 'usr_emp_juan',
    requestedByName: 'Juan Pérez López',
    createdAt: '2026-09-09T09:00:00',
    reviewedById: 'usr_maria_rh',
    reviewedByName: 'María López Guzmán',
    reviewedAt: '2026-09-09T11:30:00',
    reviewNote: 'La bitácora del dispositivo muestra conexión normal a esa hora.',
  },
  {
    id: 'cor_3',
    companyId: COMPANY_ID,
    employeeId: 'emp_4',
    date: '2026-09-07',
    punchType: 'lunch_in',
    previousTime: null,
    requestedTime: '15:02',
    reason: 'Olvidé registrar mi regreso de comida.',
    status: 'approved',
    requestedById: 'emp_4',
    requestedByName: 'Ana Martínez López',
    createdAt: '2026-09-08T08:40:00',
    reviewedById: 'usr_maria_rh',
    reviewedByName: 'María López Guzmán',
    reviewedAt: '2026-09-08T09:15:00',
    reviewNote: 'Confirmado con su supervisor.',
  },
]

/* --------------------------- audit log -------------------------------- */

const audit: AuditLog[] = [
  {
    id: 'aud_1',
    companyId: COMPANY_ID,
    actorId: 'usr_omar',
    actorName: 'Omar Bravo',
    actorRole: 'admin',
    action: 'attendance.edit',
    entityType: 'AttendanceRecord',
    entityId: 'att_emp_6_2026-09-05',
    entityLabel: 'Carlos Hernández Mora · 5 sep 2026',
    reason: 'Olvidó registrar salida',
    changes: [{ field: 'Salida', before: null, after: '16:04' }],
    createdAt: '2026-09-06T18:23:00',
  },
  {
    id: 'aud_2',
    companyId: COMPANY_ID,
    actorId: 'usr_maria_rh',
    actorName: 'María López Guzmán',
    actorRole: 'hr',
    action: 'employee.create',
    entityType: 'Employee',
    entityId: 'emp_3',
    entityLabel: 'Carlos Ramírez Sánchez',
    changes: [{ field: 'Empleado', before: null, after: 'Alta de empleado EMP-003' }],
    createdAt: '2026-09-04T10:12:00',
  },
  {
    id: 'aud_3',
    companyId: COMPANY_ID,
    actorId: 'usr_sup_otay',
    actorName: 'Adriana Núñez Parra',
    actorRole: 'supervisor',
    action: 'attendance.correction_requested',
    entityType: 'AttendanceRecord',
    entityId: 'att_emp_5_2026-09-03',
    entityLabel: 'Fernanda López Ríos · 3 sep 2026',
    reason: 'Registró entrada en terminal equivocada',
    changes: [{ field: 'Solicitud', before: null, after: 'Corrección de sucursal de origen' }],
    createdAt: '2026-09-03T19:40:00',
  },
  {
    id: 'aud_4',
    companyId: COMPANY_ID,
    actorId: 'usr_omar',
    actorName: 'Omar Bravo',
    actorRole: 'admin',
    action: 'settings.update',
    entityType: 'AttendanceSettings',
    entityId: 'co_nexa',
    entityLabel: 'Configuración de asistencia',
    changes: [{ field: 'Tolerancia de entrada', before: '15 min', after: '10 min' }],
    createdAt: '2026-09-01T09:05:00',
  },
  {
    id: 'aud_5',
    companyId: COMPANY_ID,
    actorId: 'usr_maria_rh',
    actorName: 'María López Guzmán',
    actorRole: 'hr',
    action: 'schedule.edit',
    entityType: 'Schedule',
    entityId: 'sch_operativo',
    entityLabel: 'Horario Operativo',
    changes: [{ field: 'Sábado · Salida', before: '15:00', after: '16:00' }],
    createdAt: '2026-08-28T16:30:00',
  },
]

/* --------------------------- assemble -------------------------------- */

export function buildMockDatabase(): MockDatabase {
  return {
    company: structuredClone(company),
    branches: structuredClone(branches),
    schedules: structuredClone(schedules),
    users: structuredClone(users),
    employees: structuredClone(employees),
    devices: structuredClone(devices),
    attendance: structuredClone(attendance),
    audit: structuredClone(audit),
    incidencias: structuredClone(incidencias),
    corrections: structuredClone(corrections),
  }
}

export const MOCK_META = {
  employeeById,
  scheduleById,
  dates: DATES,
}
