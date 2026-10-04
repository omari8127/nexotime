import { describe, expect, it } from 'vitest'
import {
  descriptorDistance,
  faceCandidates,
  isConfidentMatch,
  meanDescriptor,
  nearestFace,
  qualityIssues,
  tuningFor,
  TUNING,
  type FaceReading,
} from '@/lib/face'
import { kioskDevice, pickKioskBranch, punchableEmployees, resolveKiosk } from '@/lib/kiosk'
import type { Employee } from '@/types'

/** A 128-number "face": the base plus a small offset moves it a known distance. */
const face = (seed: number, shift = 0) => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 7 + i) * 0.1 + shift)
const emp = (id: string, samples: number[][] | null, enabled = true, status: Employee['status'] = 'active') =>
  ({ id, status, identifications: samples ? [{ method: 'face', enabled, descriptors: samples }] : [] }) as unknown as Employee

describe('coincidencia facial', () => {
  const ana = emp('ana', [face(1), face(1, 0.005)])
  const beto = emp('beto', [face(2), face(2, 0.005)])
  const candidates = faceCandidates([ana, beto])

  it('la distancia entre el mismo vector es 0', () => {
    expect(descriptorDistance(face(1), face(1))).toBe(0)
  })
  it('reconoce a la persona registrada', () => {
    const m = nearestFace(candidates, face(1, 0.01))
    expect(m?.employee.id).toBe('ana')
    expect(isConfidentMatch(m, tuningFor('balanced'))).toBe(true)
  })
  it('rechaza a una persona no registrada', () => {
    const stranger = face(1, 0.2) // lejos de todos los registrados
    const m = nearestFace(candidates, stranger)
    expect(isConfidentMatch(m, tuningFor('balanced'))).toBe(false)
  })
  it('exige que gane por margen frente al segundo más parecido', () => {
    const twin = emp('gemelo', [face(1, 0.03)])
    const m = nearestFace(faceCandidates([ana, twin]), face(1, 0.015))
    expect(isConfidentMatch(m, tuningFor('balanced'))).toBe(false)
  })
  it('un umbral más estricto rechaza lo que uno flexible acepta', () => {
    const m = { employee: ana, distance: 0.5, runnerUp: Infinity }
    expect(isConfidentMatch(m, tuningFor('strict'))).toBe(false)
    expect(isConfidentMatch(m, tuningFor('relaxed'))).toBe(true)
    expect(isConfidentMatch(m, tuningFor('strict', 0.55))).toBe(true) // umbral fijado por el administrador
  })
  it('solo considera empleados activos, con rostro activado y con muestras', () => {
    const list = faceCandidates([
      ana,
      emp('sinRostro', null),
      emp('apagado', [face(3)], false),
      emp('inactivo', [face(4)], true, 'inactive'),
    ])
    expect(list.map((c) => c.employee.id)).toEqual(['ana'])
  })
  it('promedia varios cuadros', () => {
    expect(meanDescriptor([[0, 2], [2, 4]])).toEqual([1, 3])
  })
})

describe('calidad de imagen', () => {
  const ok: FaceReading = { size: 0.3, brightness: 130, offset: { x: 0, y: 0 }, yaw: 1, sharpness: 5, edgeGap: 0.2 }
  it('acepta una imagen buena', () => {
    expect(qualityIssues(ok, { blur: true })).toEqual([])
  })
  it('avisa lejos, cerca, cortado, oscuro, con contraluz y borroso', () => {
    expect(qualityIssues({ ...ok, size: 0.1 })).toContain('small')
    expect(qualityIssues({ ...ok, size: 0.1 }, { minFace: TUNING.relaxed.minFace })).not.toContain('small') // cámara de 2 MP
    expect(qualityIssues({ ...ok, size: 0.9 })).toContain('close')
    expect(qualityIssues({ ...ok, edgeGap: -0.1 })).toContain('cut_off')
    expect(qualityIssues({ ...ok, brightness: 20 })).toContain('dark')
    expect(qualityIssues({ ...ok, brightness: 250 })).toContain('bright')
    expect(qualityIssues({ ...ok, sharpness: 0.2 }, { blur: true })).toContain('blurry')
    expect(qualityIssues({ ...ok, sharpness: 0.2 })).not.toContain('blurry') // en el reloj no bloquea
  })
})

describe('sucursal, equipo y personal del reloj', () => {
  const branches = [{ id: 'rosal' }, { id: 'matriz' }]
  it('elige la sucursal en orden: la del reloj, la del panel, la última del dispositivo, la primera', () => {
    expect(pickKioskBranch(branches, 'matriz', 'rosal', 'rosal')).toBe('matriz')
    expect(pickKioskBranch(branches, '', 'all', 'matriz')).toBe('matriz') // "all" no es una sucursal
    expect(pickKioskBranch(branches, '', '', 'borrada')).toBe('rosal') // una guardada que ya no existe
    expect(pickKioskBranch([], 'x')).toBe('')
  })
  it('el equipo del reloj nunca es el de otra sucursal', () => {
    const devices = [
      { id: 'd1', branchId: 'matriz', status: 'online' },
      { id: 'd2', branchId: 'rosal', status: 'offline' },
    ]
    expect(kioskDevice(devices, 'rosal')?.id).toBe('d2')
    expect(kioskDevice(devices, 'matriz')?.id).toBe('d1')
    expect(kioskDevice([devices[0]], 'rosal')).toBeUndefined() // antes se prestaba el de otra sucursal
  })
  it('número + PIN sirve a toda la empresa, con los de la sucursal primero', () => {
    const emps = [
      { id: 'a', branchId: 'matriz', status: 'active' },
      { id: 'b', branchId: 'rosal', status: 'active' },
      { id: 'c', branchId: 'rosal', status: 'inactive' },
      { id: 'd', branchId: 'matriz', status: 'active' },
    ]
    expect(punchableEmployees(emps, 'rosal').map((e) => e.id)).toEqual(['b', 'a', 'd'])
  })
})

describe('ajustes del reloj', () => {
  it('usa valores por defecto y acota lo inválido', () => {
    const d = resolveKiosk(undefined)
    expect(d).toMatchObject({ autoRegister: true, autoRegisterSeconds: 5, faceStrictness: 'balanced', minGapMinutes: 2 })
    expect(d.faceThreshold).toBeNull()
    const k = resolveKiosk({ kiosk: { autoRegisterSeconds: 99, faceThreshold: 0.95, minGapMinutes: -5 } } as never)
    expect(k.autoRegisterSeconds).toBe(10)
    expect(k.faceThreshold).toBe(0.75)
    expect(k.minGapMinutes).toBe(0)
  })
  it('el zoom va de 1× a 2,5×', () => {
    expect(resolveKiosk(undefined).faceZoom).toBe(1)
    expect(resolveKiosk({ kiosk: { faceZoom: 1.7 } } as never).faceZoom).toBe(1.7)
    expect(resolveKiosk({ kiosk: { faceZoom: 9 } } as never).faceZoom).toBe(2.5)
    expect(resolveKiosk({ kiosk: { faceZoom: 0.2 } } as never).faceZoom).toBe(1)
  })
  it('una cámara más sencilla es más tolerante, nunca más exigente', () => {
    const [low, normal, high] = [TUNING.relaxed, TUNING.balanced, TUNING.strict]
    expect(low.threshold).toBeGreaterThan(normal.threshold)
    expect(normal.threshold).toBeGreaterThan(high.threshold)
    expect(low.minFace).toBeLessThan(normal.minFace)
    expect(low.minConfidence).toBeLessThan(normal.minConfidence)
    // Aun en el nivel más tolerante se exige distancia contra el segundo más parecido.
    expect(low.margin).toBeGreaterThan(0)
  })
})
