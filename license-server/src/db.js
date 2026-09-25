import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','vendedor')),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT, phone TEXT, email TEXT, address TEXT, notes TEXT,
  vendor_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  plan TEXT NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','cancelled')),
  term_months INTEGER NOT NULL DEFAULT 12,
  expires_at TEXT,
  activated_at TEXT,
  code_hash TEXT UNIQUE,
  code_hint TEXT,
  tolerance_days INTEGER,
  notes TEXT,
  requested_by_vendor INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT, approved_by TEXT,
  last_validated_at TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses(id),
  device_id TEXT NOT NULL,
  name TEXT, platform TEXT, env_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unlinked')),
  env_flag INTEGER NOT NULL DEFAULT 0,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT, last_validated_at TEXT,
  app_version TEXT, ip TEXT,
  UNIQUE (license_id, device_id)
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  license_id TEXT, company_id INTEGER, company_name TEXT, device_id TEXT,
  ip TEXT,
  result TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit (ts DESC);
CREATE INDEX IF NOT EXISTS audit_license ON audit (license_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

export const DEFAULT_SETTINGS = {
  /** Days a client may keep working offline after its last successful validation. */
  default_tolerance_days: '30',
  /** When true, a device whose environment changed a lot is refused until you re-authorise it. */
  block_on_env_change: 'false',
}

export function openDb(path = config.dbPath) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  const put = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) put.run(k, v)
  return db
}
