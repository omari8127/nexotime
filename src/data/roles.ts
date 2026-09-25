import type { Permission, Role, RoleKey } from '@/types'

const ALL: Permission[] = [
  'dashboard.view',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'attendance.view',
  'attendance.edit',
  'attendance.request_correction',
  'schedules.view',
  'schedules.manage',
  'branches.view',
  'branches.manage',
  'reports.view',
  'reports.export',
  'devices.view',
  'devices.manage',
  'users.view',
  'users.manage',
  'audit.view',
  'settings.view',
  'settings.manage',
  'incidencias.view',
  'incidencias.review',
  'corrections.view',
  'corrections.review',
  'biometrics.manage',
]

export const ROLES: Record<RoleKey, Role> = {
  owner: {
    key: 'owner',
    label: 'Propietario',
    description: 'Acceso total. Control de facturación, empresa y usuarios.',
    permissions: ALL,
  },
  admin: {
    key: 'admin',
    label: 'Administrador',
    description: 'Acceso total a la operación: empleados, asistencia, reportes y configuración.',
    permissions: ALL,
  },
  hr: {
    key: 'hr',
    label: 'Recursos Humanos',
    description:
      'Gestiona empleados, horarios, asistencia y reportes. No modifica configuración crítica ni usuarios administradores.',
    permissions: [
      'dashboard.view',
      'employees.view',
      'employees.create',
      'employees.edit',
      'attendance.view',
      'attendance.edit',
      'schedules.view',
      'schedules.manage',
      'branches.view',
      'reports.view',
      'reports.export',
      'devices.view',
      'audit.view',
      'settings.view',
      'incidencias.view',
      'incidencias.review',
      'corrections.view',
      'corrections.review',
    ],
  },
  supervisor: {
    key: 'supervisor',
    label: 'Supervisor',
    description:
      'Consulta empleados y asistencia de sus sucursales/departamentos asignados. Revisa incidencias y solicitudes de corrección de su equipo; no modifica configuración.',
    permissions: [
      'dashboard.view',
      'employees.view',
      'attendance.view',
      'attendance.request_correction',
      'schedules.view',
      'branches.view',
      'reports.view',
      'incidencias.view',
      'incidencias.review',
      'corrections.view',
      'corrections.review',
    ],
  },
  employee: {
    key: 'employee',
    label: 'Empleado',
    description:
      'Registra su asistencia y consulta únicamente sus propios registros. Solicita correcciones; no puede modificarlas directamente.',
    permissions: ['self.view'],
  },
}

export const ROLE_LIST: Role[] = [ROLES.owner, ROLES.admin, ROLES.hr, ROLES.supervisor, ROLES.employee]

/** Roles con acceso al panel administrativo (todos menos el empleado). */
export const isStaffRole = (role: RoleKey): boolean => role !== 'employee'

/** Pantalla de inicio de cada rol. */
export const homePathFor = (role: RoleKey): string => (role === 'employee' ? '/mi-asistencia' : '/')

export function can(role: RoleKey, permission: Permission): boolean {
  return ROLES[role]?.permissions.includes(permission) ?? false
}
