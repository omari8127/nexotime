/**
 * License tokens: a payload signed by the license server (ECDSA P-256 / SHA-256).
 * This file is pure (no React, no storage) so the exact same logic can be tested
 * in Node and ported to the Android app: the token format is the contract.
 */

export type LicenseStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'cancelled'

export interface LicensePayload {
  v: 1
  /** License id, e.g. LIC-2026-00042 */
  lid: string
  /** Company id on the license server */
  cid: number
  /** Company name */
  co: string
  /** Device the token was issued to */
  dev: string
  st: LicenseStatus
  plan: string
  /** Features the plan unlocks */
  feat: string[]
  /** Maximum devices */
  max: number
  /** License expiry (ISO) or null */
  exp: string | null
  /** Issued at (server time, ISO) = last successful validation */
  iat: string
  /** Valid until (ISO): end of the offline tolerance window */
  vu: string
  /** Tolerance in days */
  tol: number
}

const DAY = 86_400_000
/** How far the device clock may sit behind what we have already seen before we distrust it. */
const CLOCK_SLACK_MS = 10 * 60_000

const toBytes = (b64: string) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const keyCache = new Map<string, Promise<CryptoKey>>()
function importKey(spkiBase64: string) {
  let k = keyCache.get(spkiBase64)
  if (!k) {
    k = crypto.subtle.importKey('spki', toBytes(spkiBase64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    keyCache.set(spkiBase64, k)
  }
  return k
}

/** Returns the payload if — and only if — the signature is the server's. */
export async function verifyLicenseToken(token: string, publicKeySpki: string): Promise<LicensePayload | null> {
  try {
    const [body, sig, extra] = token.split('.')
    if (!body || !sig || extra !== undefined) return null
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importKey(publicKeySpki),
      toBytes(sig),
      new TextEncoder().encode(body),
    )
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(toBytes(body))) as LicensePayload
    return payload.v === 1 && payload.lid && payload.dev && payload.st ? payload : null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/*  What the program may do right now                                          */
/* -------------------------------------------------------------------------- */

export type BlockReason =
  | 'pending'
  | 'suspended'
  | 'expired'
  | 'cancelled'
  | 'validation_required'
  | 'clock_tampered'
  | 'wrong_device'

export type Verdict =
  | { ok: true; offlineDaysLeft: number; expiresInDays: number | null }
  | { ok: false; reason: BlockReason }

/**
 * Decides, from the signed token alone, whether the program may run.
 *  - the status inside the token wins (a suspension is signed too, so it holds offline);
 *  - the license end date and the offline tolerance are checked against the clock;
 *  - a clock set back is detected against the token's own issue time and the latest time seen.
 */
export function evaluateLicense(
  p: LicensePayload,
  o: { now: number; deviceId: string; lastSeen?: number },
): Verdict {
  if (p.dev !== o.deviceId) return { ok: false, reason: 'wrong_device' }
  if (p.st !== 'active') return { ok: false, reason: p.st }
  if (p.exp && o.now > Date.parse(p.exp)) return { ok: false, reason: 'expired' }
  if (o.now < Date.parse(p.iat) - CLOCK_SLACK_MS || (o.lastSeen && o.now < o.lastSeen - CLOCK_SLACK_MS)) {
    return { ok: false, reason: 'clock_tampered' }
  }
  if (o.now > Date.parse(p.vu)) return { ok: false, reason: 'validation_required' }
  return {
    ok: true,
    offlineDaysLeft: Math.max(0, Math.ceil((Date.parse(p.vu) - o.now) / DAY)),
    expiresInDays: p.exp ? Math.ceil((Date.parse(p.exp) - o.now) / DAY) : null,
  }
}
