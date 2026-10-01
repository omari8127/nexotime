import { beforeEach, describe, expect, it } from 'vitest'
import { hasFeatureNow, PLAN_FEATURES } from '@/lib/license/features'
import { useDataStore } from '@/store/dataStore'
import type { SubscriptionPlan } from '@/types'

const setPlan = (plan: SubscriptionPlan, mode: 'live' | 'demo' = 'live') => {
  const s = useDataStore.getState()
  useDataStore.setState({ mode, company: { ...s.company, subscription: { ...s.company.subscription, plan } } })
}

describe('funciones por plan (Fase 3: leídas de company.plan, no del token de licencia)', () => {
  beforeEach(() => useDataStore.getState().switchToDemo?.())

  it('básico no incluye reportes, exportación, rostro ni auditoría', () => {
    setPlan('basico')
    for (const f of ['reports', 'export', 'face', 'audit'] as const) expect(hasFeatureNow(f)).toBe(false)
    expect(hasFeatureNow('attendance')).toBe(true)
  })

  it('profesional sí incluye reportes, exportación, rostro y auditoría, pero no multi-sucursal', () => {
    setPlan('profesional')
    for (const f of ['reports', 'export', 'face', 'audit'] as const) expect(hasFeatureNow(f)).toBe(true)
    expect(hasFeatureNow('multi_branch')).toBe(false)
  })

  it('empresa lo incluye todo', () => {
    setPlan('empresa')
    for (const f of PLAN_FEATURES.empresa) expect(hasFeatureNow(f)).toBe(true)
  })

  it('el modo demo ignora el plan y siempre permite todo', () => {
    setPlan('basico', 'demo')
    for (const f of PLAN_FEATURES.empresa) expect(hasFeatureNow(f)).toBe(true)
  })
})
