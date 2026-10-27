import type { SubscriptionPlan } from '@/types'

/**
 * What the public page says about plans and payment. The feature split is the real one
 * (src/lib/license/features.ts). Prices are NOT invented: leave `monthlyPrice` as null and the page
 * shows "Solicita tu cotización"; put a number (MXN, per month, before IVA) and it is shown.
 */
export interface PlanInfo {
  key: SubscriptionPlan
  name: string
  tagline: string
  monthlyPrice: number | null
  highlight?: boolean
  features: string[]
}

export const PLANS: PlanInfo[] = [
  {
    key: 'basico',
    name: 'Básico',
    tagline: 'Para empezar a registrar la asistencia en orden.',
    monthlyPrice: null,
    features: [
      'Reloj checador con QR, código de barras y número + PIN',
      'Portal del empleado desde el celular, con foto',
      'Empleados, horarios e incidencias',
      'Vacaciones y solicitudes de corrección',
      '1 reloj checador',
    ],
  },
  {
    key: 'profesional',
    name: 'Profesional',
    tagline: 'Para quien necesita reportes y evidencia.',
    monthlyPrice: null,
    highlight: true,
    features: [
      'Todo lo del plan Básico',
      'Reconocimiento facial',
      'Reportes de asistencia, retardos y horas extra',
      'Exportación a Excel y CSV',
      'Auditoría de cada cambio',
    ],
  },
  {
    key: 'empresa',
    name: 'Empresa',
    tagline: 'Para varias sucursales y varios relojes.',
    monthlyPrice: null,
    features: [
      'Todo lo del plan Profesional',
      'Varias sucursales',
      'Varios relojes checadores (3 incluidos)',
    ],
  },
]

/** How a company starts and pays today (payments are recorded by hand; see docs/ESTADO.md). */
export const PAYMENT_STEPS: Array<{ title: string; text: string }> = [
  {
    title: 'Crea la cuenta de tu empresa',
    text: 'Registra a tu empresa y configura tus sucursales, horarios y empleados.',
  },
  {
    title: 'Elige tu plan',
    text: 'Eliges el plan que te conviene, por mes, y lo cambias cuando tu empresa crezca.',
  },
  {
    title: 'Paga por transferencia o depósito',
    text: 'Envías tu comprobante y registramos el pago: tu cuenta queda al corriente y lo ves en Configuración → Plan y pago.',
  },
]
