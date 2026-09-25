import type { Weekday } from '@/types'

export const DEMO_TODAY = '2026-09-10' // Jueves

export const COMPANY_ID = 'co_nexa'

export const BRANCHES = [
  {
    id: 'br_centro',
    code: 'CEN',
    name: 'Sucursal Centro',
    address: 'Av. Revolución 1420, Zona Centro',
    city: 'Tijuana, B.C.',
    phone: '664 123 4567',
  },
  {
    id: 'br_norte',
    code: 'NOR',
    name: 'Sucursal Norte',
    address: 'Blvd. Insurgentes 780, La Mesa',
    city: 'Tijuana, B.C.',
    phone: '664 987 2233',
  },
  {
    id: 'br_otay',
    code: 'OTY',
    name: 'Sucursal Otay',
    address: 'Parque Industrial Otay, Nave 12',
    city: 'Tijuana, B.C.',
    phone: '664 455 8890',
  },
] as const

export const DEPARTMENTS = [
  'Dirección',
  'Recursos Humanos',
  'Operaciones',
  'Ventas',
  'Atención a clientes',
  'Almacén',
  'Sistemas',
] as const

export const POSITIONS = [
  'Gerente',
  'Administrador',
  'Recursos Humanos',
  'Supervisor',
  'Ejecutivo de Ventas',
  'Operador',
  'Recepcionista',
  'Cajero',
  'Auxiliar de Almacén',
  'Soporte Técnico',
] as const

const WD: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function weekdays(days: Weekday[], entry: string, lunchOut: string, lunchIn: string, exit: string) {
  return WD.map((weekday) => ({
    weekday,
    enabled: days.includes(weekday),
    entry,
    lunchOut,
    lunchIn,
    exit,
  }))
}

export const SCHEDULES = [
  {
    id: 'sch_matutino',
    name: 'Horario Matutino',
    description: 'Lunes a viernes, jornada de oficina con comida de 1 hora.',
    color: '#2563eb',
    weeklyTargetHours: 40,
    days: weekdays(['mon', 'tue', 'wed', 'thu', 'fri'], '09:00', '14:00', '15:00', '18:00'),
  },
  {
    id: 'sch_administrativo',
    name: 'Horario Administrativo',
    description: 'Lunes a viernes 8:00–17:00. Base 45 horas semanales.',
    color: '#7c3aed',
    weeklyTargetHours: 45,
    days: weekdays(['mon', 'tue', 'wed', 'thu', 'fri'], '08:00', '13:30', '14:30', '18:00'),
  },
  {
    id: 'sch_operativo',
    name: 'Horario Operativo',
    description: 'Lunes a sábado. Objetivo 48 horas semanales.',
    color: '#0891b2',
    weeklyTargetHours: 48,
    days: weekdays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '07:00', '12:00', '13:00', '16:00'),
  },
  {
    id: 'sch_vespertino',
    name: 'Horario Vespertino',
    description: 'Martes a sábado, turno de tarde.',
    color: '#db2777',
    weeklyTargetHours: 42,
    days: weekdays(['tue', 'wed', 'thu', 'fri', 'sat'], '13:00', '17:00', '18:00', '21:24'),
  },
] as const

export const DEVICES_SEED = [
  {
    id: 'dev_1',
    branchId: 'br_centro',
    name: 'Tablet Entrada Principal',
    type: 'tablet' as const,
    platform: 'Android 14 · Lenovo Tab M10',
    status: 'online' as const,
    minutesAgo: 2,
  },
  {
    id: 'dev_2',
    branchId: 'br_centro',
    name: 'PC Recepción',
    type: 'pc' as const,
    platform: 'Windows 11 Pro',
    status: 'online' as const,
    minutesAgo: 6,
  },
  {
    id: 'dev_3',
    branchId: 'br_norte',
    name: 'Tablet Acceso Norte',
    type: 'tablet' as const,
    platform: 'Android 13 · Samsung Galaxy Tab A9',
    status: 'online' as const,
    minutesAgo: 1,
  },
  {
    id: 'dev_4',
    branchId: 'br_otay',
    name: 'Terminal Caseta Otay',
    type: 'terminal' as const,
    platform: 'NEXOTIME OS 1.4',
    status: 'online' as const,
    minutesAgo: 3,
  },
  {
    id: 'dev_5',
    branchId: 'br_otay',
    name: 'Tablet Almacén',
    type: 'tablet' as const,
    platform: 'Android 12 · Huawei MatePad',
    status: 'offline' as const,
    minutesAgo: 190,
  },
  {
    id: 'dev_6',
    branchId: 'br_otay',
    name: 'PC Supervisión Producción',
    type: 'pc' as const,
    platform: 'Windows 10 Pro',
    status: 'inactive' as const,
    minutesAgo: 4300,
  },
] as const
