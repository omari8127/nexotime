import { useState } from 'react'
import { PencilLine } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AttendancePhotoPanel } from '@/components/attendance/AttendancePhotoPanel'
import { AttendanceTimeline } from '@/components/attendance/AttendanceTimeline'
import { CorrectionDialog } from '@/components/attendance/CorrectionDialog'
import { usePermissions } from '@/hooks/useScopedData'
import { useDataStore } from '@/store/dataStore'
import { getRecordFlags } from '@/lib/attendance'
import { useToday } from '@/hooks/useToday'
import { formatDuration, formatLongDate } from '@/lib/utils'
import type { AttendanceRecord, Employee, Schedule } from '@/types'

export function AttendanceDetailDialog({
  open,
  onOpenChange,
  record,
  employee,
  schedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: AttendanceRecord
  employee?: Employee
  schedule?: Schedule
}) {
  const { can } = usePermissions()
  const today = useToday()
  const settings = useDataStore((s) => s.company.attendanceSettings)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const live = useDataStore((s) =>
    record ? s.attendance.find((r) => r.id === record.id) : undefined,
  )
  const current = live ?? record

  if (!current) return null
  const flags = getRecordFlags(current, schedule, settings, today)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{employee?.fullName ?? 'Registro de asistencia'}</DialogTitle>
            <DialogDescription>
              {formatLongDate(new Date(`${current.date}T00:00:00`))}
            </DialogDescription>
          </DialogHeader>

          <AttendanceTimeline record={current} schedule={schedule} />
          <AttendancePhotoPanel record={current} open={open} />

          <div className="flex flex-wrap gap-1.5">
            {current.lateMinutes > 0 ? <Badge variant="warning">Retardo {current.lateMinutes} min</Badge> : null}
            {flags.earlyLeaveMinutes > 0 ? (
              <Badge variant="warning">Salida anticipada {flags.earlyLeaveMinutes} min</Badge>
            ) : null}
            {flags.lunchExcessMinutes > 0 ? (
              <Badge variant="warning">Comida excedida {flags.lunchExcessMinutes} min</Badge>
            ) : null}
            {flags.lunchMinutes > 0 ? <Badge variant="muted">Comida {formatDuration(flags.lunchMinutes)}</Badge> : null}
            {current.overtimeMinutes > 0 ? (
              <Badge variant="success">Extra {formatDuration(current.overtimeMinutes)}</Badge>
            ) : null}
            {flags.missingExit ? <Badge variant="destructive">Falta salida</Badge> : null}
            {flags.missingEntry ? <Badge variant="destructive">Falta entrada</Badge> : null}
            {flags.missingLunch ? <Badge variant="muted">Sin registro de comida</Badge> : null}
          </div>

          {can('attendance.edit') || can('attendance.request_correction') ? (
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setCorrectionOpen(true)}>
                <PencilLine className="h-4 w-4" />
                {can('attendance.edit') ? 'Corregir registro' : 'Solicitar corrección'}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <CorrectionDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        record={current}
        employee={employee}
      />
    </>
  )
}
