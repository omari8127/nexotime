/** A still frame of a live <video>, as a JPEG data URL — used as a fleeting
 *  verification photo (see ClockPage) that is shown once on screen and never
 *  stored or sent anywhere. */
export function captureVideoFrame(video: HTMLVideoElement): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width === 0 || canvas.height === 0) return undefined
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
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
  const resolutions = hd ? [[1920, 1080], [1280, 720], [640, 480]] : [[1280, 720], [640, 480]]
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
export async function tuneCamera(track: MediaStreamTrack) {
  try {
    const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
      focusMode?: string[]; exposureMode?: string[]; whiteBalanceMode?: string[]
    }
    const advanced: Record<string, string> = {}
    for (const key of ['focusMode', 'exposureMode', 'whiteBalanceMode'] as const) {
      if (capabilities?.[key]?.includes('continuous')) advanced[key] = 'continuous'
    }
    if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced as MediaTrackConstraintSet] })
  } catch { /* optional device capabilities */ }
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
