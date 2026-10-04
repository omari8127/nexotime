/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_LICENSE_API_URL?: string
  readonly VITE_LICENSE_PUBLIC_KEY?: string
  readonly VITE_LICENSE_ENFORCE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Public origin of the site (canonical URLs, Open Graph); set by vite-seo-plugin.ts at build time. */
declare const __SITE_URL__: string

