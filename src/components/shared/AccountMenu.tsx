import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronDown, LayoutDashboard, LockKeyhole, LogOut, MonitorSmartphone, Smartphone } from 'lucide-react'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { KioskExitGate } from '@/components/clock/KioskExitGate'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { signOutLive } from '@/services/live/liveApi'
import { ROLES, homePathFor } from '@/data/roles'
import { getDeviceUse } from '@/lib/deviceUse'
import { resolveKiosk } from '@/lib/kiosk'
import { cn } from '@/lib/utils'

/**
 * "Sesión iniciada: <empresa>" at the top right of the public pages, with where to go from here:
 * the panel, the reloj checador or the employee portal, and signing out. Signing in no longer jumps
 * straight into the panel or the clock: it comes back here and the person chooses.
 */
export function AccountMenu({ className }: { className?: string }) {
  const navigate = useNavigate()
  const company = useDataStore((s) => s.company)
  const user = useDataStore((s) => s.currentUser)
  const switchToDemo = useDataStore((s) => s.switchToDemo)
  const setStatus = useAuthStore((s) => s.setStatus)
  // A reloj checador tablet keeps its session for everyone: signing out there asks for the exit code.
  const kioskDevice = getDeviceUse() === 'kiosk'
  const [askCode, setAskCode] = useState(false)
  const home = homePathFor(user.role)

  const signOut = async () => {
    await signOutLive().catch(() => undefined)
    switchToDemo()
    setStatus('anonymous')
    navigate('/bienvenida', { replace: true })
  }

  return (
    <div className={cn('shrink-0', className)}>
      <Dropdown
        className="w-72"
        trigger={
          <button
            type="button"
            className="flex max-w-[15rem] items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Building2 className="h-4 w-4" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[11px] font-medium text-emerald-700">Sesión iniciada</span>
              <span className="block truncate text-[13px] font-semibold text-slate-900">{company.name}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        }
      >
        <DropdownLabel>
          <span className="block truncate text-sm font-semibold text-foreground">{company.name}</span>
          <span className="block truncate font-normal">
            {user.name} · {ROLES[user.role]?.label ?? user.role}
          </span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownLabel>
        <DropdownSeparator />
        {home !== '/clock' ? (
          <DropdownItem onSelect={() => navigate(home)}>
            <LayoutDashboard />
            {home === '/' ? 'Ir al panel de administración' : 'Ir a mi asistencia'}
          </DropdownItem>
        ) : null}
        <DropdownItem onSelect={() => navigate('/activar?modo=reloj')}>
          <MonitorSmartphone />
          Abrir el reloj checador
        </DropdownItem>
        <DropdownItem onSelect={() => navigate('/activar?modo=empleado')}>
          <Smartphone />
          Portal del empleado
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem destructive onSelect={() => (kioskDevice ? setAskCode(true) : void signOut())}>
          <LogOut />
          <span className="flex-1">Cerrar sesión</span>
          {kioskDevice ? (
            <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
              <LockKeyhole className="!h-3 !w-3 !text-muted-foreground" />
              con código
            </span>
          ) : null}
        </DropdownItem>
      </Dropdown>

      {kioskDevice ? (
        <KioskExitGate
          open={askCode}
          signsOut
          expectedPin={resolveKiosk(company.attendanceSettings).exitPin}
          onClose={() => setAskCode(false)}
          onSuccess={() => {
            setAskCode(false)
            void signOut()
          }}
        />
      ) : null}
    </div>
  )
}
