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
