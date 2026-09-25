import { LICENSE_ENFORCED } from './config'
import { useLicenseStore } from './store'
import { useDataStore } from '@/store/dataStore'

/** What a plan can unlock. The list itself comes from the signed license (server-defined). */
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

const allowed = (feat: string[] | undefined, f: Feature, enforced: boolean, mode: string) =>
  !enforced || mode === 'demo' || !!feat?.includes(f)

/** For non-React code (services). */
export function hasFeatureNow(f: Feature): boolean {
  return allowed(useLicenseStore.getState().payload?.feat, f, LICENSE_ENFORCED, useDataStore.getState().mode)
}

/** For components. Demo mode and non-enforced builds have everything. */
export function useFeature(f: Feature): boolean {
  const feat = useLicenseStore((s) => s.payload?.feat)
  const mode = useDataStore((s) => s.mode)
  return allowed(feat, f, LICENSE_ENFORCED, mode)
}
