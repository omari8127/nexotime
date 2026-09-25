import { useMemo } from 'react'
import { usePermissions, useScopedData } from '@/hooks/useScopedData'
import { calculateWeeklyHours } from '@/lib/attendance'
import { weekDates } from '@/lib/week'
import { formatDuration } from '@/lib/utils'
import { useToday } from '@/hooks/useToday'

export interface ComplianceAlert {
  id: string
  employeeId: string
  name: string
  detail: string
  cta: string
  to: string
  tone: 'warning' | 'destructive' | 'default'
  label: string
}

const formatDateShort = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T00:00:00`),
  )

/**
 * Situaciones que requieren atención de RH/administración: usado tanto por el
 * Dashboard como por la campanita de notificaciones en el topbar, para que la
 * misma lista se vea sin importar en qué página esté el usuario.
 */
export function useComplianceAlerts(limit = 5): ComplianceAlert[] {
  const { employees, attendance, corrections, incidencias } = useScopedData()
  const { can } = usePermissions()
  const today = useToday()
  const canReviewCorrections = can('corrections.review')
  const canReviewIncidencias = can('incidencias.review')
  const isStaff = can('dashboard.view')

  return useMemo(() => {
    const week = weekDates(today)
    const recent = week[0] // lunes de la semana actual
    const out: ComplianceAlert[] = []
    if (!isStaff) return out

    const nameOf = (id: string) => employees.find((e) => e.id === id)?.fullName ?? 'Empleado'
    if (canReviewCorrections) {
      for (const c of corrections.filter((x) => x.status === 'pending')) {
        out.push({
          id: `cor-${c.id}`,
          employeeId: c.employeeId,
          name: nameOf(c.employeeId),
          detail: `Solicita corregir su ${c.punchType === 'exit' ? 'salida' : c.punchType === 'entry' ? 'entrada' : 'comida'} del ${formatDateShort(c.date)}`,
          cta: 'Revisar',
          to: '/incidencias?tab=correcciones',
          tone: 'default',
          label: 'Corrección',
        })
      }
    }
    if (canReviewIncidencias) {
      for (const i of incidencias.filter((x) => x.status === 'pending')) {
        out.push({
          id: `inc-${i.id}`,
          employeeId: i.employeeId,
          name: nameOf(i.employeeId),
          detail: `Incidencia pendiente de aprobación (${formatDateShort(i.from)})`,
          cta: 'Revisar',
          to: '/incidencias',
          tone: 'warning',
          label: 'Incidencia',
        })
      }
    }

    for (const emp of employees) {
      if (emp.status !== 'active') continue
      const recs = attendance.filter(
        (r) => r.employeeId === emp.id && r.date >= week[0] && r.date <= week[6],
      )
      const lates = recs.filter((r) => r.status === 'late').length
      const ot = recs.reduce((a, r) => a + r.overtimeMinutes, 0)
      const weeklyForEmp = calculateWeeklyHours(recs, 40)
      const incompleteYesterday = attendance.find(
        (r) =>
          r.employeeId === emp.id &&
          r.status === 'incomplete' &&
          r.date < today &&
          r.date >= recent,
      )

      if (weeklyForEmp.exceedsLegalLimit) {
        out.unshift({
          id: `${emp.id}-lft`,
          employeeId: emp.id,
          name: emp.fullName,
          detail: `${formatDuration(ot)} de horas extra — excede el límite legal (LFT)`,
          cta: 'Revisar cumplimiento',
          to: `/empleados/${emp.id}?tab=resumen`,
          tone: 'destructive',
          label: 'Cumplimiento LFT',
        })
      } else if (incompleteYesterday) {
        out.push({
          id: `${emp.id}-inc`,
          employeeId: emp.id,
          name: emp.fullName,
          detail: `No registró salida el ${formatDateShort(incompleteYesterday.date)}`,
          cta: 'Corregir',
          to: `/empleados/${emp.id}?tab=asistencia`,
          tone: 'destructive',
          label: 'Urgente',
        })
      } else if (lates >= 2) {
        out.push({
          id: `${emp.id}-late`,
          employeeId: emp.id,
          name: emp.fullName,
          detail: `${lates} retardos esta semana`,
          cta: 'Ver empleado',
          to: `/empleados/${emp.id}`,
          tone: 'warning',
          label: 'Retardos',
        })
      } else if (ot >= 180) {
        out.push({
          id: `${emp.id}-ot`,
          employeeId: emp.id,
          name: emp.fullName,
          detail: `${formatDuration(ot)} de horas extra`,
          cta: 'Ver detalle',
          to: `/empleados/${emp.id}?tab=asistencia`,
          tone: 'default',
          label: 'Horas extra',
        })
      }
    }
    return out.slice(0, limit)
  }, [employees, attendance, corrections, incidencias, limit, today, isStaff, canReviewCorrections, canReviewIncidencias])
}
