import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { FEATURE_LABEL, useFeature, type Feature } from '@/lib/license/features'
import { useLicenseStore } from '@/lib/license/store'

/** Route/section guard: shows a calm notice when the license plan does not include a feature. */
export function FeatureGuard({ feature, children }: { feature: Feature; children: ReactNode }) {
  const allowed = useFeature(feature)
  const plan = useLicenseStore((s) => s.payload?.plan)
  if (allowed) return <>{children}</>
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{FEATURE_LABEL[feature] ?? 'Función'} no está incluida en tu plan</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Tu licencia{plan ? ` (${plan})` : ''} no incluye esta función. Contacta a tu proveedor para ampliar tu plan.
      </p>
    </div>
  )
}
