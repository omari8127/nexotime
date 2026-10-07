/**
 * Offline-first write queue for live mode.
 *
 * The reloj checador must never lose a punch just because the internet is
 * down. When a write fails for network reasons (or the device is offline) the
 * mutation is parked in localStorage and replayed — oldest first, de-duplicated
 * by key — as soon as the connection returns or the app boots again.
 */
import type { AttendanceRecord, AuditLog, CorrectionRequest, Incidencia } from '@/types'
import { useSyncStore } from '@/store/syncStore'
import type { LiveBundle } from '@/services/live/liveApi'
import { loadSnapshot } from '@/services/live/snapshot'
import {
  liveInsertAudit,
  liveUpsertAttendance,
  liveUpsertCorrection,
  liveUpsertIncidencia,
} from '@/services/live/liveApi'

export type QueueItem =
  | { kind: 'attendance'; key: string; payload: AttendanceRecord; queuedAt: number; failures?: number }
  | { kind: 'audit'; key: string; payload: AuditLog; queuedAt: number; failures?: number }
  | { kind: 'correction'; key: string; payload: CorrectionRequest; queuedAt: number; failures?: number }
  | { kind: 'incidencia'; key: string; payload: Incidencia; queuedAt: number; failures?: number }

export type NewQueueItem =
  | { kind: 'attendance'; payload: AttendanceRecord }
  | { kind: 'audit'; payload: AuditLog }
  | { kind: 'correction'; payload: CorrectionRequest }
  | { kind: 'incidencia'; payload: Incidencia }

const KEY = 'nexotime.syncQueue'
const MAX_FAILURES = 5

function keyOf(item: NewQueueItem): string {
  switch (item.kind) {
    case 'attendance':
      return `attendance:${item.payload.employeeId}:${item.payload.date}`
    default:
      return `${item.kind}:${item.payload.id}`
  }
}

export function readQueue(required = false): QueueItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) throw new Error('Cola inválida')
    return parsed as QueueItem[]
  } catch {
    if (required) throw new Error('No se puede leer la cola de checadas. Pide a soporte revisarla antes de continuar.')
    return []
  }
}

function writeQueue(items: QueueItem[], required = false) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    if (required) throw new Error('No se pudo guardar la entrada pendiente. Libera espacio o permite el almacenamiento y reintenta.')
    return
  }
  useSyncStore.getState().setPending(items.length)
}

export function enqueue(item: NewQueueItem, required = false) {
  const key = keyOf(item)
  const queue = readQueue(required)
  const rest = queue.filter((q) => q.key !== key) // the latest version wins
  writeQueue([...rest, { ...item, key, queuedAt: Math.max(Date.now(), ...queue.map((q) => q.queuedAt + 1)) } as QueueItem], required)
}

export function clearQueue() {
  writeQueue([])
}

export function refreshPendingCount() {
  useSyncStore.getState().setPending(readQueue().length)
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)
}

async function run(item: QueueItem) {
  switch (item.kind) {
    case 'attendance':
      return liveUpsertAttendance(item.payload)
    case 'audit':
      return liveInsertAudit(item.payload)
    case 'correction':
      return liveUpsertCorrection(item.payload)
    case 'incidencia':
      return liveUpsertIncidencia(item.payload)
  }
}

let flushing = false

const DEAD_KEY = 'nexotime.syncRejected'

/** Writes the server refused several times. They are kept here (not silently thrown away) so
 *  support can recover them, and the person is told. */
export function readRejected(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(DEAD_KEY) ?? '[]') as QueueItem[]
  } catch {
    return []
  }
}

function keepRejected(items: QueueItem[]) {
  if (items.length === 0) return
  try {
    localStorage.setItem(DEAD_KEY, JSON.stringify([...readRejected(), ...items].slice(-100)))
  } catch {
    /* storage full: the warning below still reaches the person */
  }
}

/** Replay parked writes. Stops at the first network failure; an item the server rejects
 *  several times (e.g. a permission error) is moved aside and reported, never lost quietly. */
export async function flushQueue(): Promise<{ sent: number; remaining: number; rejected: number }> {
  if (flushing) return { sent: 0, remaining: readQueue().length, rejected: 0 }
  flushing = true
  useSyncStore.getState().setSyncing(true)
  let sent = 0
  let rejected = 0
  try {
    for (const item of readQueue()) {
      try {
        await run(item)
        writeQueue(readQueue().filter((q) => q.key !== item.key || q.queuedAt !== item.queuedAt))
        sent += 1
      } catch (err) {
        if (isNetworkError(err)) break
        const failures = (item.failures ?? 0) + 1
        const next = readQueue().map((q) => (q.key === item.key && q.queuedAt === item.queuedAt ? ({ ...q, failures } as QueueItem) : q))
        const hasPhoto = (q: QueueItem) => q.kind === 'attendance' && q.payload.punches.some((p) => p.photoEvidence)
        if (item.kind === 'attendance' && hasPhoto(item) && failures === MAX_FAILURES) rejected += 1
        const dead = next.filter((q) => (q.failures ?? 0) >= MAX_FAILURES && !hasPhoto(q))
        keepRejected(dead)
        rejected += dead.length
        writeQueue(next.filter((q) => (q.failures ?? 0) < MAX_FAILURES || hasPhoto(q)))
      }
    }
  } finally {
    flushing = false
    useSyncStore.getState().setSyncing(false)
  }
  return { sent, remaining: readQueue().length, rejected }
}

/**
 * Lays every parked write of this company on top of freshly loaded server data. Without it, a
 * refresh would make a punch that is still waiting to upload disappear from the screen (and let the
 * employee punch twice). Writes that belong to another company are ignored.
 */
export function applyPendingWrites(source: LiveBundle): LiveBundle {
  const companyId = source.company.id
  const pending = readQueue().filter((q) => q.payload.companyId === companyId)
  if (pending.length === 0) return source
  const bundle: LiveBundle = {
    ...source,
    attendance: [...source.attendance],
    audit: [...source.audit],
    corrections: [...source.corrections],
    incidencias: [...source.incidencias],
  }
  for (const item of pending) {
    switch (item.kind) {
      case 'attendance': {
        const i = bundle.attendance.findIndex(
          (r) => r.employeeId === item.payload.employeeId && r.date === item.payload.date,
        )
        if (i >= 0) bundle.attendance[i] = item.payload
        else bundle.attendance.unshift(item.payload)
        break
      }
      case 'audit':
        if (!bundle.audit.some((a) => a.id === item.payload.id)) bundle.audit.unshift(item.payload)
        break
      case 'correction': {
        const i = bundle.corrections.findIndex((c) => c.id === item.payload.id)
        if (i >= 0) bundle.corrections[i] = item.payload
        else bundle.corrections.unshift(item.payload)
        break
      }
      case 'incidencia': {
        const i = bundle.incidencias.findIndex((c) => c.id === item.payload.id)
        if (i >= 0) bundle.incidencias[i] = item.payload
        else bundle.incidencias.unshift(item.payload)
        break
      }
    }
  }
  return bundle
}

/**
 * Offline boot: the last server snapshot with every parked write layered on
 * top, so punches made while disconnected are visible right away.
 */
export function loadOfflineBundle(sessionUserId?: string): LiveBundle | null {
  const snap = loadSnapshot()
  if (!snap) return null
  if (sessionUserId && snap.currentUser.id !== sessionUserId) return null
  return applyPendingWrites(structuredClone(snap))
}
