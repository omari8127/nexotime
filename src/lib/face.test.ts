import { describe, expect, it, vi } from 'vitest'
import {
  DESCRIPTOR_LENGTH,
  descriptorDistance,
  distanceProfile,
  faceCandidates,
  faceSampleState,
  isConfidentMatch,
  meanDescriptor,
  nearestFace,
  paceDelay,
  qualityIssues,
  tuningFor,
  TUNING,
  verifyClaimed,
  type FaceReading,
} from '@/lib/face'
import { ClaimSession } from '@/lib/faceSession'
import { AUTO_MAX_ZOOM, nextAutoZoom, targetFaceRatio } from '@/lib/autoFrame'
import {
  gainFor,
  loadRotation,
  nextRotation,
  rotationCandidates,
  saveRotation,
  uprightAspect,
  viewKey,
  windowAspect,
} from '@/lib/cameraView'
import { photoExpired, photoIsFresh, photoRetentionDays, type PhotoCapture } from '@/lib/photoEvidence'
import { kioskDevice, pickKioskBranch, punchableEmployees, resolveKiosk } from '@/lib/kiosk'
import type { Employee } from '@/types'

/**
 * A 1024-number "face" (like Human's FaceRes). Two different seeds are ≈0.96 apart — different people;
 * `d` moves it exactly that distance from its seed (distance = Euclidean ÷ 20, see lib/face).
 */
const face = (seed: number, d = 0) =>
  Array.from({ length: DESCRIPTOR_LENGTH }, (_, i) => Math.sin(i * (0.7 + seed * 0.53) + seed) * 0.6 + (d * 20) / Math.sqrt(DESCRIPTOR_LENGTH))
const emp = (id: string, samples: number[][] | null, enabled = true, status: Employee['status'] = 'active') =>
  ({ id, status, identifications: samples ? [{ method: 'face', enabled, descriptors: samples }] : [] }) as unknown as Employee

describe('coincidencia facial', () => {
  const ana = emp('ana', [face(1), face(1, 0.06)])
  const beto = emp('beto', [face(2), face(2, 0.06)])
  const candidates = faceCandidates([ana, beto])

  it('la distancia entre el mismo vector es 0', () => {
    expect(descriptorDistance(face(1), face(1))).toBe(0)
    expect(descriptorDistance(face(1), face(1, 0.3))).toBeCloseTo(0.3)
    expect(descriptorDistance(face(1), face(2))).toBeGreaterThan(0.8) // dos personas distintas
  })
  it('reconoce a la persona registrada', () => {
    const m = nearestFace(candidates, face(1, 0.11))
    expect(m?.employee.id).toBe('ana')
    expect(isConfidentMatch(m, tuningFor('balanced'))).toBe(true)
  })
  it('rechaza a una persona no registrada', () => {
    const stranger = face(1, 2.2) // lejos de todos los registrados
    const m = nearestFace(candidates, stranger)
    expect(isConfidentMatch(m, tuningFor('balanced'))).toBe(false)
  })
  it('exige que gane por margen frente al segundo más parecido', () => {
    const twin = emp('gemelo', [face(1, 0.3)])
    const m = nearestFace(faceCandidates([ana, twin]), face(1, 0.16))
    expect(isConfidentMatch(m, tuningFor('balanced'))).toBe(false)
  })
  it('un umbral más estricto rechaza lo que uno flexible acepta', () => {
    const m = { employee: ana, distance: 0.44, runnerUp: Infinity }
    expect(isConfidentMatch(m, tuningFor('strict'))).toBe(false)
    expect(isConfidentMatch(m, tuningFor('relaxed'))).toBe(true)
    expect(isConfidentMatch(m, tuningFor('strict', 0.46))).toBe(true) // umbral fijado por el administrador
    // Nunca más permisivo que el tope calibrado, aunque se guarde otra cosa.
    expect(tuningFor('relaxed', 0.9).threshold).toBe(0.5)
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
  it('las muestras del motor anterior (128 números) no cuentan: hay que registrar de nuevo', () => {
    const viejo = Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.1)
    const antes = emp('antes', [viejo, viejo])
    expect(faceCandidates([antes])).toEqual([])
    expect(faceSampleState(antes)).toEqual({ usable: 0, outdated: true })
    expect(faceSampleState(ana)).toEqual({ usable: 2, outdated: false })
    expect(faceSampleState(emp('nadie', null))).toEqual({ usable: 0, outdated: false })
    expect(descriptorDistance(viejo, face(1))).toBe(Infinity)
  })
  it('promedia varios cuadros', () => {
    expect(meanDescriptor([[0, 2], [2, 4]])).toEqual([1, 3])
  })
})

describe('calidad de imagen', () => {
  const ok: FaceReading = { pixelWidth: 180, size: 0.3, brightness: 130, offset: { x: 0, y: 0 }, yaw: 1, sharpness: 5, edgeGap: 0.2 }
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
    const k = resolveKiosk({ kiosk: { autoRegisterSeconds: 99, faceMatchLimit: 0.95, minGapMinutes: -5 } } as never)
    expect(k.autoRegisterSeconds).toBe(10)
    expect(k.faceThreshold).toBe(0.5)
    // Un límite guardado para el motor anterior (otra escala) se ignora: aplicado aquí dejaría pasar a extraños.
    expect(resolveKiosk({ kiosk: { faceThreshold: 0.72 } } as never).faceThreshold).toBeNull()
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

describe('verificación después de número y PIN (1:1)', () => {
  const ana = emp('ana', [face(1), face(1, 0.06)])
  const beto = emp('beto', [face(2), face(2, 0.06)])
  const candidates = faceCandidates([ana, beto])
  const t = TUNING.balanced

  it('acepta el rostro de quien dijo ser', () => {
    const v = verifyClaimed(candidates, 'ana', face(1, 0.02), t)
    expect(v.kind).toBe('match')
  })

  it('rechaza un rostro que no se parece a la persona registrada', () => {
    const stranger = faceCandidates([ana])
    const v = verifyClaimed(stranger, 'ana', face(5), t)
    expect(v.kind).toBe('mismatch')
  })

  it('distingue "no eres tú" de "eres otra persona del equipo"', () => {
    // Beto escribe el número y PIN de Ana: su rostro se parece claramente más al de Beto.
    const v = verifyClaimed(candidates, 'ana', face(2, 0.02), t)
    expect(v.kind).toBe('other')
    if (v.kind === 'other') expect(v.other.id).toBe('beto')
  })

  it('sin rostro registrado no hay nada que comparar', () => {
    expect(verifyClaimed(candidates, 'carla', face(1), t).kind).toBe('not_enrolled')
  })

  it('el umbral configurado manda: uno estricto rechaza lo que el flexible acepta', () => {
    const near = face(1, 0.45) // ≈ 0.41 de distancia a sus muestras
    expect(verifyClaimed(candidates, 'ana', near, tuningFor('balanced', 0.6)).kind).toBe('match')
    expect(verifyClaimed(candidates, 'ana', near, tuningFor('balanced', 0.4)).kind).toBe('mismatch')
  })

  it('pide varias lecturas seguidas y reinicia con una que no coincide', () => {
    const session = new ClaimSession(candidates, 'ana')
    const now = 1_000_000
    const first = session.push(face(1, 0.01), t, now)
    expect(first.accepted).toBe(false)
    expect(first.progress).toBe(1)
    session.push(face(1, 0.02), t, now + 200)
    const third = session.push(face(1, 0.01), t, now + 400)
    expect(third.accepted).toBe(true)
    // Un cuadro de otra persona deja el avance en cero.
    const bad = session.push(face(2), t, now + 600)
    expect(bad.progress).toBe(0)
    expect(bad.accepted).toBe(false)
  })

  it('la pausa entre lecturas crece con lo que tardó la anterior y tiene tope', () => {
    expect(paceDelay(10, 40)).toBe(40)
    expect(paceDelay(250, 40)).toBe(200)
    expect(paceDelay(5000, 40)).toBe(400)
  })

  it('una foto reciente sirve; una que esperó más de un minuto se vuelve a tomar', () => {
    const at = (ms: number) => ({ capturedAt: new Date(ms).toISOString() }) as PhotoCapture
    const now = 10_000_000
    expect(photoIsFresh(at(now - 20_000), now)).toBe(true)
    expect(photoIsFresh(at(now - 90_000), now)).toBe(false)
    expect(photoIsFresh({ capturedAt: 'no es fecha' } as PhotoCapture, now)).toBe(false)
  })

  it('una foto de más de 90 días ya no existe: el panel lo dice en vez de "no disponible"', () => {
    const now = Date.parse('2026-10-13T12:00:00Z')
    expect(photoExpired('2026-10-12', now)).toBe(false)
    expect(photoExpired('2026-07-20', now)).toBe(false) // 85 días
    expect(photoExpired('2026-07-10', now)).toBe(true) // 95 días
    expect(photoExpired('no es fecha', now)).toBe(false)
    // Con el plazo propio de la empresa.
    expect(photoExpired('2026-09-01', now, 30)).toBe(true)
    expect(photoExpired('2026-09-01', now, 60)).toBe(false)
  })

  it('el plazo de fotos de la empresa se acota a lo que acepta la base', () => {
    expect(photoRetentionDays(undefined)).toBe(90)
    expect(photoRetentionDays({ photoRetentionDays: 180 })).toBe(180)
    expect(photoRetentionDays({ photoRetentionDays: 5 })).toBe(30)
    expect(photoRetentionDays({ photoRetentionDays: 99999 })).toBe(3650)
    expect(photoRetentionDays({ photoRetentionDays: Number.NaN })).toBe(90)
  })

  it('verificar el rostro con número y PIN viene activado y se puede apagar', () => {
    expect(resolveKiosk(undefined).faceCheckOnPin).toBe(true)
    expect(resolveKiosk({ kiosk: { faceCheckOnPin: false } } as never).faceCheckOnPin).toBe(false)
  })
})

describe('cámara según cómo esté la tablet', () => {
  it('la caja toma la forma real de la imagen una vez derecha', () => {
    expect(uprightAspect(1280, 720, 0)).toBeCloseTo(16 / 9)
    expect(uprightAspect(1280, 720, 90)).toBeCloseTo(9 / 16) // llega acostada y de lado: se ve vertical
    expect(uprightAspect(720, 1280, 270)).toBeCloseTo(16 / 9)
    expect(uprightAspect(720, 1280, 0)).toBeCloseTo(9 / 16)
    expect(uprightAspect(0, 0, 0)).toBeCloseTo(16 / 9) // todavía sin imagen
  })

  it('la ventana depende del equipo y de la distancia: más recorte mientras más lejos', () => {
    // Tablet parada con imagen ancha: normal = un poco más alta que ancha no; 4:3, lejos 3:4, muy cerca entera.
    expect(windowAspect(16 / 9, 'portrait', 'normal')).toBeCloseTo(4 / 3)
    expect(windowAspect(16 / 9, 'portrait', 'far')).toBeCloseTo(3 / 4)
    expect(windowAspect(16 / 9, 'portrait', 'near')).toBeCloseTo(16 / 9)
    // Misma forma que la pantalla: se muestra entera a cualquier distancia.
    expect(windowAspect(16 / 9, 'landscape', 'far')).toBeCloseTo(16 / 9)
    expect(windowAspect(9 / 16, 'portrait', 'far')).toBeCloseTo(9 / 16)
    // Imagen alta con la tablet acostada: ventana horizontal 4:3.
    expect(windowAspect(9 / 16, 'landscape')).toBeCloseTo(4 / 3)
  })

  it('muy cerca acepta rostros grandes; lejos acepta rostros chicos', () => {
    const t = TUNING.balanced
    const near = distanceProfile('near', t)
    const normal = distanceProfile('normal', t)
    const far = distanceProfile('far', t)
    expect(near.maxFace).toBeGreaterThan(normal.maxFace)
    expect(far.minFace).toBeLessThan(normal.minFace)
    // Un rostro que ocupa el 88 % de la imagen: "aléjate" a distancia normal, bien con la tablet pegada.
    const big = { size: 0.88, pixelWidth: 900, brightness: 120, offset: { x: 0, y: 0 }, yaw: 1, sharpness: 5, edgeGap: 0.04 } as FaceReading
    expect(qualityIssues(big, { minFace: normal.minFace, maxFace: normal.maxFace })).toContain('close')
    expect(qualityIssues(big, { minFace: near.minFace, maxFace: near.maxFace })).not.toContain('close')
  })

  it('la distancia del reloj viene en automática y solo acepta valores conocidos', () => {
    expect(resolveKiosk(undefined).faceDistance).toBe('auto')
    expect(resolveKiosk({ kiosk: { faceDistance: 'near' } } as never).faceDistance).toBe('near')
    expect(resolveKiosk({ kiosk: { faceDistance: 'normal' } } as never).faceDistance).toBe('normal')
    expect(resolveKiosk({ kiosk: { faceDistance: 'cerquita' } } as never).faceDistance).toBe('auto')
  })

  it('prueba primero un cuarto de vuelta cuando la imagen no coincide con la pantalla', () => {
    // Tablet vertical que entrega una imagen horizontal: casi seguro viene girada 90°.
    expect(rotationCandidates('portrait', 'landscape', 0)).toEqual([90, 270, 180])
    // Misma forma: lo único posible es de cabeza.
    expect(rotationCandidates('landscape', 'landscape', 0)).toEqual([180, 90, 270])
    // Nunca vuelve a probar la que ya tiene.
    expect(rotationCandidates('portrait', 'landscape', 90)).toEqual([270, 180, 0])
  })

  it('recuerda el giro por cada forma de sostener el equipo', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    const vertical = viewKey('portrait', 'landscape')
    const horizontal = viewKey('landscape', 'landscape')
    expect(loadRotation(vertical)).toBe(0)
    saveRotation(vertical, 90)
    expect(loadRotation(vertical)).toBe(90)
    expect(loadRotation(horizontal)).toBe(0)
    expect(nextRotation(270)).toBe(0)
    expect(nextRotation(0)).toBe(90)
    vi.unstubAllGlobals()
  })

  it('aclara solo cuando hace falta y con tope', () => {
    expect(gainFor(140)).toBe(1) // luz de sobra: no toca nada
    expect(gainFor(105)).toBe(1)
    expect(gainFor(52)).toBeCloseTo(2.02, 1)
    expect(gainFor(10)).toBe(2.4) // casi a oscuras: nunca más de 2,4×
    expect(gainFor(0)).toBe(1)
    expect(gainFor(Number.NaN)).toBe(1)
  })
})

describe('encuadre automático', () => {
  const aspect = 16 / 9
  const target = targetFaceRatio(aspect)
  const opts = { min: 1, max: AUTO_MAX_ZOOM, target, aspect }
  const centred = { x: 0, y: 0 }

  it('la cara objetivo cabe dentro del óvalo en cualquier forma de ventana', () => {
    for (const a of [0.75, 1, 4 / 3, 16 / 9]) {
      const t = targetFaceRatio(a)
      expect(t).toBeGreaterThan(0.2)
      expect(t).toBeLessThanOrEqual(0.55)
    }
  })

  it('acerca la imagen cuando la cara se ve chica, sin pasar el tope', () => {
    let zoom = 1
    for (let i = 0; i < 12; i++) zoom = nextAutoZoom(zoom, 0.1, centred, opts)
    expect(zoom).toBeGreaterThan(1.8)
    expect(zoom).toBeLessThanOrEqual(AUTO_MAX_ZOOM)
    // Muy lejos: llega al tope y ahí se queda.
    for (let i = 0; i < 40; i++) zoom = nextAutoZoom(zoom, 0.02, centred, opts)
    expect(zoom).toBe(AUTO_MAX_ZOOM)
  })

  it('aleja la imagen cuando la cara se ve enorme, sin bajar de la base', () => {
    let zoom = 2
    for (let i = 0; i < 12; i++) zoom = nextAutoZoom(zoom, 0.8, centred, opts)
    expect(zoom).toBeLessThan(1.2)
    for (let i = 0; i < 40; i++) zoom = nextAutoZoom(zoom, 0.95, centred, opts)
    expect(zoom).toBe(1)
    // La base configurada manda como mínimo.
    expect(nextAutoZoom(1.4, 0.95, centred, { ...opts, min: 1.4 })).toBe(1.4)
  })

  it('no se mueve por diferencias pequeñas ni cambia de golpe', () => {
    expect(nextAutoZoom(1.5, target * 1.1, centred, opts)).toBe(1.5)
    expect(nextAutoZoom(1.5, target * 0.9, centred, opts)).toBe(1.5)
    const jump = nextAutoZoom(1, 0.05, centred, opts)
    expect(jump).toBeLessThanOrEqual(1.2 + 1e-9)
  })

  it('no acerca tanto que la cara salga de la ventana', () => {
    // Cara pegada a la orilla izquierda: acercar la sacaría; no debe acercar de más.
    const edge = nextAutoZoom(1, 0.15, { x: -0.38, y: 0 }, opts)
    expect(edge).toBeLessThan(1.1)
    // Cara chica y centrada sí puede acercarse.
    expect(nextAutoZoom(1, 0.15, centred, opts)).toBeGreaterThan(1.1)
  })
})
