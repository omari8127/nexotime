import { Link } from 'react-router-dom'
import { LEGAL_LINKS } from '@/data/legal'
import { cn } from '@/lib/utils'

/** Aviso legal · Privacidad · Términos · Cookies — the footer links every public page carries. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Información legal" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {LEGAL_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={cn('transition-colors hover:underline', className)}>
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
