/**
 * Face recognition, fully in the browser (face-api / TensorFlow.js).
 *
 * Nothing leaves the device: the camera frames are processed locally and only a
 * 128-number descriptor per sample is stored for each enrolled employee — never
 * a photo. The models are served from /models and cached by the browser.
 */
import type { Employee, FaceStrictness } from '@/types'

export type FaceApi = typeof import('@vladmandic/face-api')

let apiPromise: Promise<FaceApi> | null = null

/** Lazy-loads the library (≈1.3 MB) and the three models (≈12 MB) once. */
export function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = await import('@vladmandic/face-api')
      const tf = api.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> }
      try {
        await tf.setBackend('webgl')
      } catch {
        await tf.setBackend('cpu')
      }
      await tf.ready()
      const base = `${import.meta.env.BASE_URL}models`
      await Promise.all([
        // Two detectors: the tiny one is several times faster and handles the normal case;
        // SSD MobileNet is slower but finds faces in poor light, at an angle or farther away,
        // so it is the fallback (and what enrollment uses for its saved samples).
        api.nets.tinyFaceDetector.loadFromUri(base),
        api.nets.ssdMobilenetv1.loadFromUri(base),
        api.nets.faceLandmark68Net.loadFromUri(base),
        api.nets.faceRecognitionNet.loadFromUri(base),
      ])
      // The first inference of each network compiles its GPU shaders (seconds on a tablet).
      // Pay that here, in the background / on the "Preparando…" screen, instead of on the
      // first real camera frame: run every network once on blank input.
      try {
        const canvas = (size: number) => Object.assign(document.createElement('canvas'), { width: size, height: size })
        await api.detectAllFaces(canvas(160), new api.TinyFaceDetectorOptions({ inputSize: 320 }))
        await api.detectAllFaces(canvas(160), new api.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        await api.nets.faceLandmark68Net.detectLandmarks(canvas(112))
        await api.nets.faceRecognitionNet.computeFaceDescriptor(canvas(150))
      } catch {
        /* warm-up is best effort */
      }
      return api
    })().catch((err) => {
      apiPromise = null // let the next attempt retry
      throw err
    })
  }
  return apiPromise
}

/* -------------------------------------------------------------------------- */
/*  Strictness                                                                 */
/* -------------------------------------------------------------------------- */

export interface Tuning {
  /** Euclidean distance below this counts as the same person (lower = stricter). */
  threshold: number
  /** The best match must beat the runner-up by this much, to avoid look-alikes. */
  margin: number
  /** Consecutive agreeing frames required before the match is trusted. */
  streak: number
  /** Smallest face (width ÷ frame width) worth reading: a simple camera needs the person nearer, or this lower. */
  minFace: number
  /** Minimum confidence of the face detector (lower finds smaller, noisier faces). */
  minConfidence: number
}

/**
 * The three levels are presented to the administrator as the camera they have:
 * strict = a good camera (8 MP or more), balanced = a normal one (≈5 MP), relaxed = a basic
 * tablet camera (≈2 MP or less), which sees smaller, softer, noisier faces and so needs a more
 * tolerant match and a lower size / detector bar. The margin against the second most similar
 * person keeps protecting against look-alikes at every level.
 */
export const TUNING: Record<FaceStrictness, Tuning> = {
  strict: { threshold: 0.5, margin: 0.07, streak: 3, minFace: 0.15, minConfidence: 0.5 },
  // ≈25% de coincidencia mínima (antes ≈28% y, antes, ≈40%) — reconoce más rápido, con más tolerancia.
  balanced: { threshold: 0.675, margin: 0.04, streak: 2, minFace: 0.15, minConfidence: 0.5 },
  relaxed: { threshold: 0.72, margin: 0.03, streak: 2, minFace: 0.1, minConfidence: 0.4 },
}

/** Strictness level, optionally with an explicit distance limit set by the administrator. */
export function tuningFor(strictness: FaceStrictness, threshold: number | null = null): Tuning {
  const base = TUNING[strictness]
  return threshold == null ? base : { ...base, threshold }
}

/** Minimum face width as a fraction of the frame, so the descriptor is reliable. */
export const MIN_FACE_RATIO = 0.15
/** Above this the face fills the frame and gets clipped. */
export const MAX_FACE_RATIO = 0.8
/** Mean |Laplacian| below this reads as an out-of-focus image (used at enrollment). */
export const MIN_SHARPNESS = 1.0

/* -------------------------------------------------------------------------- */
/*  Reading a frame                                                            */
/* -------------------------------------------------------------------------- */

export interface FaceReading {
  /** Present only when the descriptor was requested. */
  descriptor?: number[]
  /** Face width relative to the video width. */
  size: number
  /** Mean brightness of the face region, 0–255. */
  brightness: number
  /** Face centre offset from the frame centre, −0.5…0.5 on each axis. */
  offset: { x: number; y: number }
  /**
   * Head turn: distance nose→left jaw ÷ nose→right jaw, in image coordinates.
   * ≈1 looking straight, <1 / >1 when turned to either side.
   */
  yaw: number
  /** Focus measure of the face: mean absolute Laplacian, higher = sharper. */
  sharpness: number
  /** Smallest gap between the face box and any frame edge, as a fraction of the frame (negative = clipped). */
  edgeGap: number
}
export type ReadResult = { kind: 'none' } | { kind: 'multiple' } | { kind: 'face'; reading: FaceReading }

type Point = { x: number; y: number }
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

let sampler: HTMLCanvasElement | null = null

let focusSampler: HTMLCanvasElement | null = null
const FOCUS = 64

/** Average luminance of the face box, from a tiny downscaled copy of the frame. */
function faceBrightness(video: HTMLVideoElement | HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }) {
  sampler ??= Object.assign(document.createElement('canvas'), { width: 24, height: 24 })
  const ctx = sampler.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 128
  ctx.drawImage(video, Math.max(0, box.x), Math.max(0, box.y), box.width, box.height, 0, 0, 24, 24)
  const { data } = ctx.getImageData(0, 0, 24, 24)
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  return sum / (data.length / 4)
}

/**
 * Focus of the face: a central crop of the face taken at (almost) native resolution,
 * so blur is not averaged away by downscaling; mean absolute Laplacian of its luminance.
 */
function faceSharpness(video: HTMLVideoElement | HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }) {
  focusSampler ??= Object.assign(document.createElement('canvas'), { width: FOCUS, height: FOCUS })
  const ctx = focusSampler.getContext('2d', { willReadFrequently: true })
  if (!ctx) return MIN_SHARPNESS * 4
  const side = Math.min(box.width, box.height) * 0.5
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  ctx.drawImage(video, Math.max(0, cx - side / 2), Math.max(0, cy - side / 2), side, side, 0, 0, FOCUS, FOCUS)
  const { data } = ctx.getImageData(0, 0, FOCUS, FOCUS)
  const g = new Float32Array(FOCUS * FOCUS)
  for (let i = 0; i < g.length; i++) g[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]
  let sum = 0
  for (let y = 1; y < FOCUS - 1; y++) {
    for (let x = 1; x < FOCUS - 1; x++) {
      const i = y * FOCUS + x
      sum += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - FOCUS] - g[i + FOCUS])
    }
  }
  return sum / ((FOCUS - 2) * (FOCUS - 2))
}

/**
 * 'accurate' (default): SSD MobileNet. Every descriptor that is saved or compared (enrollment
 * samples, the reloj, the recognition test) must come from this one: a different detector
 * shifts the descriptor of the same face by ≈0.09, which we avoid paying for matching.
 * 'fast': the tiny detector, with SSD as a fallback when it finds nothing. Only for readings
 * that never leave the screen (enrollment pose guidance), where speed is free.
 */
export type DetectorKind = 'fast' | 'accurate'

export interface ReadOptions {
  /**
   * Digital zoom (≥ 1): read only the central 1/zoom of the frame, copied at its native pixels. Lets a
   * person who stands back from a wide-angle tablet camera count as "near", without losing detail
   * (the descriptor is computed from the same native pixels either way).
   */
  zoom?: number
  /** SSD minimum confidence (default 0.5). Lower finds smaller or noisier faces. */
  minConfidence?: number
}

let zoomCanvas: HTMLCanvasElement | null = null
let wideCanvas: HTMLCanvasElement | null = null
/** Consecutive frames where no face was found; the wide-margin retry runs every few of them. */
let emptyFrames = 0
const WIDE_RETRY_EVERY = 3
let lastWideAt = 0
const WIDE_STICKY_MS = 3000
/** The margin copy is never larger than this on its long side (the detector shrinks it anyway). */
const WIDE_MAX_SIDE = 640

export async function readFace(
  api: FaceApi,
  video: HTMLVideoElement,
  withDescriptor: boolean,
  detector: DetectorKind = 'accurate',
  options: ReadOptions = {},
): Promise<ReadResult> {
  let source: HTMLVideoElement | HTMLCanvasElement = video
  let vw = video.videoWidth || 1
  let vh = video.videoHeight || 1
  const zoom = options.zoom && options.zoom > 1 ? options.zoom : 1
  if (zoom > 1 && vw > 1) {
    const sw = Math.round(vw / zoom)
    const sh = Math.round(vh / zoom)
    zoomCanvas ??= document.createElement('canvas')
    if (zoomCanvas.width !== sw || zoomCanvas.height !== sh) {
      zoomCanvas.width = sw
      zoomCanvas.height = sh
    }
    zoomCanvas.getContext('2d')?.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, sw, sh)
    source = zoomCanvas
    vw = sw
    vh = sh
  }
  const detectOn = (
    input: HTMLVideoElement | HTMLCanvasElement,
    detection: Parameters<FaceApi['detectAllFaces']>[1],
    descriptor = withDescriptor,
  ) => {
    const task = api.detectAllFaces(input, detection).withFaceLandmarks()
    return descriptor ? task.withFaceDescriptors() : task
  }
  const ssdOptions = () =>
    new api.SsdMobilenetv1Options({ minConfidence: options.minConfidence ?? 0.5, maxResults: 3 })
  let faces =
    detector === 'accurate'
      ? await detectOn(source, ssdOptions())
      : await detectOn(source, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }))
  if (faces.length === 0 && detector === 'fast') faces = await detectOn(source, ssdOptions())

  // The detectors cannot find a face that fills (or overflows) the frame: the person is simply too close,
  // and the screen used to say "place your face in the oval" while it was already filling it. Every few
  // empty frames look again on a copy with a wide margin; a face found that way is reported with its real
  // (oversized) measures, so the quality check can say "aléjate" instead.
  let wide: { x: number; y: number; scale: number } | null = null
  // Once someone was found too close, keep looking on every frame (so "aléjate" doesn't flicker).
  const retryWide = ++emptyFrames % WIDE_RETRY_EVERY === 0 || Date.now() - lastWideAt < WIDE_STICKY_MS
  if (faces.length === 0 && retryWide) {
    const scale = Math.min(1, WIDE_MAX_SIDE / (vw * 2))
    const ww = Math.max(1, Math.round(vw * 2 * scale))
    const wh = Math.max(1, Math.round(vh * 2 * scale))
    wideCanvas ??= document.createElement('canvas')
    if (wideCanvas.width !== ww || wideCanvas.height !== wh) {
      wideCanvas.width = ww
      wideCanvas.height = wh
    }
    const g = wideCanvas.getContext('2d')
    if (g) {
      g.fillStyle = '#808080'
      g.fillRect(0, 0, ww, wh)
      g.drawImage(source, (vw / 2) * scale, (vh / 2) * scale, vw * scale, vh * scale)
      // Guidance only: the margin copy is downscaled, so it never yields a descriptor (nothing is
      // compared or saved from it — the person is told to step back and a normal read follows).
      const found = await detectOn(wideCanvas, ssdOptions(), false)
      if (found.length === 1) {
        faces = found
        wide = { x: vw / 2, y: vh / 2, scale }
        lastWideAt = Date.now()
      }
    }
  }
  if (faces.length > 0) emptyFrames = 0
  if (faces.length === 0) return { kind: 'none' }
  if (faces.length > 1) return { kind: 'multiple' }
  const f = faces[0]
  const raw = f.detection.box
  // Back to the original frame's coordinates (the margin copy is scaled and shifted).
  const box = wide
    ? { x: raw.x / wide.scale - wide.x, y: raw.y / wide.scale - wide.y, width: raw.width / wide.scale, height: raw.height / wide.scale }
    : raw
  const pts = f.landmarks.positions
  const yaw = dist(pts[30], pts[0]) / Math.max(1, dist(pts[30], pts[16]))
  const descriptor =
    withDescriptor && 'descriptor' in f ? Array.from((f as { descriptor: Float32Array }).descriptor) : undefined
  return {
    kind: 'face',
    reading: {
      descriptor,
      size: box.width / vw,
      brightness: faceBrightness(source, box),
      offset: { x: (box.x + box.width / 2) / vw - 0.5, y: (box.y + box.height / 2) / vh - 0.5 },
      yaw,
      sharpness: faceSharpness(source, box),
      edgeGap: Math.min(box.x / vw, box.y / vh, 1 - (box.x + box.width) / vw, 1 - (box.y + box.height) / vh),
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Quality                                                                    */
/* -------------------------------------------------------------------------- */

export type QualityIssue = 'small' | 'close' | 'cut_off' | 'off_center' | 'dark' | 'bright' | 'blurry'

export const QUALITY_TEXT: Record<QualityIssue, string> = {
  small: 'Acércate un poco más',
  close: 'Aléjate un poco de la cámara',
  cut_off: 'Tu rostro debe verse completo dentro de la imagen',
  blurry: 'La imagen está borrosa: mantente quieto y limpia el lente',
  off_center: 'Centra tu rostro en el óvalo',
  dark: 'Hay poca luz: busca una zona más iluminada',
  bright: 'Hay demasiada luz detrás de ti: evita ventanas o focos a tu espalda',
}

/** What is wrong with this frame for recognition, most important first. */
export function qualityIssues(r: FaceReading, opts: { blur?: boolean; minFace?: number } = {}): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (r.size < (opts.minFace ?? MIN_FACE_RATIO)) issues.push('small')
  if (r.size > MAX_FACE_RATIO) issues.push('close')
  else if (r.edgeGap < -0.02) issues.push('cut_off')
  if (Math.abs(r.offset.x) > 0.3 || Math.abs(r.offset.y) > 0.3) issues.push('off_center')
  if (r.brightness < 40) issues.push('dark')
  if (r.brightness > 235) issues.push('bright')
  if (opts.blur && r.sharpness < MIN_SHARPNESS) issues.push('blurry')
  return issues
}

/* -------------------------------------------------------------------------- */
/*  Matching                                                                   */
/* -------------------------------------------------------------------------- */

export function descriptorDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}

/** Component-wise mean of several descriptors: averages out frame-to-frame noise. */
export function meanDescriptor(list: number[][]): number[] {
  const out = new Array<number>(list[0].length).fill(0)
  for (const d of list) for (let i = 0; i < d.length; i++) out[i] += d[i] / list.length
  return out
}

export interface FaceCandidate {
  employee: Employee
  descriptors: number[][]
}

/** Employees that can be recognised: active, face method on, at least one sample. */
export function faceCandidates(employees: Employee[]): FaceCandidate[] {
  return employees
    .filter((e) => e.status === 'active')
    .map((employee) => {
      const id = employee.identifications.find((i) => i.method === 'face')
      return { employee, descriptors: id?.enabled ? (id.descriptors ?? []) : [] }
    })
    .filter((c) => c.descriptors.length > 0)
}

export interface FaceMatch {
  employee: Employee
  distance: number
  /** Distance to the closest *other* employee (Infinity when there is none). */
  runnerUp: number
}

export function nearestFace(candidates: FaceCandidate[], descriptor: number[]): FaceMatch | null {
  const scored = candidates
    .map((c) => {
      // Mean of the two closest samples: robust to one bad sample, harder to fool than "best of all".
      const d = c.descriptors.map((s) => descriptorDistance(s, descriptor)).sort((a, b) => a - b)
      return { employee: c.employee, distance: d.length > 1 ? d[0] * 0.7 + d[1] * 0.3 : d[0] }
    })
    .sort((a, b) => a.distance - b.distance)
  if (scored.length === 0) return null
  return { ...scored[0], runnerUp: scored[1]?.distance ?? Infinity }
}

/** A trustworthy match: close enough AND clearly closer than anyone else. */
export function isConfidentMatch(m: FaceMatch | null, t: Tuning = TUNING.balanced): m is FaceMatch {
  return !!m && m.distance < t.threshold && m.runnerUp - m.distance >= t.margin
}

/** 0–100 for display; only a friendly reading of the distance. */
export function matchPercent(distance: number): number {
  return Math.max(0, Math.min(99, Math.round((1 - distance / 0.9) * 100)))
}
