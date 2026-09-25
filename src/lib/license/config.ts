import { isSupabaseConfigured } from '@/lib/supabaseClient'

export const APP_VERSION = '1.0.0'

/** Where the license API lives (never the customer database). */
export const LICENSE_API_URL = ((import.meta.env.VITE_LICENSE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')
/** Public half of the server's signing key. Safe to ship: it can only verify, never sign. */
export const LICENSE_PUBLIC_KEY = (import.meta.env.VITE_LICENSE_PUBLIC_KEY as string | undefined) ?? ''

/**
 * Real (connected) installations must be activated. The demo needs no license.
 * Turn it off for local development only, with VITE_LICENSE_ENFORCE=false.
 */
export const LICENSE_ENFORCED = isSupabaseConfigured && import.meta.env.VITE_LICENSE_ENFORCE !== 'false'

export const LICENSE_CONFIGURED = Boolean(LICENSE_API_URL && LICENSE_PUBLIC_KEY)
