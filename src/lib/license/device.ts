/**
 * Stable identity of this installation. A random id, created once and kept in two
 * places (localStorage and IndexedDB) so clearing one does not turn the machine
 * into a "new device". The server, not this file, decides whether it is authorised.
 *
 * On a native shell (Electron / Android) replace `readStored` / `writeStored`
 * with the OS secure store and keep the same id format.
 */
const KEY = 'nexotime.device'
const DB = 'nexotime-license'

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1)
      open.onupgradeneeded = () => open.result.createObjectStore('kv')
      open.onerror = () => resolve(undefined)
      open.onsuccess = () => {
        const tx = open.result.transaction('kv', mode)
        const req = run(tx.objectStore('kv'))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
      }
    } catch {
      resolve(undefined)
    }
  })
}

const readLocal = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const writeLocal = (v: string) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* private mode: the IndexedDB copy still holds it */
  }
}

const VALID = /^[A-F0-9]{4}(-[A-F0-9]{4}){7}$/

function generate(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return hex.match(/.{4}/g)!.join('-')
}

let cached: string | null = null

export async function ensureDeviceId(): Promise<string> {
  if (cached) return cached
  let id = readLocal()
  if (!id || !VALID.test(id)) id = (await idb<string>('readonly', (s) => s.get(KEY))) ?? null
  if (!id || !VALID.test(id)) id = generate()
  writeLocal(id)
  await idb('readwrite', (s) => s.put(id, KEY))
  cached = id
  return id
}

/** Short, coarse fingerprint used only to *notice* a copied installation. Never blocks by itself. */
export async function environmentHash(): Promise<string> {
  let gpu = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    gpu = ext ? String(gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    /* no WebGL */
  }
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } }
  const raw = [nav.userAgentData?.platform ?? nav.platform, nav.hardwareConcurrency, nav.deviceMemory, gpu].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function platformInfo(): { platform: string; name: string } {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'web'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const label = { android: 'Android', windows: 'Windows', macos: 'Mac', linux: 'Linux', web: 'Web' }[os]
  return { platform: os, name: `${label} · ${browser}` }
}
