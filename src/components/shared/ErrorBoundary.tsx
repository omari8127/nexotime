import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { NexotimeLogo } from '@/components/shared/Logo'
import { flushErrorReports, reportError } from '@/lib/errorReport'

interface State {
  failed: boolean
}

const KEY = 'nexotime.lastError'

/**
 * Last line of defence: a bug in one screen must never leave a kiosk on a blank page.
 * Shows a plain message with a way back; the technical detail stays in the console and
 * in localStorage (`nexotime.lastError`) so support can ask for it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[NEXOTIME]', error, info.componentStack)
    reportError(error)
    void flushErrorReports()
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ at: new Date().toISOString(), message: error.message, stack: error.stack?.slice(0, 1500), path: location.pathname }),
      )
    } catch {
      /* storage unavailable */
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          <NexotimeLogo tone="dark" />
          <div className="mt-5 rounded-xl border border-border bg-card p-8 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo salió mal</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Ocurrió un problema inesperado. Tus datos no se perdieron; las checadas guardadas en este equipo se
              enviarán solas. Vuelve a cargar la pantalla; si sigue pasando, avisa a tu proveedor.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => location.reload()}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" />
                Volver a cargar
              </button>
              <button
                type="button"
                onClick={() => location.assign('/')}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
