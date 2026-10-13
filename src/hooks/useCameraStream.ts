import { useCallback, useEffect, useRef, useState } from 'react'
import { openCamera, tuneCamera, waitForFreshFrame } from '@/lib/camera'

export type CameraState = 'starting' | 'ready' | 'error'

export function describeCameraError(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? err.name : ''
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'El navegador no permite usar la cámara en esta conexión. Abre el reloj desde una dirección segura (https).'
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'La cámara está bloqueada. Permite el acceso en el navegador y vuelve a intentarlo.'
  }
  if (name === 'NotFoundError') return 'No se encontró una cámara en este equipo.'
  if (name === 'OverconstrainedError') return 'La cámara no admite esta configuración. Prueba otra cámara.'
  if (name === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación.'
  return 'No se pudo recibir video de la cámara. Cierra otras aplicaciones y pulsa Reintentar cámara.'
}

export function useCameraStream(active = true, { hd = false, facingMode = 'user' }: {
  hd?: boolean; facingMode?: 'user' | 'environment'
} = {}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  const [message, setMessage] = useState('')
  const [resolution, setResolution] = useState('')
  // The picture's real size, kept current: a tablet that is turned changes it, and the view must follow.
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [attempt, setAttempt] = useState(0)
  const restart = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let cancelled = false
    let playTimer: ReturnType<typeof setTimeout> | undefined
    let attached: HTMLVideoElement | null = null
    let stopMeasuring = () => {}
    setState('starting')
    setMessage('')
    setResolution('')
    setSize({ width: 0, height: 0 })
    const fail = (error: unknown) => {
      if (cancelled) return
      stream?.getTracks().forEach((track) => track.stop())
      setMessage(describeCameraError(error))
      setState('error')
    }
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Cámara no disponible')
      const s = await openCamera(navigator.mediaDevices, hd, facingMode)
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
      stream = s
      const video = videoRef.current
      if (!video) throw new Error('Vista de cámara no disponible')
      attached = video
      video.muted = true
      video.playsInline = true
      video.srcObject = s
      const track = s.getVideoTracks()[0]
      if (!track) throw new Error('No hay video')
      track.onended = () => fail(new Error('Cámara desconectada'))
      // Do not let optional camera controls delay video start.
      void tuneCamera(track, { torch: facingMode === 'environment' })
      await Promise.race([
        video.play(),
        new Promise<never>((_, reject) => {
          playTimer = setTimeout(() => reject(new Error('Video no disponible')), 10000)
        }),
      ])
      clearTimeout(playTimer)
      if (cancelled) return
      await waitForFreshFrame(video)
      if (cancelled) return
      const measure = () => {
        setResolution(`${video.videoWidth} × ${video.videoHeight}`)
        setSize({ width: video.videoWidth, height: video.videoHeight })
      }
      measure()
      video.addEventListener('resize', measure)
      video.addEventListener('loadedmetadata', measure)
      stopMeasuring = () => {
        video.removeEventListener('resize', measure)
        video.removeEventListener('loadedmetadata', measure)
      }
      setState('ready')
    }
    void start().catch(fail)
    return () => {
      cancelled = true
      stopMeasuring()
      clearTimeout(playTimer)
      stream?.getTracks().forEach((t) => { t.onended = null; t.stop() })
      if (attached?.srcObject === stream) attached.srcObject = null
    }
  }, [active, hd, facingMode, attempt])

  return { videoRef, state, message, resolution, size, restart }
}
