import { describe, expect, it } from 'vitest'
import { trimForSnapshot } from '@/services/live/snapshot'
import type { LiveBundle } from '@/services/live/liveApi'

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const bundle = {
  attendance: [0, 3, 20, 40, 100, 300].map((n) => ({ id: `r${n}`, date: daysAgo(n) })),
  audit: Array.from({ length: 300 }, (_, i) => ({ id: `a${i}` })),
  employees: [{ id: 'e1' }],
} as unknown as LiveBundle

describe('copia para trabajar sin conexión', () => {
  it('guarda solo el pasado reciente, para que quepa en el navegador', () => {
    const full = trimForSnapshot(bundle, { days: 62, audit: 100 })
    expect(full.attendance.map((r) => r.id)).toEqual(['r0', 'r3', 'r20', 'r40'])
    expect(full.audit).toHaveLength(100)
    const small = trimForSnapshot(bundle, { days: 7, audit: 0 })
    expect(small.attendance.map((r) => r.id)).toEqual(['r0', 'r3'])
    expect(small.audit).toHaveLength(0)
  })
  it('nunca recorta a las personas ni lo demás', () => {
    expect(trimForSnapshot(bundle, { days: 7, audit: 0 }).employees).toEqual(bundle.employees)
  })
  it('no modifica el original', () => {
    trimForSnapshot(bundle, { days: 7, audit: 0 })
    expect(bundle.attendance).toHaveLength(6)
  })
})
