import { createHash, createPrivateKey, createPublicKey, randomBytes, scryptSync, sign, timingSafeEqual, verify } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { config } from './config.js'

/* ------------------------------ base64url ------------------------------ */
export const b64u = (buf) => Buffer.from(buf).toString('base64url')
export const fromB64u = (s) => Buffer.from(s, 'base64url')

/* --------------------------- signing (ES256) --------------------------- */
let keys = null

/** The private key never leaves this server; clients only ever hold the public key. */
export function loadKeys() {
  if (keys) return keys
  let pem = config.privateKey
  if (!pem && existsSync(config.privateKeyFile)) pem = readFileSync(config.privateKeyFile, 'utf8')
  if (!pem) throw new Error('Falta la llave privada. Ejecuta "npm run keygen" o define LICENSE_PRIVATE_KEY.')
  const privateKey = createPrivateKey(pem)
  const publicKey = createPublicKey(privateKey)
  keys = { privateKey, publicKey }
  return keys
}

export function publicKeySpkiBase64() {
  return loadKeys().publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
}

/** Token = base64url(JSON payload) . base64url(ECDSA P-256 / SHA-256 signature, raw r||s). */
export function signToken(payload) {
  const body = b64u(JSON.stringify(payload))
  const sig = sign('sha256', Buffer.from(body), { key: loadKeys().privateKey, dsaEncoding: 'ieee-p1363' })
  return `${body}.${b64u(sig)}`
}

/** Returns the payload when the signature is ours, otherwise null. */
export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  try {
    const ok = verify('sha256', Buffer.from(body), { key: loadKeys().publicKey, dsaEncoding: 'ieee-p1363' }, fromB64u(sig))
    return ok ? JSON.parse(fromB64u(body).toString('utf8')) : null
  } catch {
    return null
  }
}

/* --------------------------- hashing helpers --------------------------- */
export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') }
}

export function checkPassword(password, salt, hash) {
  const a = scryptSync(password, salt, 64)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export const randomToken = () => randomBytes(32).toString('base64url')

/* ------------------------ activation code format ----------------------- */
// No 0/O/1/I/L so it can be read over the phone. 12 chars × 5 bits = 60 bits.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newActivationCode() {
  const bytes = randomBytes(12)
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return `NXT-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

/** Tolerates lowercase, spaces and missing dashes when the customer types it. */
export function normalizeCode(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('NXT') ? raw.slice(3) : raw
  if (body.length !== 12) return null
  return `NXT-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
}
