import type { ReactNode } from 'react'
import type { Permission } from '@/types'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AdminLayout } from '@/layouts/AdminLayout'
import { Toaster } from '@/components/ui/toast'
import { ClockAccessGate, OnboardingGate, RequirePermission } from '@/components/shared/OnboardingGate'
import { AuthBoot } from '@/components/shared/AuthBoot'
import { PlanGate } from '@/components/subscription/PlanGate'
import { FeatureGuard } from '@/components/license/FeatureGuard'

import { DashboardPage } from '@/pages/DashboardPage'
import { EmployeesPage } from '@/pages/EmployeesPage'
import { EmployeeProfilePage } from '@/pages/EmployeeProfilePage'
import { AttendancePage } from '@/pages/AttendancePage'
import { SchedulesPage } from '@/pages/SchedulesPage'
import { BranchesPage } from '@/pages/BranchesPage'
import { BranchDetailPage } from '@/pages/BranchDetailPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { DevicesPage } from '@/pages/DevicesPage'
import { UsersPage } from '@/pages/UsersPage'
import { AuditPage } from '@/pages/AuditPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { WelcomePage } from '@/pages/WelcomePage'
import { MyAttendancePage } from '@/pages/MyAttendancePage'
import { IncidenciasPage } from '@/pages/IncidenciasPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ClockPage } from '@/pages/clock/ClockPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignupPage } from '@/pages/auth/SignupPage'

const guard = (permission: Permission, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
)

export function App() {
  const location = useLocation()

  return (
    <>
      <AuthBoot />
      <PlanGate>
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
          </Route>

          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </AnimatePresence>
      </PlanGate>
      <Toaster />
    </>
  )
}
