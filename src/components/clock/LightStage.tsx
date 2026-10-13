import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Sun, SunDim } from 'lucide-react'

const KEY = 'nexotime.kiosk.light'

function readLight(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Full-screen stage for every step that looks at a face. A tablet has no flash: the only light it can
 * put on someone's face is its own screen, so while the camera is on the whole screen turns white
 * ("luz de apoyo"). That alone is the difference between reading a face in a dim shop and not.
 * It can be switched off at this device (a very bright room, a very sensitive person).
 *
 * It is a portal on top of the kiosk, so the camera view is as large as the screen allows and nothing
 * else on the page competes for attention while the person is trying to hold still.
 */
export function LightStage({
  title,
  onBack,
  backLabel = 'Volver',
  children,
}: {
  title: string
  onBack: () => void
  backLabel?: string
  children: ReactNode
}) {
  const [light, setLight] = useState(readLight)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, light ? 'on' : 'off')
    } catch {
      /* private mode: the choice just won't be remembered */
    }
  }, [light])

  // The page behind must not scroll or be tapped while the stage is up.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex flex-col text-slate-900 transition-colors ${light ? 'bg-white' : 'bg-slate-100'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <span className="truncate text-sm font-medium text-slate-500">{title}</span>
        <button
          type="button"
          onClick={() => setLight((v) => !v)}
          aria-pressed={light}
          title={light ? 'Apagar la luz de apoyo' : 'Encender la luz de apoyo'}
          className={`inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${
            light ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          {light ? <Sun className="h-4 w-4" /> : <SunDim className="h-4 w-4" />}
          Luz {light ? 'encendida' : 'apagada'}
        </button>
      </header>
      <p className="px-6 pb-1 text-center text-xs text-slate-500 landscape:hidden">
        Para que te reconozca mejor: brillo de la pantalla al máximo y la luz de frente, no a tu espalda.
      </p>
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 pb-6">
        <div className="w-full max-w-2xl landscape:max-w-5xl">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
