/**
 * Face recognition, fully in the browser, with the Human library (TensorFlow.js).
 *
 * Nothing leaves the device: the camera frames are processed locally and only a numeric
 * descriptor per sample (1024 numbers) is stored for each enrolled employee — never a photo.
 * Three models are used, served from /models/human and cached by the browser and the service worker:
 * BlazeFace (finds the face), FaceMesh (468 points: alignment and head turn) and FaceRes (the descriptor).
 *
 * Replaced face-api (archived by its author in 2025) because it stalled the camera on tablets: its
 * detector alone took 100+ ms a frame there. BlazeFace takes a few.
 */
import type { Config, Human } from '@vladmandic/human'
import type { Employee, FaceDistance, FaceStrictness } from '@/types'
import { waitForFreshFrame } from './camera'
import {
  gainFor,
  rotationCandidates,
  screenOrientation,
  streamOrientation,
  type Rotation,
} from './cameraView'

/** The loaded engine. Kept under its old name so the screens did not have to change. */
export type FaceApi = Human

/** Numbers in one descriptor of this engine (FaceRes). Samples of the old engine had 128: they no longer count. */
export const DESCRIPTOR_LENGTH = 1024

const CONFIG: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: `${import.meta.env.BASE_URL}models/human/`,
  async: true,
  warmup: 'none',
  // Never answer with a cached result because the picture "barely changed": every reading must be a
  // real one (a frozen frame must not count as another confirmation).
  cacheSensitivity: 0,
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: {
      modelPath: 'blazeface.json',
      rotation: true,
      maxDetected: 3,
      minConfidence: 0.35,
      skipFrames: 0,
      skipTime: 0,
      return: false,
    },
    mesh: { enabled: true, modelPath: 'facemesh.json' },
    attention: { enabled: false },
    iris: { enabled: false },
    description: { enabled: true, modelPath: 'faceres.json', skipFrames: 0, skipTime: 0, minConfidence: 0.1 },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
} as Partial<Config>

let apiPromise: Promise<FaceApi> | null = null
/** Downloading the models on a slow connection plus compiling them on a weak tablet: generous, but finite. */
const LOAD_TIMEOUT_MS = 90_000

/** Lazy-loads the library and the three models (≈9 MB) once, and compiles their GPU programs. */
export function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const { Human } = await import('@vladmandic/human')
      const start = async (backend: 'webgl' | 'cpu') => {
        const human = new Human({ ...CONFIG, backend } as Partial<Config>)
        await human.load()
        // The first inference of each network compiles its GPU programs (seconds on a tablet). Pay it here,
        // on the "Preparando…" screen, not on the first real camera frames.
        await human.warmup({ warmup: 'face' } as Partial<Config>)
        return human
      }
      // Never leave the reloj on "Preparando…" forever: past this, give up so the screen offers a retry.
      const inTime = <T,>(work: Promise<T>) =>
        Promise.race([
          work,
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('El reconocimiento facial tardó demasiado en prepararse.')), LOAD_TIMEOUT_MS),
          ),
        ])
      try {
        return await inTime(start('webgl'))
      } catch (err) {
        if (err instanceof Error && err.message.includes('tardó demasiado')) throw err
        // Some tablets have no usable WebGL (or fail compiling): slower, but it works.
        return inTime(start('cpu'))
      }
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

/**
 * Distances are Euclidean distance between descriptors ÷ 20 (Human's own normalised similarity is
 * `(0.8 − distance) ÷ 0.6`). Calibrated on real photos (Human's face-match sample: 13 photos of one person
 * taken years apart vs 71 photos of other people, scored like the reloj — mean of the two closest of 5
 * enrolled samples): no other person came closer than 0.456; at 0.44 none was accepted, at 0.50 14 of 71
 * were. The library's suggested 0.5 is therefore NOT used. At the reloj (same camera, same light) the same
 * person reads 0.10–0.30 from their own samples.
 */
export interface Tuning {
  /** Distance below this counts as the same person (lower = stricter). */
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

export const TUNING: Record<FaceStrictness, Tuning> = {
  strict: { threshold: 0.38, margin: 0.05, streak: 3, minFace: 0.15, minConfidence: 0.5 },
  balanced: { threshold: 0.42, margin: 0.04, streak: 3, minFace: 0.15, minConfidence: 0.45 },
  relaxed: { threshold: 0.45, margin: 0.03, streak: 3, minFace: 0.1, minConfidence: 0.35 },
}

/** Limits of the administrator's own distance setting (Configuración → Reloj checador). */
export const THRESHOLD_MIN = 0.3
export const THRESHOLD_MAX = 0.5

/**
 * Distances the rest of the app reasons with, on this engine's scale.
 *  - sameFrame: two readings a moment apart that differ more than this are not the same person.
 *  - duplicate: a new sample this close to SOMEONE ELSE's is refused at enrollment (same face twice).
 *  - samePersonFront / samePersonTurned: an enrollment sample must stay this close to the person's first one.
 */
export const FACE_DISTANCE = {
  sameFrame: 0.36,
  duplicate: 0.32,
  samePersonFront: 0.4,
  samePersonTurned: 0.46,
}

/** Strictness level, optionally with an explicit distance limit set by the administrator. */
export function tuningFor(strictness: FaceStrictness, threshold: number | null = null): Tuning {
  const base = TUNING[strictness]
  return threshold == null || !Number.isFinite(threshold)
    ? base
    : { ...base, threshold: Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, threshold)) }
}

/** Minimum face width as a fraction of the frame, so the descriptor is reliable. */
export const MIN_FACE_RATIO = 0.15
/** Above this the face fills the frame and gets clipped. */
export const MAX_FACE_RATIO = 0.85

/**
 * What "near" and "far" mean for the reloj. A tablet on a wall with people at arm's reach sees a face that
 * fills most of the picture: that is expected there, not "too close" (and a stranger walking past, far
 * away, is not "close enough"). Far counters need the opposite: faces are small, so smaller is accepted.
 */
export function distanceProfile(distance: FaceDistance, tuning: Tuning): { minFace: number; maxFace: number } {
  // Automatic: the zoom follows the face (autoFrame), so "small" and "close" only matter once the zoom
  // has reached its limit; at 1× a face may fill almost the whole picture.
  if (distance === 'auto') return { minFace: 0.12, maxFace: 0.93 }
  if (distance === 'near') return { minFace: Math.max(tuning.minFace, 0.25), maxFace: 0.93 }
  if (distance === 'far') return { minFace: Math.min(tuning.minFace, 0.08), maxFace: MAX_FACE_RATIO }
  return { minFace: tuning.minFace, maxFace: MAX_FACE_RATIO }
}
/** Mean |Laplacian| below this reads as an out-of-focus image (used at enrollment). */
export const MIN_SHARPNESS = 1.0
/** Initial engineering floor, to validate on the actual deployment cameras. */
export const MIN_FACE_PIXELS = 80

/* -------------------------------------------------------------------------- */
/*  Reading a frame                                                            */
/* -------------------------------------------------------------------------- */

export interface FaceReading {
  /** Present only when the descriptor was requested. */
  descriptor?: number[]
  /** Face width relative to the video width. */
  size: number
  /** Actual sensor pixels, unaffected by digital zoom. */
  pixelWidth: number
  /** Mean brightness of the face region, 0–255. */
  brightness: number
  /** Face centre offset from the frame centre, −0.5…0.5 on each axis. */
  offset: { x: number; y: number }
  /**
   * Head turn: distance nose→one side of the face ÷ nose→the other side, in image coordinates.
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
type Box = { x: number; y: number; width: number; height: number }
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

let sampler: HTMLCanvasElement | null = null

let focusSampler: HTMLCanvasElement | null = null
const FOCUS = 64

/** Average luminance of the face box, from a tiny downscaled copy of the frame. */
function faceBrightness(video: HTMLVideoElement | HTMLCanvasElement, box: Box) {
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
function faceSharpness(video: HTMLVideoElement | HTMLCanvasElement, box: Box) {
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
 * Kept for the callers. With face-api 'fast' meant the light detector for on-screen guidance; this
 * engine has a single detector that is fast enough for both, so the two now read the same way.
 */
export type DetectorKind = 'fast' | 'accurate'

export interface ReadOptions {
  /**
   * Digital zoom (≥ 1): read only the central 1/zoom of the frame, copied at its native pixels. Lets a
   * person who stands back from a wide-angle tablet camera count as "near", without losing detail
   * (the descriptor is computed from the same native pixels either way).
   */
  zoom?: number
  /** Detector minimum confidence (default 0.45). Lower finds smaller or noisier faces. */
  minConfidence?: number
  /**
   * Measure focus (default true). It costs an extra read of the frame, so the reloj, which does not
   * gate on blur, turns it off; enrollment (which does) keeps it.
   */
  sharpness?: boolean
  /** Quarter turns that make the picture upright (a sideways or upside-down camera); see cameraView. */
  rotation?: Rotation
  /**
   * Width ÷ height of the part of the (upright) picture that the screen shows. A tablet held upright shows
   * a tall window cut from the middle of the camera's wide picture, and that same part is what is read.
   */
  fitAspect?: number
}

/** Consecutive frames where no face was found; the wide-margin retry runs every few of them. */
let emptyFrames = 0
const WIDE_RETRY_EVERY = 3
let lastWideAt = 0
const WIDE_STICKY_MS = 3000
/** The margin copy is never larger than this on its long side (the detector shrinks it anyway). */
const WIDE_MAX_SIDE = 640
/** Longest side of the image the networks work on. The detector looks at 256 px and the descriptor at a
 *  224 px crop of the face: a bigger copy only costs memory, upload time and garbage collection. */
const MAX_WORK_SIDE = 960
/** A device whose reading takes longer than this works on a smaller image (less to copy and upload). */
const SLOW_READ_MS = 120
const SLOW_WORK_SIDE = 640

/** How long a reading takes on THIS device (moving average). */
let readMs = 0
/** Brightening applied to what the networks see (1 = none): follows how dark the faces seen lately were. */
let autoGain = 1
const ema = (previous: number, sample: number) => (previous === 0 ? sample : previous * 0.7 + sample * 0.3)
let workCanvas: HTMLCanvasElement | null = null
let wideCanvas: HTMLCanvasElement | null = null

/** One canvas reused for every reading: allocating a new 8 MB canvas per frame floods the garbage collector. */
function sized(existing: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
  const canvas = existing ?? document.createElement('canvas')
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  return canvas
}

/**
 * Pause before the next reading so the GPU is not busy more than about half the time: a tablet that
 * runs the networks back to back also has to composite the live video, and the preview freezes.
 */
export function paceDelay(lastMs: number, minMs: number, maxMs = 400, ratio = 0.8): number {
  return Math.round(Math.min(maxMs, Math.max(minMs, lastMs * ratio)))
}

/** Detector-only reading (no mesh, no descriptor): just "is there a face, and where". */
const BOXES_ONLY = {
  face: { mesh: { enabled: false }, description: { enabled: false } },
} as unknown as Partial<Config>

const boxOf = (b: [number, number, number, number] | number[]): Box => ({ x: b[0], y: b[1], width: b[2], height: b[3] })

/**
 * Which quarter turn, other than the current one, makes a face visible? Cheap (the detector only, on a
 * small copy), one rotation at a time; null when none does. Run when readings keep finding nobody.
 */
export function findFaceRotation(api: FaceApi, video: HTMLVideoElement, current: Rotation): Promise<Rotation | null> {
  const run = readQueue.then(async () => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    const side = Math.min(1, 480 / Math.max(w, h))
    const dw = Math.round(w * side)
    const dh = Math.round(h * side)
    // Score of the best face at each rotation, the current one included: another rotation must show a
    // clearly better face, otherwise a person standing off to the side (outside the window the screen
    // shows) would get the picture turned on its side.
    const scoreAt = async (rot: Rotation) => {
      const quarter = rot === 90 || rot === 270
      const canvas = document.createElement('canvas')
      canvas.width = quarter ? dh : dw
      canvas.height = quarter ? dw : dh
      const g = canvas.getContext('2d')
      if (!g) return 0
      g.translate(canvas.width / 2, canvas.height / 2)
      g.rotate((rot * Math.PI) / 180)
      g.drawImage(video, -dw / 2, -dh / 2, dw, dh)
      const found = (await api.detect(canvas, BOXES_ONLY)).face
      return found.length === 1 ? found[0].boxScore : 0
    }
    const here = await scoreAt(current)
    if (here >= 0.35) return null
    let best: { rot: Rotation; score: number } | null = null
    for (const rot of rotationCandidates(screenOrientation(), streamOrientation(w, h), current)) {
      const score = await scoreAt(rot)
      if (score >= 0.7 && (!best || score > best.score)) best = { rot, score }
    }
    return best ? best.rot : null
  })
  readQueue = run.then(() => undefined, () => undefined)
  return run
}

/** Readings run one at a time: they share the work canvases (and the GPU). */
let readQueue: Promise<unknown> = Promise.resolve()

export function readFace(
  api: FaceApi,
  video: HTMLVideoElement | HTMLCanvasElement,
  withDescriptor: boolean,
  detector: DetectorKind = 'accurate',
  options: ReadOptions = {},
): Promise<ReadResult> {
  const run = readQueue.then(() => readFaceNow(api, video, withDescriptor, detector, options))
  readQueue = run.then(() => undefined, () => undefined)
  return run
}

/** Mesh points used for the head turn: the nose tip and the two sides of the face. */
const NOSE = 1
const SIDE_A = 234
const SIDE_B = 454

/** A descriptor as stored: 3 decimals keep it exact enough (≈0.1% of a match distance) at half the size. */
const compact = (embedding: ArrayLike<number>) => Array.from(embedding, (n) => Math.round(n * 1000) / 1000)

async function readFaceNow(
  api: FaceApi,
  video: HTMLVideoElement | HTMLCanvasElement,
  withDescriptor: boolean,
  _detector: DetectorKind,
  options: ReadOptions,
): Promise<ReadResult> {
  if ('videoWidth' in video) await waitForFreshFrame(video)
  const sw = 'videoWidth' in video ? video.videoWidth : video.width
  const sh = 'videoHeight' in video ? video.videoHeight : video.height
  if (!sw || !sh) throw new Error('No se pudo leer la cámara')
  const started = performance.now()
  // Freeze once, straight from the camera: the central 1/zoom of the frame, at no more than
  // MAX_WORK_SIDE. Detector, mesh, descriptor and quality all see this SAME image.
  const zoom = options.zoom && options.zoom > 1 ? options.zoom : 1
  // A sideways picture is turned upright here, so the networks (which only know upright faces) see
  // the same thing the person sees on the screen.
  const rotation = options.rotation ?? 0
  const quarter = rotation === 90 || rotation === 270
  // The central part the screen shows, in the upright picture (then the zoom), converted back to the
  // camera's own axes: the crop is centred, so a quarter turn only swaps its sides.
  const uw = quarter ? sh : sw
  const uh = quarter ? sw : sh
  const fit = options.fitAspect && options.fitAspect > 0 ? options.fitAspect : uw / uh
  let upW = uw
  let upH = uh
  if (uw / uh > fit) upW = uh * fit
  else if (uw / uh < fit) upH = uw / fit
  const cw = Math.max(1, Math.round((quarter ? upH : upW) / zoom))
  const ch = Math.max(1, Math.round((quarter ? upW : upH) / zoom))
  const k = Math.min(1, (readMs > SLOW_READ_MS ? SLOW_WORK_SIDE : MAX_WORK_SIDE) / Math.max(cw, ch))
  const dw = Math.max(1, Math.round(cw * k))
  const dh = Math.max(1, Math.round(ch * k))
  const vw = quarter ? dh : dw
  const vh = quarter ? dw : dh
  workCanvas = sized(workCanvas, vw, vh)
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo leer la cámara')
  const gain = autoGain
  ctx.save()
  if (gain > 1.05) ctx.filter = `brightness(${gain.toFixed(2)})`
  ctx.translate(vw / 2, vh / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(video, (sw - cw) / 2, (sh - ch) / 2, cw, ch, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
  const source = workCanvas

  const minConfidence = Math.max(0.2, Math.min(0.8, options.minConfidence ?? 0.45))
  const result = await api.detect(source, {
    face: {
      detector: { minConfidence },
      description: { enabled: withDescriptor },
    },
  } as unknown as Partial<Config>)
  const faces = result.face.filter((f) => f.boxScore >= minConfidence)
  readMs = ema(readMs, performance.now() - started)

  if (faces.length > 0) emptyFrames = 0

  // The detector cannot find a face that fills (or overflows) the frame: the person is simply too close,
  // and the screen used to say "place your face in the oval" while it was already filling it. Every few
  // empty frames look again on a copy with a wide margin; a face found that way is reported with its real
  // (oversized) measures, so the quality check can say "aléjate" instead. Only the box is needed for that,
  // so it never produces a descriptor (nobody is compared or saved from it).
  if (faces.length === 0) {
    const retryWide = ++emptyFrames % WIDE_RETRY_EVERY === 0 || Date.now() - lastWideAt < WIDE_STICKY_MS
    if (!retryWide) return { kind: 'none' }
    const scale = Math.min(1, WIDE_MAX_SIDE / (vw * 2))
    const ww = Math.max(1, Math.round(vw * 2 * scale))
    const wh = Math.max(1, Math.round(vh * 2 * scale))
    wideCanvas = sized(wideCanvas, ww, wh)
    const g = wideCanvas.getContext('2d')
    if (!g) return { kind: 'none' }
    g.fillStyle = '#808080'
    g.fillRect(0, 0, ww, wh)
    g.drawImage(source, (vw / 2) * scale, (vh / 2) * scale, vw * scale, vh * scale)
    const found = (await api.detect(wideCanvas, BOXES_ONLY)).face.filter((f) => f.boxScore >= Math.min(minConfidence, 0.4))
    if (found.length !== 1) return { kind: 'none' }
    lastWideAt = Date.now()
    const raw = boxOf(found[0].box)
    const box = { x: raw.x / scale - vw / 2, y: raw.y / scale - vh / 2, width: raw.width / scale, height: raw.height / scale }
    return {
      kind: 'face',
      reading: {
        size: box.width / vw,
        pixelWidth: box.width / k,
        brightness: faceBrightness(source, box),
        offset: { x: (box.x + box.width / 2) / vw - 0.5, y: (box.y + box.height / 2) / vh - 0.5 },
        yaw: 1,
        sharpness: MIN_SHARPNESS * 4,
        edgeGap: Math.min(box.x / vw, box.y / vh, 1 - (box.x + box.width) / vw, 1 - (box.y + box.height) / vh),
      },
    }
  }
  if (faces.length > 1) return { kind: 'multiple' }
  const f = faces[0]
  const box = boxOf(f.box)
  const mesh = f.mesh
  const yaw =
    mesh && mesh.length > SIDE_B
      ? dist({ x: mesh[NOSE][0], y: mesh[NOSE][1] }, { x: mesh[SIDE_A][0], y: mesh[SIDE_A][1] }) /
        Math.max(1, dist({ x: mesh[NOSE][0], y: mesh[NOSE][1] }, { x: mesh[SIDE_B][0], y: mesh[SIDE_B][1] }))
      : 1
  const descriptor =
    withDescriptor && f.embedding && f.embedding.length === DESCRIPTOR_LENGTH ? compact(f.embedding) : undefined
  const brightness = faceBrightness(source, box)
  // Follow the light: a face seen darker than ~105 raises the gain for the next frames (smoothly).
  autoGain = autoGain * 0.6 + gainFor(brightness / gain) * 0.4
  return {
    kind: 'face',
    reading: {
      descriptor,
      size: box.width / vw,
      // Real sensor pixels: the working image may have been scaled down, the zoom crop never rescales.
      pixelWidth: box.width / k,
      brightness,
      offset: { x: (box.x + box.width / 2) / vw - 0.5, y: (box.y + box.height / 2) / vh - 0.5 },
      yaw,
      sharpness: options.sharpness === false ? MIN_SHARPNESS * 4 : faceSharpness(source, box),
      edgeGap: Math.min(box.x / vw, box.y / vh, 1 - (box.x + box.width) / vw, 1 - (box.y + box.height) / vh),
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Quality                                                                    */
/* -------------------------------------------------------------------------- */

export type QualityIssue = 'small' | 'low_detail' | 'close' | 'cut_off' | 'off_center' | 'dark' | 'bright' | 'blurry'

export const QUALITY_TEXT: Record<QualityIssue, string> = {
  small: 'Acércate un poco más',
  low_detail: 'Acércate: faltan detalles reales del rostro; el zoom no mejora la nitidez',
  close: 'Aléjate un poco de la cámara',
  cut_off: 'Tu rostro debe verse completo dentro de la imagen',
  blurry: 'La imagen está borrosa: mantente quieto y limpia el lente',
  off_center: 'Centra tu rostro en el óvalo',
  dark: 'Hay poca luz: busca una zona más iluminada o sube el brillo de la pantalla',
  bright: 'Hay demasiada luz detrás de ti: evita ventanas o focos a tu espalda',
}

/** What is wrong with this frame for recognition, most important first. */
export function qualityIssues(
  r: FaceReading,
  opts: { blur?: boolean; minFace?: number; maxFace?: number } = {},
): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (!Number.isFinite(r.pixelWidth) || r.pixelWidth < MIN_FACE_PIXELS) issues.push('low_detail')
  if (r.size < (opts.minFace ?? MIN_FACE_RATIO)) issues.push('small')
  if (r.size > (opts.maxFace ?? MAX_FACE_RATIO)) issues.push('close')
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

/** A sample of THIS engine. Samples saved by the previous one (128 numbers) are not comparable and do not count. */
export function isFaceDescriptor(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === DESCRIPTOR_LENGTH &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** Usable samples an employee has, and whether only samples of the previous engine are stored (re-register). */
export function faceSampleState(employee: Pick<Employee, 'identifications'>): { usable: number; outdated: boolean } {
  const stored = employee.identifications.find((i) => i.method === 'face')?.descriptors ?? []
  const usable = stored.filter(isFaceDescriptor).length
  return { usable, outdated: usable === 0 && stored.length > 0 }
}

/** Euclidean distance ÷ 20 (see Tuning for what the numbers mean). */
export function descriptorDistance(a: number[], b: number[]): number {
  if (!isFaceDescriptor(a) || !isFaceDescriptor(b)) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum) / 20
}

/** Component-wise mean of several descriptors: averages out frame-to-frame noise. */
export function meanDescriptor(list: number[][]): number[] {
  if (!list.length) return []
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
      return { employee, descriptors: id?.enabled ? (id.descriptors ?? []).filter(isFaceDescriptor) : [] }
    })
    .filter((c) => c.descriptors.length > 0)
}

export interface FaceMatch {
  employee: Employee
  distance: number
  /** Distance to the closest *other* employee (Infinity when there is none). */
  runnerUp: number
}

/** Distance from a face to one enrolled employee: mean of the two closest samples (0.7/0.3), robust to one
 *  bad sample and harder to fool than "best of all". Infinity when the employee has no usable sample. */
export function candidateDistance(candidate: FaceCandidate, descriptor: number[]): number {
  const d = candidate.descriptors.filter(isFaceDescriptor).map((s) => descriptorDistance(s, descriptor)).sort((a, b) => a - b)
  if (d.length === 0) return Infinity
  return d.length > 1 ? d[0] * 0.7 + d[1] * 0.3 : d[0]
}

export function nearestFace(candidates: FaceCandidate[], descriptor: number[]): FaceMatch | null {
  if (!isFaceDescriptor(descriptor)) return null
  const scored = candidates
    .map((c) => ({ employee: c.employee, distance: candidateDistance(c, descriptor) }))
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance)
  if (scored.length === 0) return null
  return { ...scored[0], runnerUp: scored[1]?.distance ?? Infinity }
}

export type ClaimVerdict =
  /** Not enrolled (or no usable sample): there is nothing to compare with. */
  | { kind: 'not_enrolled' }
  /** The face is the claimed person's. */
  | { kind: 'match'; distance: number }
  /** Too far from the claimed person's samples. */
  | { kind: 'mismatch'; distance: number }
  /** Looks clearly more like a different employee than like the one who typed the number + PIN. */
  | { kind: 'other'; distance: number; other: Employee }

/**
 * 1:1 check for someone who already said who they are (number + PIN): is this face that employee's?
 * It is the claimed person's face if it is within the limit and no other employee is clearly closer —
 * a look-alike colleague alone does not lock anyone out, but another person's face using a borrowed
 * number + PIN is refused.
 */
export function verifyClaimed(
  candidates: FaceCandidate[],
  employeeId: string,
  descriptor: number[],
  t: Tuning = TUNING.balanced,
): ClaimVerdict {
  const claimed = candidates.find((c) => c.employee.id === employeeId)
  if (!claimed || !isFaceDescriptor(descriptor)) return { kind: 'not_enrolled' }
  const distance = candidateDistance(claimed, descriptor)
  if (!Number.isFinite(distance)) return { kind: 'not_enrolled' }
  let rival: { employee: Employee; distance: number } | null = null
  for (const c of candidates) {
    if (c.employee.id === employeeId) continue
    const d = candidateDistance(c, descriptor)
    if (Number.isFinite(d) && (!rival || d < rival.distance)) rival = { employee: c.employee, distance: d }
  }
  if (rival && distance - rival.distance >= t.margin && rival.distance < t.threshold) {
    return { kind: 'other', distance, other: rival.employee }
  }
  return distance < t.threshold ? { kind: 'match', distance } : { kind: 'mismatch', distance }
}

/** A trustworthy match: close enough AND clearly closer than anyone else. */
export function isConfidentMatch(m: FaceMatch | null, t: Tuning = TUNING.balanced): m is FaceMatch {
  return !!m && Number.isFinite(m.distance) && m.distance >= 0 && m.distance < t.threshold && m.runnerUp - m.distance >= t.margin
}

/** 0–100 for display: Human's own normalised similarity, (0.8 − distance) ÷ 0.6. */
export function matchPercent(distance: number): number {
  return Math.max(0, Math.min(99, Math.round(((0.8 - distance) / 0.6) * 100)))
}
