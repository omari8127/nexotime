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

/** Lazy-loads the library (≈1.3 MB) and the three models (≈7 MB) once. */
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
        api.nets.tinyFaceDetector.loadFromUri(base),
        api.nets.faceLandmark68Net.loadFromUri(base),
        api.nets.faceRecognitionNet.loadFromUri(base),
      ])
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
}

export const TUNING: Record<FaceStrictness, Tuning> = {
  strict: { threshold: 0.46, margin: 0.08, streak: 3 },
  balanced: { threshold: 0.54, margin: 0.05, streak: 2 },
  relaxed: { threshold: 0.6, margin: 0.04, streak: 2 },
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
  /** Eye aspect ratio, averaged over both eyes (≈0.3 open, <0.2 closed). */
  ear: number
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
const eyeRatio = (e: Point[]) => (dist(e[1], e[5]) + dist(e[2], e[4])) / (2 * dist(e[0], e[3]))

let sampler: HTMLCanvasElement | null = null

let focusSampler: HTMLCanvasElement | null = null
const FOCUS = 64

/** Average luminance of the face box, from a tiny downscaled copy of the frame. */
function faceBrightness(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }) {
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
function faceSharpness(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }) {
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

export async function readFace(
  api: FaceApi,
  video: HTMLVideoElement,
  withDescriptor: boolean,
): Promise<ReadResult> {
  const options = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
  const task = api.detectAllFaces(video, options).withFaceLandmarks()
  const faces = withDescriptor ? await task.withFaceDescriptors() : await task
  if (faces.length === 0) return { kind: 'none' }
  if (faces.length > 1) return { kind: 'multiple' }
  const f = faces[0]
  const box = f.detection.box
  const vw = video.videoWidth || 1
  const vh = video.videoHeight || 1
  const ear = (eyeRatio(f.landmarks.getLeftEye()) + eyeRatio(f.landmarks.getRightEye())) / 2
  const pts = f.landmarks.positions
  const yaw = dist(pts[30], pts[0]) / Math.max(1, dist(pts[30], pts[16]))
  const descriptor =
    withDescriptor && 'descriptor' in f ? Array.from((f as { descriptor: Float32Array }).descriptor) : undefined
  return {
    kind: 'face',
    reading: {
      descriptor,
      ear,
      size: box.width / vw,
      brightness: faceBrightness(video, box),
      offset: { x: (box.x + box.width / 2) / vw - 0.5, y: (box.y + box.height / 2) / vh - 0.5 },
      yaw,
      sharpness: faceSharpness(video, box),
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
export function qualityIssues(r: FaceReading, opts: { blur?: boolean } = {}): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (r.size < MIN_FACE_RATIO) issues.push('small')
  if (r.size > MAX_FACE_RATIO) issues.push('close')
  else if (r.edgeGap < -0.02) issues.push('cut_off')
  if (Math.abs(r.offset.x) > 0.3 || Math.abs(r.offset.y) > 0.3) issues.push('off_center')
  if (r.brightness < 40) issues.push('dark')
  if (r.brightness > 235) issues.push('bright')
  if (opts.blur && r.sharpness < MIN_SHARPNESS) issues.push('blurry')
  return issues
}

/** How turned the head is, relative to facing the camera (0 = straight). */
export const turnAmount = (yaw: number) => Math.abs(Math.log(yaw))
/** Which way: −1 / +1 (image coordinates), 0 when roughly straight. */
export const turnSide = (yaw: number): -1 | 0 | 1 => (turnAmount(yaw) < 0.12 ? 0 : yaw < 1 ? -1 : 1)

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

/* -------------------------------------------------------------------------- */
/*  Liveness                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Blink = the eyes close and reopen. Judged relative to the person own open-eye
 * level (so glasses or narrow eyes still work), which a still photo cannot do.
 */
export class BlinkDetector {
  private openLevel = 0
  private closed = false
  blinks = 0

  update(ear: number): number {
    this.openLevel = Math.max(ear, this.openLevel * 0.97) // slow decay adapts to lighting
    if (!this.closed && ear < this.openLevel * 0.85) this.closed = true
    else if (this.closed && ear > this.openLevel * 0.93) {
      this.closed = false
      this.blinks += 1
    }
    return this.blinks
  }
}
