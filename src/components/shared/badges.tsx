import {
  Barcode,
  Hand,
  KeyRound,
  QrCode,
  ScanFace,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CORRECTION_STATUS_META, INCIDENCIA_META, INCIDENCIA_STATUS_META } from '@/data/incidencias'
import type {
  AttendanceStatus,
  CaptureMethod,
  CorrectionStatus,
  DeviceStatus,
  EmployeeStatus,
  IncidenciaStatus,
  IncidenciaType,
} from '@/types'

const ATTENDANCE: Record<
  AttendanceStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'default' }
> = {
  present: { label: 'Presente', variant: 'success' },
  late: { label: 'Retardo', variant: 'warning' },
  absent: { label: 'Falta', variant: 'destructive' },
  incomplete: { label: 'Incompleto', variant: 'default' },
  overtime: { label: 'Hora extra', variant: 'default' },
  rest: { label: 'Descanso', variant: 'muted' },
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const s = ATTENDANCE[status]
  return (
    <Badge variant={s.variant} className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  )
}

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return status === 'active' ? (
    <Badge variant="success" className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Activo
    </Badge>
  ) : (
    <Badge variant="muted" className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Inactivo
    </Badge>
  )
}

export function IncidenciaBadge({ type }: { type: IncidenciaType }) {
  const meta = INCIDENCIA_META[type]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

export function IncidenciaStatusBadge({ status }: { status: IncidenciaStatus }) {
  const meta = INCIDENCIA_STATUS_META[status]
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  )
}

export function CorrectionStatusBadge({ status }: { status: CorrectionStatus }) {
  const meta = CORRECTION_STATUS_META[status]
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  )
}

const DEVICE: Record<DeviceStatus, { label: string; variant: 'success' | 'muted' | 'destructive' }> = {
  online: { label: 'En línea', variant: 'success' },
  offline: { label: 'Sin conexión', variant: 'destructive' },
  inactive: { label: 'Inactivo', variant: 'muted' },
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const s = DEVICE[status]
  return (
    <Badge variant={s.variant} className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  )
}

export const METHOD_META: Record<
  CaptureMethod,
  { label: string; Icon: typeof QrCode }
> = {
  face: { label: 'Reconocimiento facial', Icon: ScanFace },
  qr: { label: 'Código QR', Icon: QrCode },
  barcode: { label: 'Código de barras', Icon: Barcode },
  employee_number: { label: 'Número de empleado', Icon: UserRound },
  pin: { label: 'PIN', Icon: KeyRound },
  manual: { label: 'Ajuste manual', Icon: Hand },
  app: { label: 'Portal del empleado', Icon: Smartphone },
}

export function MethodBadge({ method }: { method: CaptureMethod }) {
  const m = METHOD_META[method]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <m.Icon className="h-3.5 w-3.5" />
      {m.label}
    </span>
  )
}
