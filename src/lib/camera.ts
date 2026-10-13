/** Longest side of the verification photo. It is shown in a ~160 px box and never stored, so
 *  encoding the camera's full 1080p frame only froze weak tablets for a few hundred ms at the exact
 *  moment someone clocks in (and kept a ~0.5 MB base64 string in memory). */
const PHOTO_MAX_SIDE = 480

/** A still frame of a live <video>, as a small JPEG data URL — used as a fleeting
 *  verification photo (see ClockPage) that is shown once on screen and never
 *  stored or sent anywhere. */
export function captureVideoFrame(video: HTMLVideoElement): string | undefined {
  try {
    const sw = video.videoWidth
    const sh = video.videoHeight
    if (!sw || !sh) return undefined
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(sw, sh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.78)
  } catch {
    return undefined
  }
}

/** Request a useful native resolution; retry only unsupported constraints, never denied permission. */
export async function openCamera(
  media: Pick<MediaDevices, 'getUserMedia'>,
  hd = true,
  facingMode: 'user' | 'environment' = 'user',
): Promise<MediaStream> {
  // 1280×720 is all the face networks use (they work on at most that), and decoding/compositing 1080p
  // video is what makes a basic tablet stutter. A camera that cannot do it falls back on its own.
  const resolutions = hd ? [[1280, 720], [640, 480]] : [[640, 480]]
  const profiles: MediaTrackConstraints[] = resolutions.map(([width, height]) => ({
    facingMode: { ideal: facingMode }, width: { ideal: width }, height: { ideal: height },
  }))
  profiles.push({ facingMode: { ideal: facingMode } })
  for (let i = 0; i < profiles.length; i++) {
    try {
      return await media.getUserMedia({ audio: false, video: profiles[i] })
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
      if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(String(name)) || i === profiles.length - 1) throw error
    }
  }
  throw new Error('No se pudo abrir la cámara')
}

/** Enhancement is optional: unsupported autofocus/exposure must never prevent camera use. */
export async function tuneCamera(track: MediaStreamTrack, { torch = false }: { torch?: boolean } = {}) {
  try {
    const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
      focusMode?: string[]; exposureMode?: string[]; whiteBalanceMode?: string[]; torch?: boolean
    }
    const advanced: Record<string, string | boolean> = {}
    for (const key of ['focusMode', 'exposureMode', 'whiteBalanceMode'] as const) {
      if (capabilities?.[key]?.includes('continuous')) advanced[key] = 'continuous'
    }
    // A rear camera that has a flash lights the face with it; a selfie camera has none (the screen is
    // the light there, see LightStage).
    if (torch && capabilities?.torch) advanced.torch = true
    if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced as MediaTrackConstraintSet] })
  } catch { /* optional device capabilities */ }
}

/** The current camera frame as a canvas (at most `maxSide` px on its long side), for encoding a photo. */
export function videoFrameCanvas(video: HTMLVideoElement, maxSide = 640): HTMLCanvasElement {
  const sw = video.videoWidth
  const sh = video.videoHeight
  if (!sw || !sh) throw new Error('La cámara no está entregando imágenes.')
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo capturar la imagen.')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

const lastFrames = new WeakMap<HTMLVideoElement, number>()
/** Never count a frozen/repeated camera frame as a new identity confirmation. */
export async function waitForFreshFrame(video: HTMLVideoElement): Promise<void> {
  const started = Date.now()
  while (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 ||
    video.paused || video.ended || lastFrames.get(video) === video.currentTime) {
    if (Date.now() - started > 3000) throw new Error('La cámara no está entregando imágenes nuevas')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  lastFrames.set(video, video.currentTime)
}
