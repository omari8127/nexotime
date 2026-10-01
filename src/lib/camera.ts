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
