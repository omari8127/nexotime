/**
 * Face recognition, fully in the browser (face-api / TensorFlow.js).
 *
 * Nothing leaves the device: the camera frames are processed locally and only a
 * 128-number descriptor per sample is stored for each enrolled employee — never
 * a photo. The models are served from /models and cached by the browser.
 */
import type { Employee, FaceDistance, FaceStrictness } from '@/types'
import { waitForFreshFrame } from './camera'
import {
  gainFor,
  rotationCandidates,
  screenOrientation,
  streamOrientation,
  type Rotation,
} from './cameraView'

export type FaceApi = typeof import('@vladmandic/face-api')

let apiPromise: Promise<FaceApi> | null = null

/** Lazy-loads the library (≈1.3 MB) and the four models (≈12 MB) once. */
export function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = await import('@vladmandic/face-api')
      const tf = api.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> }
      try {
        if (!(await tf.setBackend('webgl'))) throw new Error('WebGL no disponible')
        await tf.ready()
      } catch {
        if (!(await tf.setBackend('cpu'))) throw new Error('No hay un motor facial compatible')
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
      // The first inference of each network compiles its GPU shaders (seconds on a tablet), and the
      // resize step compiles one per input size. Pay all of that here, on the "Preparando…" screen,
      // instead of on the first real camera frames: run every network once on blank input, at the sizes
      // the reloj actually feeds them (a 16:9 camera is always 1280×720 once scaled, and 4:3 is 640×480).
      const warmup = async () => {
        const canvas = (w: number, h = w) => Object.assign(document.createElement('canvas'), { width: w, height: h })
        for (const [w, h] of [[160, 160], [1280, 720], [640, 480]]) {
          const c = canvas(w, h)
          await api.detectAllFaces(c, new api.TinyFaceDetectorOptions({ inputSize: 224 })) // "is anyone there?"
          await api.detectAllFaces(c, new api.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        }
        for (const [w, h] of [[160, 160], [640, 360], [1280, 720]]) {
          await api.detectAllFaces(canvas(w, h), new api.TinyFaceDetectorOptions({ inputSize: 320 })) // guidance + enrollment
        }
        await api.nets.faceLandmark68Net.detectLandmarks(canvas(112))
        await api.nets.faceRecognitionNet.computeFaceDescriptor(canvas(150))
      }
      try {
        await warmup()
      } catch {
        // Some mobile GPUs initialize but fail while compiling/running the networks.
        if (!(await tf.setBackend('cpu'))) throw new Error('No se pudo iniciar el motor facial')
        await tf.ready()
        await warmup()
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

/** Existing distance limits are preserved; basic cameras get more independent confirmations.
 * Profiles are operating policies, not a guarantee tied to megapixels. */
export const TUNING: Record<FaceStrictness, Tuning> = {
  strict: { threshold: 0.5, margin: 0.07, streak: 3, minFace: 0.15, minConfidence: 0.5 },
  balanced: { threshold: 0.675, margin: 0.04, streak: 3, minFace: 0.15, minConfidence: 0.5 },
  relaxed: { threshold: 0.72, margin: 0.03, streak: 4, minFace: 0.1, minConfidence: 0.4 },
}

/** Strictness level, optionally with an explicit distance limit set by the administrator. */
export function tuningFor(strictness: FaceStrictness, threshold: number | null = null): Tuning {
  const base = TUNING[strictness]
  return threshold == null || !Number.isFinite(threshold) ? base : { ...base, threshold: Math.max(0.35, Math.min(0.75, threshold)) }
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
 * can shift alignment and descriptors, so enrollment and matching use the same detector.
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
/** Longest side of the image the networks work on. SSD resizes to 512 px internally, so a 1080p frame only
 *  cost memory, upload time and garbage collection (the "stutter every second" on weak tablets). */
const MAX_WORK_SIDE = 1280
/** A device whose full detector takes longer than this works on a smaller image (less to copy and upload). */
const SLOW_SSD_MS = 140
const SLOW_WORK_SIDE = 800
/** After a face was seen this recently the cheap "is anyone there?" probe is skipped. */
const WARM_MS = 1500
/** With nobody in view, the full detector still runs on every Nth frame (faces the probe misses in dim light). */
const COLD_FULL_EVERY = 3

let lastFaceAt = 0
let coldFrames = 0
/** How long the "is anyone there?" probe and the full detector take on THIS device (moving averages). The probe
 *  is only used where it is clearly cheaper than the detector it saves; on a device where it is not, the
 *  full detector simply runs every time, as it always did. */
let probeMs = 0
let ssdMs = 0
/** Brightening applied to what the networks see (1 = none): follows how dark the faces seen lately were. */
let autoGain = 1
const ema = (previous: number, sample: number) => (previous === 0 ? sample : previous * 0.7 + sample * 0.3)
const probeIsCheap = () => probeMs > 0 && ssdMs > 0 && probeMs < ssdMs * 0.6
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

/**
 * Which quarter turn, other than the current one, makes a face visible? Cheap (the light detector on a
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
      const found = await api.detectAllFaces(canvas, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
      return found.length === 1 ? found[0].score : 0
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

async function readFaceNow(
  api: FaceApi,
  video: HTMLVideoElement | HTMLCanvasElement,
  withDescriptor: boolean,
  detector: DetectorKind,
  options: ReadOptions,
): Promise<ReadResult> {
  if ('videoWidth' in video) await waitForFreshFrame(video)
  const sw = 'videoWidth' in video ? video.videoWidth : video.width
  const sh = 'videoHeight' in video ? video.videoHeight : video.height
  if (!sw || !sh) throw new Error('No se pudo leer la cámara')
  // Freeze once, straight from the camera: the central 1/zoom of the frame, at no more than
  // MAX_WORK_SIDE. Detector, landmarks, descriptor and quality all see this SAME image.
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
  const k = Math.min(1, (ssdMs > SLOW_SSD_MS ? SLOW_WORK_SIDE : MAX_WORK_SIDE) / Math.max(cw, ch))
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

  const detectOn = (input: HTMLCanvasElement, detection: Parameters<FaceApi['detectAllFaces']>[1]) => {
    const task = api.detectAllFaces(input, detection).withFaceLandmarks()
    return withDescriptor ? task.withFaceDescriptors() : task
  }
  const ssdOptions = () =>
    new api.SsdMobilenetv1Options({ minConfidence: options.minConfidence ?? 0.5, maxResults: 3 })
  const tinyOptions = (inputSize: number, scoreThreshold: number) =>
    new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold })

  let faces: Awaited<ReturnType<typeof detectOn>> = []
  if (detector === 'accurate') {
    // The camera is on all day with usually nobody in front of it, and SSD is the expensive network.
    // A cheap probe says whether anyone is there; SSD still runs on every Nth empty frame so a face the
    // probe misses (poor light, an angle) is found a moment later instead of never.
    let run = Date.now() - lastFaceAt < WARM_MS
    if (!run) {
      if (ssdMs === 0) {
        run = true // measure the full detector first
      } else if (probeMs === 0 || probeIsCheap()) {
        const started = performance.now()
        const probe = await api.detectAllFaces(source, tinyOptions(224, 0.3))
        probeMs = ema(probeMs, performance.now() - started)
        run = probe.length > 0 || ++coldFrames % COLD_FULL_EVERY === 0
      } else {
        run = true
      }
    }
    if (run) {
      const started = performance.now()
      faces = await detectOn(source, ssdOptions())
      if (faces.length === 0) ssdMs = ema(ssdMs, performance.now() - started)
    }
  } else {
    faces = await detectOn(source, tinyOptions(320, 0.45))
    if (faces.length === 0) faces = await detectOn(source, ssdOptions())
  }

  if (faces.length > 0) {
    emptyFrames = 0
    coldFrames = 0
    lastFaceAt = Date.now()
  }

  // The detectors cannot find a face that fills (or overflows) the frame: the person is simply too close,
  // and the screen used to say "place your face in the oval" while it was already filling it. Every few
  // empty frames look again on a copy with a wide margin; a face found that way is reported with its real
  // (oversized) measures, so the quality check can say "aléjate" instead. Only the box is needed for that,
  // so it uses the cheap detector and never produces a descriptor (nobody is compared or saved from it).
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
    const found = probeIsCheap()
      ? await api.detectAllFaces(wideCanvas, tinyOptions(320, 0.4))
      : await api.detectAllFaces(wideCanvas, ssdOptions())
    if (found.length !== 1) return { kind: 'none' }
    lastWideAt = Date.now()
    const raw = found[0].box
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
  const box = f.detection.box
  const pts = f.landmarks.positions
  const yaw = dist(pts[30], pts[0]) / Math.max(1, dist(pts[30], pts[16]))
  const descriptor =
    withDescriptor && 'descriptor' in f ? Array.from((f as { descriptor: Float32Array }).descriptor) : undefined
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

export function isFaceDescriptor(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 128 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}

export function descriptorDistance(a: number[], b: number[]): number {
  if (!isFaceDescriptor(a) || !isFaceDescriptor(b)) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
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

/** 0–100 for display; only a friendly reading of the distance. */
export function matchPercent(distance: number): number {
  return Math.max(0, Math.min(99, Math.round((1 - distance / 0.9) * 100)))
}
