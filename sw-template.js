/* NEXOTIME service worker — generated at build time by vite-sw-plugin.ts.
 *
 * Goal: the reloj checador must OPEN with no Internet (tablet reboot, router down).
 *  - The app shell and every built file are cached on install (all-or-nothing).
 *  - The face-recognition models (~12 MB) are cached in the background, once.
 *  - Navigation is network-first (so updates arrive), falling back to the cached shell.
 *  - Only same-origin GET requests are touched: Supabase and the license API always go
 *    to the network, where the app handles being offline itself (write queue, signed license).
 */
const VERSION = '__VERSION__'
const CORE = `nx-core-${VERSION}`
const MODELS = 'nx-models-v1'
const RUNTIME = 'nx-runtime-v1'
const CORE_FILES = __CORE_FILES__
const MODEL_FILES = __MODEL_FILES__
const SHELL = '/index.html'
const NAV_TIMEOUT_MS = 3500
// Module scripts and <link crossorigin> send an Origin header; a `Vary: Origin` response would
// otherwise never match what was precached (which had none). Files are content-hashed, so this is safe.
const MATCH = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CORE)
      // `reload` skips the browser HTTP cache so we never precache a stale file.
      await cache.addAll(CORE_FILES.map((url) => new Request(url, { cache: 'reload' })))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the newest previous version too: a page that is still open may lazy-load
      // one of its old hashed chunks after an update.
      const cores = (await caches.keys()).filter((k) => k.startsWith('nx-core-')).sort()
      await Promise.all(cores.slice(0, Math.max(0, cores.length - 2)).map((k) => caches.delete(k)))
      await self.clients.claim()
      await cacheModels()
    })(),
  )
})

/** Best effort: a failure here must never break the app, the next activation retries. */
async function cacheModels() {
  try {
    const cache = await caches.open(MODELS)
    for (const url of MODEL_FILES) {
      if (await cache.match(url)) continue
      const res = await fetch(url)
      if (res.ok) await cache.put(url, res)
    }
  } catch {
    /* offline right now: try again on the next update */
  }
}

async function navigate(request) {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), NAV_TIMEOUT_MS)
    const res = await fetch(request, { signal: ctl.signal })
    clearTimeout(timer)
    // Only trust a real page; an offline captive portal or a proxy error page must not replace the shell.
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      const cache = await caches.open(CORE)
      cache.put(SHELL, res.clone())
      return res
    }
  } catch {
    /* offline or too slow → cached shell */
  }
  return (await caches.match(SHELL, MATCH)) || Response.error()
}

async function cacheFirst(request) {
  const hit = await caches.match(request, MATCH)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') {
    const path = new URL(request.url).pathname
    const cache = await caches.open(path.startsWith('/models/') ? MODELS : RUNTIME)
    cache.put(request, res.clone())
  }
  return res
}

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

/** The Inter typeface comes from Google Fonts: keep the last copy so the text looks the same offline. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone())
      return res
    })
    .catch(() => undefined)
  return cached || (await refresh) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (FONT_HOSTS.includes(url.hostname)) return event.respondWith(staleWhileRevalidate(request))
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return
  event.respondWith(request.mode === 'navigate' ? navigate(request) : cacheFirst(request))
})
