import { create } from 'zustand'
import { LICENSE_CONFIGURED, LICENSE_PUBLIC_KEY, APP_VERSION } from './config'
import { LicenseApiError, licenseApi } from './api'
import { ensureDeviceId, environmentHash, platformInfo } from './device'
import { evaluateLicense, verifyLicenseToken, type BlockReason, type LicensePayload } from './token'

/**
 * Local license state. What is stored is the server-signed token, so editing it by
 * hand (ACTIVA↔VENCIDA, a later date, another plan) invalidates the signature and the
 * program falls back to "not activated". The decision to run is always re-derived
 * from that token and the clock — never from a flag saved on disk.
 */
const KEY = 'nexotime.license'
const RECHECK_MS = 30 * 60_000 // re-evaluate the clock
const REVALIDATE_MS = 6 * 3600_000 // ask the server at least this often while online
const BLOCKED_RETRY_MS = 60_000 // while blocked, look again every minute

interface Stored {
  token: string
  /** Latest local time observed, to notice a clock set back. */
  lastSeen: number
  /** Set when the server said this device is not authorised (survives a restart). */
  revoked?: string
}

const load = (): Stored | null => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}
const save = (s: Stored | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the license simply will not persist */
  }
}

/** The signed token this device holds (proof of possession for the license API). */
export const getStoredToken = (): string | null => load()?.token ?? null

export type Phase = 'checking' | 'unconfigured' | 'unactivated' | 'ready' | 'blocked'

interface LicenseState {
  phase: Phase
  reason: BlockReason | null
  payload: LicensePayload | null
  deviceId: string
  offlineDaysLeft: number | null
  expiresInDays: number | null
  /** null = unknown yet; false = last attempt could not reach the server */
  online: boolean | null
  busy: boolean
  init: () => Promise<void>
  activate: (code: string, companyName: string) => Promise<{ ok: true } | { ok: false; message: string }>
  validateNow: () => Promise<void>
  /** Forget this activation on this machine (to enter another code). Does not free the slot on the server. */
  forget: () => void
}

let timersStarted = false

export const useLicenseStore = create<LicenseState>((set, get) => {
  /** Re-derives the phase from the stored token and the clock. */
  const evaluate = (payload: LicensePayload | null, stored: Stored | null) => {
    if (!payload || !stored) return set({ phase: 'unactivated', payload: null, reason: null })
    if (stored.revoked) return set({ phase: 'blocked', payload, reason: 'wrong_device' })
    const now = Date.now()
    const verdict = evaluateLicense(payload, { now, deviceId: get().deviceId, lastSeen: stored.lastSeen })
    // Remember the latest time we saw (never move it backwards).
    if (now > stored.lastSeen) save({ ...stored, lastSeen: now })
    if (verdict.ok) {
      set({ phase: 'ready', payload, reason: null, offlineDaysLeft: verdict.offlineDaysLeft, expiresInDays: verdict.expiresInDays })
    } else {
      set({ phase: 'blocked', payload, reason: verdict.reason, offlineDaysLeft: null, expiresInDays: null })
    }
  }

  const accept = async (token: string): Promise<boolean> => {
    const payload = await verifyLicenseToken(token, LICENSE_PUBLIC_KEY)
    if (!payload || payload.dev !== get().deviceId) return false
    const stored: Stored = { token, lastSeen: Math.max(Date.now(), Date.parse(payload.iat)) }
    save(stored)
    evaluate(payload, stored)
    return true
  }

  return {
    phase: 'checking',
    reason: null,
    payload: null,
    deviceId: '',
    offlineDaysLeft: null,
    expiresInDays: null,
    online: null,
    busy: false,

    async init() {
      if (!LICENSE_CONFIGURED) return set({ phase: 'unconfigured' })
      set({ deviceId: await ensureDeviceId() })
      const stored = load()
      const payload = stored ? await verifyLicenseToken(stored.token, LICENSE_PUBLIC_KEY) : null
      if (!payload) save(null) // missing, corrupt or tampered
      evaluate(payload, payload ? stored : null)

      if (!timersStarted) {
        timersStarted = true
        const tick = () => {
          const s = load()
          const p = get().payload
          if (s && p) evaluate(p, s)
          const last = p ? Date.parse(p.iat) : 0
          if (get().phase === 'blocked' || Date.now() - last > REVALIDATE_MS) void get().validateNow()
        }
        setInterval(tick, RECHECK_MS)
        // While blocked (suspended, expired…) keep asking, so a reactivation is picked up quickly.
        setInterval(() => {
          if (get().phase === 'blocked') void get().validateNow()
        }, BLOCKED_RETRY_MS)
        window.addEventListener('online', () => void get().validateNow())
      }
      if (payload) void get().validateNow()
    },

    async activate(code, companyName) {
      set({ busy: true })
      try {
        const deviceId = get().deviceId || (await ensureDeviceId())
        set({ deviceId })
        const info = platformInfo()
        const res = await licenseApi.activate({
          code, companyName, deviceId, deviceName: info.name, platform: info.platform, appVersion: APP_VERSION, envHash: await environmentHash(),
        })
        if (!(await accept(res.token))) throw new LicenseApiError('server_error')
        set({ online: true })
        return { ok: true }
      } catch (e) {
        const err = e instanceof LicenseApiError ? e : new LicenseApiError('server_error')
        if (import.meta.env.DEV) console.warn('[license] activate', e)
        return { ok: false, message: err.message }
      } finally {
        set({ busy: false })
      }
    },

    async validateNow() {
      const stored = load()
      const payload = get().payload
      if (!stored || !payload || get().busy) return
      set({ busy: true })
      try {
        const res = await licenseApi.validate({
          licenseId: payload.lid, deviceId: get().deviceId, token: stored.token, appVersion: APP_VERSION, envHash: await environmentHash(),
        })
        set({ online: true })
        await accept(res.token)
      } catch (e) {
        if (e instanceof LicenseApiError && e.revoked) {
          const s = { ...stored, revoked: e.code }
          save(s)
          evaluate(payload, s)
        } else if (e instanceof LicenseApiError && e.network) {
          set({ online: false })
          evaluate(payload, stored) // keep working on the last signed license
        }
        // Rate limit / temporary server error: keep the current state, try again later.
      } finally {
        set({ busy: false })
      }
    },

    forget() {
      save(null)
      set({ phase: 'unactivated', payload: null, reason: null, offlineDaysLeft: null, expiresInDays: null })
    },
  }
})
