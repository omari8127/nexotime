import type { Plugin } from 'vite'

/** Public pages worth indexing. Keep in step with the `index: true` entries of src/components/shared/RouteMeta.tsx. */
const INDEXABLE = ['/bienvenida', '/signup', '/aviso-legal', '/privacidad', '/terminos', '/cookies']

/** Screens behind the login (or the kiosk): never useful in search results. */
const PRIVATE = [
  '/clock',
  '/onboarding',
  '/mi-asistencia',
  '/empleados',
  '/asistencia',
  '/incidencias',
  '/horarios',
  '/sucursales',
  '/reportes',
  '/dispositivos',
  '/usuarios',
  '/auditoria',
  '/configuracion',
  '/integraciones',
  '/login',
]

const FALLBACK_SITE = 'https://nexotime-gbzq.vercel.app'

/**
 * The public origin: SITE_URL if set, else the production domain Vercel exposes at build time
 * (so a custom domain is picked up automatically once it is the production one), else the
 * current deployment's address.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : FALLBACK_SITE)
  return raw.replace(/\/+$/, '')
}

/**
 * Makes the site's own address available to the app (`__SITE_URL__`) and to index.html
 * (`__SITE_URL__` placeholders), and emits real robots.txt and sitemap.xml files — a single-page
 * app would otherwise answer those URLs with index.html.
 */
export function seoPlugin(): Plugin {
  const site = siteUrl()
  return {
    name: 'nexotime-seo',
    config: () => ({ define: { __SITE_URL__: JSON.stringify(site) } }),
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', site),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: ['User-agent: *', 'Allow: /', ...PRIVATE.map((p) => `Disallow: ${p}`), '', `Sitemap: ${site}/sitemap.xml`, ''].join('\n'),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...INDEXABLE.map((p) => `  <url><loc>${site}${p}</loc></url>`),
          '</urlset>',
          '',
        ].join('\n'),
      })
    },
  }
}
