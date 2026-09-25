import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { NexotimeLogo } from '@/components/shared/Logo'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <NexotimeLogo tone="dark" />
      <div className="space-y-2">
        <p className="text-5xl font-semibold tracking-tight">404</p>
        <p className="text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
      </div>
      <Link to="/">
        <Button>Volver al dashboard</Button>
      </Link>
    </div>
  )
}
