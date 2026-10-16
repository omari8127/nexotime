import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LEGAL_PATHS } from '@/data/legal'

const KEY = 'nexotime.cookies'
/** Public pages only: never over the reloj checador or the panel. */
const PUBLIC_PATHS = ['/bienvenida', '/login', '/signup', '/recuperar', '/nueva-contrasena',...Object.values(LEGAL_PATHS)]

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Information notice (not a consent wall): the app only uses strictly necessary browser storage
 * and no tracking, so there is nothing to accept or reject — the visitor just acknowledges it.
 * If analytics is added later this must become an accept / reject choice before anything loads.
 */
export function CookieNotice() {
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(seen)
  if (dismissed || !PUBLIC_PATHS.includes(pathname)) return null

  const accept = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode: it will simply show again next visit */
    }
    setDismissed(true)
  }

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-200 sm:flex-row sm:items-center"
    >
      <Cookie className="hidden h-5 w-5 shrink-0 text-slate-400 sm:block" aria-hidden />
      <p className="flex-1 text-sm leading-relaxed text-slate-600">
        Usamos solo almacenamiento técnico del navegador (sesión, tema y funcionamiento sin conexión). No usamos cookies
        de publicidad ni de seguimiento.{' '}
        <Link to={LEGAL_PATHS.cookies} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900">
          Más información
        </Link>
      </p>
      <Button
        size="sm"
        onClick={accept}
        className="shrink-0 rounded-xl bg-slate-900 font-semibold text-white hover:bg-slate-800"
      >
        Entendido
      </Button>
    </div>
  )
}
