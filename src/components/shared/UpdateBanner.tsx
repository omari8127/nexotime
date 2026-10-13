import { RefreshCw } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useUpdateStore } from '@/lib/appUpdate'

/**
 * "Hay una versión nueva". In the panel it asks for one tap (a reload would lose what is being typed);
 * the reloj checador takes the update by itself when it is idle, so it shows nothing there.
 */
export function UpdateBanner() {
  const ready = useUpdateStore((s) => s.ready)
  const { pathname } = useLocation()
  if (!ready || pathname.startsWith('/clock')) return null
  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-white px-4 py-3 text-sm shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-slate-800">Hay una versión nueva de Nexotime.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Actualizar
        </button>
      </div>
    </div>
  )
}
