import type { CorrectionStatus, Incidencia, IncidenciaStatus, IncidenciaType } from '@/types'

type Variant = 'default' | 'secondary' | 'warning' | 'muted' | 'destructive' | 'success'

export const INCIDENCIA_META: Record<
  IncidenciaType,
  { label: string; short: string; variant: Variant }
> = {
  vacaciones: { label: 'Vacaciones', short: 'Vac.', variant: 'default' },
  permiso_con_goce: { label: 'Permiso con goce de sueldo', short: 'Permiso c/g', variant: 'secondary' },
  permiso_sin_goce: { label: 'Permiso sin goce de sueldo', short: 'Permiso s/g', variant: 'muted' },
  incapacidad: { label: 'Incapacidad (IMSS)', short: 'Incap.', variant: 'warning' },
  retardo: { label: 'Retardo', short: 'Retardo', variant: 'warning' },
  falta: { label: 'Falta', short: 'Falta', variant: 'destructive' },
  salida_anticipada: { label: 'Salida anticipada', short: 'Sal. antic.', variant: 'warning' },
  entrada_olvidada: { label: 'Entrada olvidada', short: 'Ent. olvid.', variant: 'secondary' },
  salida_olvidada: { label: 'Salida olvidada', short: 'Sal. olvid.', variant: 'secondary' },
  comida_excedida: { label: 'Comida excedida', short: 'Comida exc.', variant: 'warning' },
  hora_extra: { label: 'Hora extra', short: 'H. extra', variant: 'success' },
  otra: { label: 'Otra incidencia', short: 'Otra', variant: 'muted' },
}

export const INCIDENCIA_TYPES: IncidenciaType[] = [
  'retardo',
  'falta',
  'salida_anticipada',
  'entrada_olvidada',
  'salida_olvidada',
  'comida_excedida',
  'hora_extra',
  'permiso_con_goce',
  'permiso_sin_goce',
  'vacaciones',
  'incapacidad',
  'otra',
]

/**
 * Tipos que justifican los días sin registro: un empleado con una de estas
 * incidencias *aprobadas* no cuenta como falta.
 */
export const JUSTIFYING_TYPES: IncidenciaType[] = [
  'vacaciones',
  'permiso_con_goce',
  'permiso_sin_goce',
  'incapacidad',
]

export const INCIDENCIA_STATUS_META: Record<IncidenciaStatus, { label: string; variant: Variant }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  approved: { label: 'Aprobada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'destructive' },
  corrected: { label: 'Corregida', variant: 'default' },
}

export const CORRECTION_STATUS_META: Record<CorrectionStatus, { label: string; variant: Variant }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  approved: { label: 'Aprobada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'destructive' },
}

/** Incidencia justificante vigente (aprobada) de un empleado en una fecha, si existe. */
export function findIncidencia(
  incidencias: Incidencia[],
  employeeId: string,
  date: string,
): Incidencia | undefined {
  return incidencias.find(
    (i) =>
      i.employeeId === employeeId &&
      i.status === 'approved' &&
      JUSTIFYING_TYPES.includes(i.type) &&
      date >= i.from &&
      date <= i.to,
  )
}
