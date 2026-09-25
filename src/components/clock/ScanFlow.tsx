import { useEffect, useRef, useState } from 'react'
import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CameraScanner } from '@/components/clock/CameraScanner'

/**
 * Reads a QR or barcode credential from the camera, a USB scanner
 * (they behave like a keyboard and end with Enter) or manual typing. The parent
 * resolves the code to an employee and returns an error message when it can't.
 */
export function ScanFlow({
  mode,
  onCode,
  onCancel,
  demoCode,
}: {
  mode: 'qr' | 'barcode'
  /** Returns an error message to show, or null when the code was accepted. */
  onCode: (code: string) => string | null
  onCancel: () => void
  /** Demo mode only: a valid code to use when there is no badge at hand. */
  demoCode?: string
}) {
  const [manual, setManual] = useState('')
  const isQr = mode === 'qr'
  const [error, setError] = useState<string | null>(null)
  const lastRead = useRef<{ code: string; at: number }>({ code: '', at: 0 })

  const submit = (raw: string) => {
    const code = raw.trim()
    if (!code) return
    // A badge held in front of the camera is decoded many times per second.
    const now = Date.now()
    if (lastRead.current.code === code && now - lastRead.current.at < 3000) return
    lastRead.current = { code, at: now }
    setError(onCode(code))
  }

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(id)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <CameraScanner kind={mode} onDecode={submit} />

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isQr ? 'Lector de código QR' : 'Lector de código de barras'}
        </p>
        <p className="text-lg font-semibold text-slate-900">
          {isQr ? 'Coloca tu código frente a la cámara' : 'Acerca tu credencial a la cámara o al lector'}
        </p>
        <p className="text-sm text-slate-500">
          {isQr
            ? 'Se registra automáticamente al leerlo.'
            : 'También funciona con un lector USB: escanea con este campo activo.'}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="w-full rounded-lg border border-red-200 border-l-4 border-l-red-500 bg-red-50/70 px-3.5 py-2.5 text-left text-[13px] text-red-800"
        >
          {error}
        </p>
      ) : null}

      <form
        className="flex w-full items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit(manual)
          setManual('')
        }}
      >
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus={!isQr}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Lector USB o escribe el código"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!manual.trim()}>
          Validar
        </Button>
      </form>

      <div className="flex w-full items-center justify-between">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        {demoCode ? (
          <button
            type="button"
            onClick={() => submit(demoCode)}
            className="text-[13px] text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
          >
            Usar credencial de ejemplo
          </button>
        ) : null}
      </div>
    </div>
  )
}
