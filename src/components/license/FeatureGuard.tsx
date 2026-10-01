import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { FEATURE_LABEL, PLAN_LABEL, useFeature, type Feature } from '@/lib/license/features'
import { useDataStore } from '@/store/dataStore'

/** Route/section guard: shows a calm notice when the company's plan does not include a feature. */
export function FeatureGuard({ feature, children }: { feature: Feature; children: ReactNode }) {
  const allowed = useFeature(feature)
  const plan = useDataStore((s) => s.company.subscription.plan)
  if (allowed) return <>{children}</>
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{FEATURE_LABEL[feature] ?? 'Función'} no está incluida en tu plan</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Tu plan ({PLAN_LABEL[plan]}) no incluye esta función. Contacta a tu proveedor para ampliar tu plan.
      </p>
    </div>
  )
}
