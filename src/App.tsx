import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import type { Permission } from '@/types'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from '@/components/ui/toast'
import { ClockAccessGate, OnboardingGate, RequirePermission } from '@/components/shared/OnboardingGate'
import { AuthBoot } from '@/components/shared/AuthBoot'
import { FullScreenLoader } from '@/components/shared/Loaders'
import { PlanGate } from '@/components/subscription/PlanGate'
import { FeatureGuard } from '@/components/license/FeatureGuard'

// The first visit (bienvenida / login / registro) loads right away; everything
// else is split per screen and downloaded when it is first opened, which keeps
// the first load small. The service worker precaches every chunk, so the reloj
// still opens with no connection.
import { WelcomePage } from '@/pages/WelcomePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignupPage } from '@/pages/auth/SignupPage'

/** `lazy` for a module that exports the page under a name instead of as default. If a new
 *  deploy removed the file this open tab still asks for, reload once to pick up the new
 *  version instead of showing an error (the flag stops it from looping when truly offline). */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return lazy(() =>
    load()
      .then((m) => {
        sessionStorage.removeItem('nx-chunk-reload')
        return { default: m[name] as ComponentType }
      })
      .catch((err: unknown) => {
        if (!sessionStorage.getItem('nx-chunk-reload')) {
          sessionStorage.setItem('nx-chunk-reload', '1')
          window.location.reload()
          return new Promise<never>(() => undefined)
        }
        throw err
      }),
  )
}

const AdminLayout = page(() => import('@/layouts/AdminLayout'), 'AdminLayout')
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')
const EmployeesPage = page(() => import('@/pages/EmployeesPage'), 'EmployeesPage')
const EmployeeProfilePage = page(() => import('@/pages/EmployeeProfilePage'), 'EmployeeProfilePage')
const AttendancePage = page(() => import('@/pages/AttendancePage'), 'AttendancePage')
const SchedulesPage = page(() => import('@/pages/SchedulesPage'), 'SchedulesPage')
const BranchesPage = page(() => import('@/pages/BranchesPage'), 'BranchesPage')
const BranchDetailPage = page(() => import('@/pages/BranchDetailPage'), 'BranchDetailPage')
const ReportsPage = page(() => import('@/pages/ReportsPage'), 'ReportsPage')
const DevicesPage = page(() => import('@/pages/DevicesPage'), 'DevicesPage')
const UsersPage = page(() => import('@/pages/UsersPage'), 'UsersPage')
const AuditPage = page(() => import('@/pages/AuditPage'), 'AuditPage')
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage')
const OnboardingPage = page(() => import('@/pages/OnboardingPage'), 'OnboardingPage')
const MyAttendancePage = page(() => import('@/pages/MyAttendancePage'), 'MyAttendancePage')
const IncidenciasPage = page(() => import('@/pages/IncidenciasPage'), 'IncidenciasPage')
const NotFoundPage = page(() => import('@/pages/NotFoundPage'), 'NotFoundPage')
const ClockPage = page(() => import('@/pages/clock/ClockPage'), 'ClockPage')
const GoogleDriveCallbackPage = page(
  () => import('@/pages/integrations/GoogleDriveCallbackPage'),
  'GoogleDriveCallbackPage',
)

const guard = (permission: Permission, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
)

export function App() {
  const location = useLocation()

  return (
    <>
      <AuthBoot />
      <PlanGate>
      <Suspense fallback={<FullScreenLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname.split('/')[1] || 'root'}>
          <Route path="/bienvenida" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/clock"
            element={
              <ClockAccessGate>
                <ClockPage />
              </ClockAccessGate>
            }
          />

          <Route
            element={
              <OnboardingGate>
                <AdminLayout />
              </OnboardingGate>
            }
          >
            <Route path="/" element={guard('dashboard.view', <DashboardPage />)} />
            <Route path="/mi-asistencia" element={guard('self.view', <MyAttendancePage />)} />
            <Route path="/empleados" element={guard('employees.view', <EmployeesPage />)} />
            <Route path="/empleados/:id" element={guard('employees.view', <EmployeeProfilePage />)} />
            <Route path="/asistencia" element={guard('attendance.view', <AttendancePage />)} />
            <Route path="/incidencias" element={guard('incidencias.view', <IncidenciasPage />)} />
            <Route path="/horarios" element={guard('schedules.view', <SchedulesPage />)} />
            <Route path="/sucursales" element={guard('branches.view', <BranchesPage />)} />
            <Route path="/sucursales/:id" element={guard('branches.view', <BranchDetailPage />)} />
            <Route path="/reportes" element={guard('reports.view', <FeatureGuard feature="reports"><ReportsPage /></FeatureGuard>)} />
            <Route
              path="/dispositivos"
              element={
                <RequirePermission permission="devices.view">
                  <DevicesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequirePermission permission="users.view">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="/auditoria"
              element={
                <RequirePermission permission="audit.view">
                  <FeatureGuard feature="audit">
                    <AuditPage />
                  </FeatureGuard>
                </RequirePermission>
              }
            />
            <Route
              path="/configuracion"
              element={
                <RequirePermission permission="settings.view">
                  <SettingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/integraciones/google/callback"
              element={
                <RequirePermission permission="settings.view">
                  <GoogleDriveCallbackPage />
                </RequirePermission>
              }
            />
          </Route>

          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </AnimatePresence>
      </Suspense>
      </PlanGate>
      <Toaster />
    </>
  )
}
