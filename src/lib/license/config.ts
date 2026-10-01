export const APP_VERSION = '1.0.0'

/** Where the license API lives (never the customer database). */
export const LICENSE_API_URL = ((import.meta.env.VITE_LICENSE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')
/** Public half of the server's signing key. Safe to ship: it can only verify, never sign. */
export const LICENSE_PUBLIC_KEY = (import.meta.env.VITE_LICENSE_PUBLIC_KEY as string | undefined) ?? ''

/**
 * Fase 2 de la migración a suscripción por cuenta (ver docs/ESTADO.md):
 * `PlanGate` reemplazó a `LicenseGate` como el candado real de la cuenta, así
 * que ya nadie llama a `useLicenseStore.init()` y este flag se queda
 * permanentemente en `false` — de lo contrario `useFeature` (que todavía lee
 * del token de licencia) bloquearía Reportes/Exportación/Rostro/Auditoría a
 * toda cuenta real, porque el token nunca vuelve a emitirse. La Fase 3
 * restaura el filtro real leyendo `company.plan` en su lugar.
 */
export const LICENSE_ENFORCED = false

export const LICENSE_CONFIGURED = Boolean(LICENSE_API_URL && LICENSE_PUBLIC_KEY)
