import { useDataStore } from '@/store/dataStore'
import type { SubscriptionPlan } from '@/types'

/** What a plan can unlock. Kept in sync by hand with license-server/src/plans.js
 *  until the Fase 7 cleanup retires that server for good. */
export type Feature =
  | 'attendance'
  | 'employees'
  | 'schedules'
  | 'incidencias'
  | 'corrections'
  | 'reports'
  | 'export'
  | 'face'
  | 'audit'
  | 'multi_device'
  | 'multi_branch'

export const FEATURE_LABEL: Partial<Record<Feature, string>> = {
  reports: 'Reportes',
  export: 'Exportación a Excel y CSV',
  face: 'Reconocimiento facial',
  audit: 'Auditoría',
}

const BASIC: Feature[] = ['attendance', 'employees', 'schedules', 'incidencias', 'corrections']
const PRO: Feature[] = [...BASIC, 'reports', 'export', 'face', 'audit']
const ENTERPRISE: Feature[] = [...PRO, 'multi_device', 'multi_branch']

export const PLAN_FEATURES: Record<SubscriptionPlan, Feature[]> = {
  basico: BASIC,
  profesional: PRO,
  empresa: ENTERPRISE,
}

export const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  basico: 'Básico',
  profesional: 'Profesional',
  empresa: 'Empresa',
}

const allowed = (plan: SubscriptionPlan, f: Feature, mode: string) =>
  mode === 'demo' || PLAN_FEATURES[plan].includes(f)

/** For non-React code (services). */
export function hasFeatureNow(f: Feature): boolean {
  const { company, mode } = useDataStore.getState()
  return allowed(company.subscription.plan, f, mode)
}

/** For components. Demo mode always has everything. */
export function useFeature(f: Feature): boolean {
  const plan = useDataStore((s) => s.company.subscription.plan)
  const mode = useDataStore((s) => s.mode)
  return allowed(plan, f, mode)
}
