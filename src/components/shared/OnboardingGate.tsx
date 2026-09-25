import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/useScopedData'
import { homePathFor } from '@/data/roles'
import type { Permission } from '@/types'

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Shared by any route that requires a real (live-mode) session: while the
 *  session restore check is running show a loader, then either let the route
 *  through or send the visitor to /login. No-ops in demo mode. */
function LiveSessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  if (status === 'checking') return <FullScreenLoader />
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Admin panel routes: in demo mode, gate on the onboarding flag like before;
 *  in live mode, gate on having a real authenticated session instead. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const completed = useUIStore((s) => s.onboardingCompleted)
  const mode = useDataStore((s) => s.mode)

  if (mode === 'live') return <LiveSessionGate>{children}</LiveSessionGate>
  if (!completed) return <Navigate to="/bienvenida" replace />
  return <>{children}</>
}

/** The reloj checador stays open with no gate in demo mode (it's meant to be
 *  reachable instantly for a sales demo); in live mode it requires whoever
 *  set up the tablet to have signed in on it at least once. */
export function ClockAccessGate({ children }: { children: ReactNode }) {
  const mode = useDataStore((s) => s.mode)
  if (mode === 'live') return <LiveSessionGate>{children}</LiveSessionGate>
  return <>{children}</>
}

/** Route guard: redirects to the dashboard when the current role lacks `permission`. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission
  children: ReactNode
}) {
  const { can, role } = usePermissions()
  // Send people to *their* home (an employee's is "Mi asistencia") — never to a
  // page they cannot open, which would loop.
  if (!can(permission)) return <Navigate to={homePathFor(role)} replace />
  return <>{children}</>
}
