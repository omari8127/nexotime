import { useEffect, useRef, useState } from 'react'

export type CameraState = 'starting' | 'ready' | 'error'

export function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'El navegador no permite usar la cámara en esta conexión. Abre el reloj desde una dirección segura (https).'
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'La cámara está bloqueada. Permite el acceso en el navegador y vuelve a intentarlo.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se encontró una cámara en este equipo.'
  if (name === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación.'
  return 'No se pudo iniciar la cámara.'
}

/**
 * Opens the front camera into a <video> and always releases it on unmount.
 * `hd` asks for 1080p instead of 720p: a simple tablet camera tops out there, and asking for less
 * throws away detail that a small or zoomed-in face needs.
 */
export function useCameraStream(active = true, { hd = false } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let cancelled = false
    setState('starting')

    navigator.mediaDevices
      ?.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: hd ? 1920 : 1280 },
          height: { ideal: hd ? 1080 : 720 },
        },
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (!video) return
        video.srcObject = s
        await video.play().catch(() => undefined)
        if (!cancelled) setState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setMessage(describeCameraError(err))
        setState('error')
      })
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(describeCameraError(null))
      setState('error')
    }

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [active, hd])

  return { videoRef, state, message }
}
