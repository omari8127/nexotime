import {
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileWarning,
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import type { Permission } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  permission: Permission
  /** Plan feature this section needs (checked against the license). */
  feature?: 'reports' | 'audit'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/mi-asistencia', label: 'Mi asistencia', icon: CalendarDays, permission: 'self.view' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { to: '/empleados', label: 'Empleados', icon: Users, permission: 'employees.view' },
  { to: '/asistencia', label: 'Asistencia', icon: ClipboardList, permission: 'attendance.view' },
  { to: '/incidencias', label: 'Incidencias', icon: FileWarning, permission: 'incidencias.view' },
  { to: '/horarios', label: 'Horarios', icon: CalendarClock, permission: 'schedules.view' },
  { to: '/sucursales', label: 'Sucursales', icon: Building2, permission: 'branches.view' },
  { to: '/reportes', label: 'Reportes', icon: ScrollText, permission: 'reports.view', feature: 'reports' },
  { to: '/dispositivos', label: 'Dispositivos', icon: MonitorSmartphone, permission: 'devices.view' },
  { to: '/usuarios', label: 'Usuarios', icon: UsersRound, permission: 'users.view' },
  { to: '/auditoria', label: 'Auditoría', icon: ShieldCheck, permission: 'audit.view', feature: 'audit' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'settings.view' },
]
