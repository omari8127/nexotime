import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LEGAL_PATHS } from '@/data/legal'

const KEY = 'nexotime.cookies'
/** Public pages only: never over the reloj checador or the panel. */
const PUBLIC_PATHS = ['/bienvenida', '/login', '/signup', ...Object.values(LEGAL_PATHS)]

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
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:flex-row sm:items-center"
    >
      <Cookie className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" aria-hidden />
      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
        Usamos solo almacenamiento técnico del navegador (sesión, tema y funcionamiento sin conexión). No usamos cookies
        de publicidad ni de seguimiento.{' '}
        <Link to={LEGAL_PATHS.cookies} className="font-medium text-primary hover:underline">
          Más información
        </Link>
      </p>
      <Button size="sm" onClick={accept} className="shrink-0">
        Entendido
      </Button>
    </div>
  )
}
