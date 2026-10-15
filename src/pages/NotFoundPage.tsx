import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PUBLIC_BACKDROP, PublicPage } from '@/components/shared/PublicChrome'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

export function NotFoundPage() {
  const signedIn = useAuthStore((s) => s.status === 'authenticated')
  const home = signedIn ? '/' : '/bienvenida'

  return (
    <PublicPage back={home} backLabel={signedIn ? 'Al panel' : 'Al inicio'} mainClassName={cn('flex items-center justify-center px-5 py-20', PUBLIC_BACKDROP)}>
      <div className="max-w-md text-center">
        <p className="font-display text-7xl font-semibold tracking-[-0.04em] text-slate-900">404</p>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">La página que buscas no existe o fue movida.</p>
        <Link
          to={home}
          className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300"
        >
          {signedIn ? 'Volver al panel' : 'Ir al inicio'}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </PublicPage>
  )
}
