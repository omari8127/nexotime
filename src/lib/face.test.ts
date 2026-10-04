import { describe, expect, it } from 'vitest'
import {
  BlinkDetector,
  descriptorDistance,
  faceCandidates,
  isConfidentMatch,
  meanDescriptor,
  nearestFace,
  qualityIssues,
  tuningFor,
  turnSide,
  type FaceReading,
} from '@/lib/face'
import { resolveKiosk } from '@/lib/kiosk'
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
  const ok: FaceReading = { ear: 0.3, size: 0.3, brightness: 130, offset: { x: 0, y: 0 }, yaw: 1, sharpness: 5, edgeGap: 0.2, box: { x: 0, y: 0, width: 100, height: 100 } }
  it('acepta una imagen buena', () => {
    expect(qualityIssues(ok, { blur: true })).toEqual([])
  })
  it('avisa lejos, cerca, cortado, oscuro, con contraluz y borroso', () => {
    expect(qualityIssues({ ...ok, size: 0.1 })).toContain('small')
    expect(qualityIssues({ ...ok, size: 0.9 })).toContain('close')
    expect(qualityIssues({ ...ok, edgeGap: -0.1 })).toContain('cut_off')
    expect(qualityIssues({ ...ok, brightness: 20 })).toContain('dark')
    expect(qualityIssues({ ...ok, brightness: 250 })).toContain('bright')
    expect(qualityIssues({ ...ok, sharpness: 0.2 }, { blur: true })).toContain('blurry')
    expect(qualityIssues({ ...ok, sharpness: 0.2 })).not.toContain('blurry') // en el reloj no bloquea
  })
})

describe('giro de cabeza y parpadeo', () => {
  it('distingue de frente y de lado', () => {
    expect(turnSide(1)).toBe(0)
    expect(turnSide(0.6)).toBe(-1)
    expect(turnSide(1.7)).toBe(1)
  })
  it('un parpadeo = ojos que se cierran y se abren', () => {
    const b = new BlinkDetector()
    for (const ear of [0.3, 0.31, 0.3]) b.update(ear)
    expect(b.blinks).toBe(0)
    for (const ear of [0.12, 0.1, 0.3, 0.31]) b.update(ear)
    expect(b.blinks).toBe(1)
  })
  it('una foto (ojos siempre iguales) nunca parpadea', () => {
    const b = new BlinkDetector()
    for (let i = 0; i < 100; i++) b.update(0.3 + (i % 2) * 0.005)
    expect(b.blinks).toBe(0)
  })
  /** Feeds samples at a fixed rate; returns the blink count. */
  const feed = (ears: number[], gapMs: number) => {
    const b = new BlinkDetector()
    ears.forEach((ear, i) => b.update(ear, 1000 + i * gapMs))
    return b.blinks
  }
  const open = (n: number) => Array<number>(n).fill(0.3)
  it('detecta un parpadeo real aunque solo se vea en una muestra (equipo lento)', () => {
    expect(feed([...open(10), 0.12, ...open(4)], 250)).toBe(1)
  })
  it('detecta un parpadeo rápido muestreado a ~40 fps', () => {
    expect(feed([...open(30), 0.24, 0.15, 0.13, 0.2, 0.28, ...open(10)], 25)).toBe(1)
  })
  it('un solo valor ruidoso y leve no cuenta como parpadeo', () => {
    expect(feed([...open(20), 0.25, ...open(20)], 25)).toBe(0)
  })
  it('ojos cerrados mucho rato (mirar abajo) no cuenta', () => {
    expect(feed([...open(10), ...Array<number>(60).fill(0.1), ...open(5)], 25)).toBe(0)
  })
  it('el ritmo de muestreo alto no desgasta la referencia de ojos abiertos', () => {
    // 3 s de ojos casi iguales a 40 fps, luego un parpadeo.
    expect(feed([...Array<number>(120).fill(0.27), 0.14, 0.13, 0.27, 0.28], 25)).toBe(1)
  })
})

describe('ajustes del reloj', () => {
  it('usa valores por defecto y acota lo inválido', () => {
    const d = resolveKiosk(undefined)
    expect(d).toMatchObject({ autoRegister: true, autoRegisterSeconds: 5, faceRequireBlink: true, faceStrictness: 'balanced', minGapMinutes: 2 })
    expect(d.faceThreshold).toBeNull()
    const k = resolveKiosk({ kiosk: { autoRegisterSeconds: 99, faceThreshold: 0.95, minGapMinutes: -5 } } as never)
    expect(k.autoRegisterSeconds).toBe(10)
    expect(k.faceThreshold).toBe(0.75)
    expect(k.minGapMinutes).toBe(0)
  })
})
