import { describe, expect, it } from 'vitest'
import { applyDayEdit, dayTimesOf } from '@/lib/dayEdit'
import type { Punch } from '@/types'

const day: Punch[] = [
  { type: 'entry', time: '08:00', method: 'pin', photoEvidence: { id: 'p1', capturedAt: '2026-10-12T15:00:00Z' } },
  { type: 'lunch_out', time: '12:00', method: 'pin' },
]

describe('applyDayEdit', () => {
  it('sin cambios deja el día igual y no reporta nada', () => {
    const r = applyDayEdit(day, dayTimesOf(day))
    if ('error' in r) throw new Error(r.error)
    expect(r.punches).toEqual(day)
    expect([r.added, r.edited, r.removed, r.changes]).toEqual([[], [], [], []])
  })

  it('agrega, cambia y elimina en un solo paso, y lo cuenta', () => {
    const r = applyDayEdit(day, { entry: '08:10', lunch_out: null, lunch_in: null, exit: '17:30' })
    if ('error' in r) throw new Error(r.error)
    expect(r.added).toEqual(['exit'])
    expect(r.edited).toEqual(['entry'])
    expect(r.removed).toEqual(['lunch_out'])
    expect(r.punches.map((p) => [p.type, p.time, p.method])).toEqual([
      ['entry', '08:10', 'manual'],
      ['exit', '17:30', 'manual'],
    ])
    expect(r.punches.every((p) => p.edited)).toBe(true)
    expect(r.changes).toHaveLength(3)
  })

  it('conserva la foto original al cambiar la hora de un movimiento', () => {
    const r = applyDayEdit(day, { ...dayTimesOf(day), entry: '08:05' })
    if ('error' in r) throw new Error(r.error)
    expect(r.punches.find((p) => p.type === 'entry')?.photoEvidence?.id).toBe('p1')
  })

  it('rechaza un día imposible', () => {
    expect(applyDayEdit(day, { entry: '08:00', lunch_out: '12:00', lunch_in: null, exit: '11:00' })).toHaveProperty('error')
    expect(applyDayEdit(day, { entry: null, lunch_out: null, lunch_in: null, exit: '17:00' })).toHaveProperty('error')
    expect(applyDayEdit(day, { ...dayTimesOf(day), exit: '25:00' })).toHaveProperty('error')
  })

  it('permite vaciar el día por completo', () => {
    const r = applyDayEdit(day, { entry: null, lunch_out: null, lunch_in: null, exit: null })
    if ('error' in r) throw new Error(r.error)
    expect(r.punches).toEqual([])
    expect(r.removed).toEqual(['entry', 'lunch_out'])
  })
})
