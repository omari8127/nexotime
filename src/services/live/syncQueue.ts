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

export function readQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueueItem[]
  } catch {
    return []
  }
}

function writeQueue(items: QueueItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* storage full / blocked: nothing else we can do */
  }
  useSyncStore.getState().setPending(items.length)
}

export function enqueue(item: NewQueueItem) {
  const key = keyOf(item)
  const rest = readQueue().filter((q) => q.key !== key) // the latest version wins
  writeQueue([...rest, { ...item, key, queuedAt: Date.now() } as QueueItem])
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

/** Replay parked writes. Stops at the first network failure; drops an item only
 *  after it was rejected by the server several times (e.g. a permission error). */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  if (flushing) return { sent: 0, remaining: readQueue().length }
  flushing = true
  useSyncStore.getState().setSyncing(true)
  let sent = 0
  try {
    for (const item of readQueue()) {
      try {
        await run(item)
        writeQueue(readQueue().filter((q) => q.key !== item.key || q.queuedAt !== item.queuedAt))
        sent += 1
      } catch (err) {
        if (isNetworkError(err)) break
        const failures = (item.failures ?? 0) + 1
        writeQueue(
          readQueue()
            .map((q) => (q.key === item.key ? ({ ...q, failures } as QueueItem) : q))
            .filter((q) => (q.failures ?? 0) < MAX_FAILURES),
        )
      }
    }
  } finally {
    flushing = false
    useSyncStore.getState().setSyncing(false)
  }
  return { sent, remaining: readQueue().length }
}

/**
 * Offline boot: the last server snapshot with every parked write layered on
 * top, so punches made while disconnected are visible right away.
 */
export function loadOfflineBundle(sessionUserId?: string): LiveBundle | null {
  const snap = loadSnapshot()
  if (!snap) return null
  if (sessionUserId && snap.currentUser.id !== sessionUserId) return null

  const bundle: LiveBundle = structuredClone(snap)
  for (const item of readQueue()) {
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
