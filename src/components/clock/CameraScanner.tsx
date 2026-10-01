import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { CameraOff, LoaderCircle } from 'lucide-react'
import { captureVideoFrame } from '@/lib/camera'

type ScanKind = 'qr' | 'barcode'

const FORMATS: Record<ScanKind, BarcodeFormat[]> = {
  qr: [BarcodeFormat.QR_CODE],
  barcode: [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.ITF,
  ],
}

interface NativeDetectorCtor {
  new (opts: { formats: string[] }): { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> }
}

const NATIVE_FORMATS: Record<ScanKind, string[]> = {
  qr: ['qr_code'],
  barcode: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'itf'],
}

function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'El navegador no permite usar la cámara en esta conexión. Abre el reloj desde una dirección segura (https).'
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'La cámara está bloqueada. Permite el acceso en el navegador y vuelve a intentarlo.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No se encontró una cámara en este equipo. Usa un lector USB o escribe el código.'
  }
  if (name === 'NotReadableError') {
    return 'La cámara está siendo usada por otra aplicación.'
  }
  return 'No se pudo iniciar la cámara.'
}

export interface CameraScannerHandle {
  /** A still frame of the live feed, for the fleeting verification photo (see ClockPage). */
  capture: () => string | undefined
}

/**
 * Live camera decoding (ZXing). Calls `onDecode` for every frame that contains
 * a code — the parent debounces. The camera is always released on unmount.
 */
export const CameraScanner = forwardRef<CameraScannerHandle, { kind: ScanKind; onDecode: (text: string) => void }>(
  function CameraScanner({ kind, onDecode }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'ready' | 'error'>('starting')
  const [message, setMessage] = useState('')
  const decodeRef = useRef(onDecode)
  useEffect(() => {
    decodeRef.current = onDecode
  })
  useImperativeHandle(ref, () => ({
    capture: () => (videoRef.current ? captureVideoFrame(videoRef.current) : undefined),
  }))

  useEffect(() => {
    let stopped = false
    let stop: (() => void) | undefined

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS[kind])
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })

    if (!videoRef.current) return
    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (result) => {
          if (result && !stopped) decodeRef.current(result.getText())
        },
      )
      .then((controls) => {
        if (stopped) {
          controls.stop()
          return
        }
        stop = () => controls.stop()
        setState('ready')
      })
      .catch((err: unknown) => {
        if (stopped) return
        setMessage(describeCameraError(err))
        setState('error')
      })

    return () => {
      stopped = true
      stop?.()
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [kind])

  // Chrome on Android / ChromeOS ships a hardware-accelerated detector that is far
  // better than software decoding on small or low-contrast barcodes. When it is
  // there, run it on the same video feed as a second reader.
  useEffect(() => {
    if (state !== 'ready') return
    const Detector = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
    const video = videoRef.current
    if (!Detector || !video) return
    let cancelled = false
    const detector = new Detector({ formats: NATIVE_FORMATS[kind] })
    let timer: number | undefined
    const tick = async () => {
      if (cancelled) return
      try {
        if (video.readyState >= 2) {
          const found = await detector.detect(video)
          if (found[0]?.rawValue && !cancelled) decodeRef.current(found[0].rawValue)
        }
      } catch {
        /* unsupported format / frame not ready: keep trying */
      }
      timer = window.setTimeout(tick, 120)
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [state, kind])

  return (
    <div className="relative h-64 w-64 overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
      <video
        ref={videoRef}
        muted
        playsInline
        className={`h-full w-full object-cover ${state === 'ready' ? '' : 'invisible'}`}
      />
      {/* viewfinder corners */}
      {state === 'ready'
        ? ['left-3 top-3 border-l-[3px] border-t-[3px]', 'right-3 top-3 border-r-[3px] border-t-[3px]', 'left-3 bottom-3 border-b-[3px] border-l-[3px]', 'right-3 bottom-3 border-b-[3px] border-r-[3px]'].map(
            (c) => <span key={c} className={`absolute h-7 w-7 rounded-sm border-white/70 ${c}`} />,
          )
        : null}
      {state !== 'ready' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
          {state === 'starting' ? (
            <>
              <LoaderCircle className="h-6 w-6 animate-spin" />
              <p className="text-sm">Iniciando cámara…</p>
            </>
          ) : (
            <>
              <CameraOff className="h-6 w-6" />
              <p className="text-[13px] leading-5">{message}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
  },
)
