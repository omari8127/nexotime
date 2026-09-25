import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Reads KEY=VALUE lines from license-server/.env (no dependency needed). */
function loadDotEnv() {
  const file = resolve(root, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadDotEnv()

export const config = {
  root,
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? resolve(root, 'data', 'licenses.db'),
  /** PEM of the ES256 private key. Either inline (with \n escapes) or a file path. */
  privateKey: process.env.LICENSE_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? null,
  privateKeyFile: process.env.LICENSE_PRIVATE_KEY_FILE ?? resolve(root, 'data', 'private.pem'),
  /** Behind a reverse proxy (Railway, Render, nginx…) read the client IP from X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Origins allowed to call the *public* /v1 API from a browser. "*" is fine: every call is authenticated. */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  version: '1.0.0',
}
