import { beforeEach, describe, expect, it, vi } from 'vitest'

// The "server": each test decides how it answers.
const upsertAttendance = vi.fn<(p: unknown) => Promise<void>>()
vi.mock('@/services/live/liveApi', () => ({
  liveUpsertAttendance: (p: unknown) => upsertAttendance(p),
  liveInsertAudit: vi.fn().mockResolvedValue(undefined),
  liveUpsertCorrection: vi.fn().mockResolvedValue(undefined),
  liveUpsertIncidencia: vi.fn().mockResolvedValue(undefined),
}))

const { applyPendingWrites, enqueue, flushQueue, readQueue, readRejected } = await import('@/services/live/syncQueue')
import type { LiveBundle } from '@/services/live/liveApi'
import type { AttendanceRecord } from '@/types'

function installStorage() {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    },
  })
}

const record = (companyId: string, employeeId: string, date: string, punches: number): AttendanceRecord =>
  ({ id: `${employeeId}-${date}`, companyId, employeeId, date, punches: Array.from({ length: punches }, () => ({})) }) as unknown as AttendanceRecord

const bundleOf = (companyId: string, attendance: AttendanceRecord[] = []): LiveBundle =>
  ({ company: { id: companyId }, attendance, audit: [], corrections: [], incidencias: [] }) as unknown as LiveBundle

beforeEach(() => {
  installStorage()
  upsertAttendance.mockReset()
})

describe('cola de checadas sin conexión', () => {
  it('guarda solo la última versión de la checada del mismo empleado y día', () => {
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 1) })
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 2) })
    enqueue({ kind: 'attendance', payload: record('A', 'e2', '2026-10-04', 1) })
    expect(readQueue()).toHaveLength(2)
  })

  it('una checada pendiente no desaparece al refrescar los datos del servidor', () => {
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 2) })
    // El servidor aún trae la versión vieja (1 checada) o ninguna.
    const stale = applyPendingWrites(bundleOf('A', [record('A', 'e1', '2026-10-04', 1)]))
    expect(stale.attendance).toHaveLength(1)
    expect(stale.attendance[0].punches).toHaveLength(2)
    const none = applyPendingWrites(bundleOf('A'))
    expect(none.attendance).toHaveLength(1)
  })

  it('no mezcla las pendientes de otra empresa ni modifica lo recibido', () => {
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 2) })
    const server = bundleOf('B', [record('B', 'x', '2026-10-04', 1)])
    const result = applyPendingWrites(server)
    expect(result.attendance.map((r) => r.employeeId)).toEqual(['x'])
    const withPending = applyPendingWrites(bundleOf('A'))
    expect(withPending).not.toBe(server)
  })

  it('al volver la red envía en orden y vacía la cola', async () => {
    upsertAttendance.mockResolvedValue(undefined)
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 1) })
    enqueue({ kind: 'attendance', payload: record('A', 'e2', '2026-10-04', 1) })
    expect(await flushQueue()).toEqual({ sent: 2, remaining: 0, rejected: 0 })
  })

  it('si sigue sin red, conserva todo y no descarta nada', async () => {
    upsertAttendance.mockRejectedValue(new Error('Failed to fetch'))
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 1) })
    for (let i = 0; i < 8; i++) await flushQueue()
    expect(readQueue()).toHaveLength(1)
    expect(readRejected()).toHaveLength(0)
  })

  it('lo que el servidor rechaza una y otra vez se aparta y se avisa, no se pierde en silencio', async () => {
    upsertAttendance.mockRejectedValue(new Error('new row violates row-level security policy'))
    enqueue({ kind: 'attendance', payload: record('A', 'e1', '2026-10-04', 1) })
    let rejected = 0
    for (let i = 0; i < 6; i++) rejected += (await flushQueue()).rejected
    expect(rejected).toBe(1)
    expect(readQueue()).toHaveLength(0)
    expect(readRejected()).toHaveLength(1) // sigue recuperable
  })
})
