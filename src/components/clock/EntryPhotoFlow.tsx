import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FaceViewport } from '@/components/clock/FaceViewport'
import { useCameraStream } from '@/hooks/useCameraStream'
import { loadFaceApi, readFace, qualityIssues, QUALITY_TEXT } from '@/lib/face'
import { waitForFreshFrame } from '@/lib/camera'
import { encodePhotoCapture, type PhotoCapture } from '@/lib/photoEvidence'

/** Evidence only: verifies a usable, single face, not who that face belongs to. */
export function EntryPhotoFlow({ name, onCaptured, onCancel }: {
  name: string; onCaptured: (photo: PhotoCapture) => Promise<void>; onCancel: () => void
}) {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const { videoRef, state, message, restart } = useCameraStream(true, { hd: true, facingMode })
  const [hint, setHint] = useState('Mira de frente a la cámara')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const submit = useRef(onCaptured)
  useEffect(() => { submit.current = onCaptured })
  useEffect(() => {
    if (state !== 'ready') return
    const video = videoRef.current
    if (!video) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let goodSince = 0
    let errors = 0
    const run = async () => {
      setLoading(true)
      setFailed(false)
      try {
        const api = await loadFaceApi()
        if (!alive) return
        setLoading(false)
        const loop = async () => {
          if (!alive) return
          try {
            await waitForFreshFrame(video)
            if (!alive) return
            const frame = document.createElement('canvas')
            frame.width = video.videoWidth
            frame.height = video.videoHeight
            const ctx = frame.getContext('2d')
            if (!ctx) throw new Error('No se pudo capturar la imagen.')
            ctx.drawImage(video, 0, 0)
            const result = await readFace(api, frame, false, 'fast')
            if (!alive) return
            errors = 0
            const issues = result.kind === 'face' ? qualityIssues(result.reading, { blur: true }) : []
            if (result.kind !== 'face' || issues.length) {
              goodSince = 0
              setHint(result.kind === 'multiple' ? 'Debe aparecer una sola persona' :
                result.kind === 'none' ? 'Coloca tu rostro frente a la cámara' : QUALITY_TEXT[issues[0]])
            } else {
              goodSince ||= Date.now()
              const seconds = Math.max(0, Math.ceil((3000 - (Date.now() - goodSince)) / 1000))
              setHint(seconds ? `Mantente quieto · foto en ${seconds}` : 'Guardando entrada y foto…')
              if (!seconds) {
                const capture = encodePhotoCapture(frame)
                setSaving(true)
                try { await submit.current(capture) }
                catch (error) {
                  if (alive) { setHint(error instanceof Error ? error.message : 'No se pudo guardar la entrada.'); setFailed(true) }
                } finally { if (alive) setSaving(false) }
                return
              }
            }
          } catch (error) {
            if (!alive) return
            goodSince = 0
            if (++errors >= 3) {
              setHint(error instanceof Error ? error.message : 'No se pudo leer la cámara.')
              setFailed(true)
              return
            }
            setHint('No se pudo leer la imagen. Mantente frente a la cámara.')
          }
          if (alive) timer = setTimeout(loop, 100)
        }
        void loop()
      } catch {
        if (alive) { setLoading(false); setHint('No se pudo preparar la captura. Revisa la conexión y reintenta.'); setFailed(true) }
      }
    }
    void run()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [state, attempt, videoRef])
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-xl font-semibold">Foto de entrada · {name}</h2>
      <p className="max-w-md text-sm text-slate-600">Se guardará esta foto junto con tu entrada para revisar quién registró la asistencia.</p>
      <FaceViewport videoRef={videoRef} cameraState={state} cameraMessage={message} loadingModels={loading && state === 'ready'} />
      <p role="status" className="text-base font-medium">{state === 'error' ? message : loading ? 'Preparando cámara…' : hint}</p>
      {state === 'error' || failed ? <Button disabled={saving} onClick={() => { restart(); setAttempt((n) => n + 1) }}>Reintentar foto</Button> : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="secondary" disabled={saving} onClick={() => setFacingMode((v) => v === 'user' ? 'environment' : 'user')}>Cambiar cámara</Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancelar entrada</Button>
      </div>
      <p className="text-xs text-slate-500">La foto es evidencia para revisión; no confirma automáticamente tu identidad.</p>
    </div>
  )
}
