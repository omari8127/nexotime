import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronsLeft,
  LogOut,
  MonitorCheck,
  Moon,
  Sun,
  UserCog,
} from 'lucide-react'
import { NAV_ITEMS } from '@/components/shared/nav'
import { useFeature } from '@/lib/license/features'
import { NexotimeLogo } from '@/components/shared/Logo'
import { Avatar } from '@/components/ui/misc'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { useDataStore } from '@/store/dataStore'
import { useUIStore } from '@/store/uiStore'
import { usePermissions } from '@/hooks/useScopedData'
import { ROLES } from '@/data/roles'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { signOutLive } from '@/services/live/liveApi'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const mode = useDataStore((s) => s.mode)
  const currentUser = useDataStore((s) => s.currentUser)
  const users = useDataStore((s) => s.users)
  const setCurrentUser = useDataStore((s) => s.setCurrentUser)
  const switchToDemo = useDataStore((s) => s.switchToDemo)
  const { can } = usePermissions()
  const navigate = useNavigate()

  const signOut = async () => {
    if (mode === 'live') {
      await signOutLive()
      switchToDemo()
    }
    navigate('/bienvenida')
  }

  const hasReports = useFeature('reports')
  const hasAudit = useFeature('audit')
  const items = NAV_ITEMS.filter(
    (item) => can(item.permission) && (item.feature === 'reports' ? hasReports : item.feature === 'audit' ? hasAudit : true),
  )

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[248px]',
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <NexotimeLogo collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed ? (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                  />
                ) : null}
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => {
            navigate('/clock')
            onNavigate?.()
          }}
          className={cn(
            'mb-2 flex w-full items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            collapsed && 'justify-center px-0',
          )}
        >
          <MonitorCheck className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Abrir reloj checador</span>}
        </button>

        <Dropdown
          align="start"
          className="w-56"
          trigger={
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent',
                collapsed && 'justify-center px-0',
              )}
            >
              <Avatar name={currentUser.name} size="sm" />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sidebar-accent-foreground">
                    {currentUser.name}
                  </p>
                  <p className="truncate text-xs text-sidebar-foreground">
                    {ROLES[currentUser.role].label}
                  </p>
                </div>
              )}
            </button>
          }
        >
          {mode === 'demo' ? (
            <>
              <DropdownLabel>Cambiar de rol (demo)</DropdownLabel>
              {users.map((u) => (
                <DropdownItem key={u.id} onSelect={() => setCurrentUser(u.id)}>
                  <UserCog />
                  <span className="flex-1">{ROLES[u.role].label}</span>
                  {u.id === currentUser.id ? <span className="text-xs text-primary">Activo</span> : null}
                </DropdownItem>
              ))}
              <DropdownSeparator />
            </>
          ) : (
            <>
              <DropdownLabel>{currentUser.email}</DropdownLabel>
              <DropdownSeparator />
            </>
          )}
          <DropdownItem onSelect={toggleTheme}>
            {theme === 'light' ? <Moon /> : <Sun />}
            Tema {theme === 'light' ? 'oscuro' : 'claro'}
          </DropdownItem>
          <DropdownItem destructive onSelect={signOut}>
            <LogOut />
            Cerrar sesión
          </DropdownItem>
        </Dropdown>

        {!collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronsLeft className="h-4 w-4" />
            Contraer menú
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="mt-2 flex w-full items-center justify-center rounded-lg py-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronsLeft className="h-4 w-4 rotate-180" />
          </button>
        )}
      </div>
    </div>
  )
}
