import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import { restoreSession } from '@/services/live/liveApi'
import {
  flushQueue,
  isNetworkError,
  loadOfflineBundle,
  refreshPendingCount,
} from '@/services/live/syncQueue'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/toast'

/**
 * Mounted once at the app root. Restores a real Supabase session on page
 * load (so refreshing the connected app doesn't bounce you to /login), keeps
 * working when the tablet boots without internet (last synced data + any
 * punches still waiting to upload), replays parked writes when the connection
 * returns, and reacts to being signed out elsewhere. Renders nothing.
 */
export function AuthBoot() {
  const navigate = useNavigate()
  const hydrateLive = useDataStore((s) => s.hydrateLive)
  const switchToDemo = useDataStore((s) => s.switchToDemo)
  const setStatus = useAuthStore((s) => s.setStatus)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus('anonymous')
      return
    }
    const client = supabase
    refreshPendingCount()

    const sync = async () => {
      if (useDataStore.getState().mode !== 'live') return
      const { sent, remaining } = await flushQueue()
      if (sent > 0 && remaining === 0) {
        toast.success('Sincronizado', `${sent} ${sent === 1 ? 'cambio enviado' : 'cambios enviados'} al servidor.`)
      }
    }

    restoreSession()
      .then((bundle) => {
        if (bundle) {
          hydrateLive(bundle)
          setStatus('authenticated')
          void sync()
        } else {
          setStatus('anonymous')
        }
      })
      .catch(async (err: unknown) => {
        if (isNetworkError(err)) {
          const { data } = await client.auth.getSession()
          const offline = loadOfflineBundle(data.session?.user.id)
          if (offline) {
            hydrateLive(offline)
            setStatus('authenticated')
            toast.info('Sin conexión', 'Trabajando con los últimos datos guardados en este equipo.')
            return
          }
        }
        setStatus('anonymous')
      })

    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    // Safety net: retry on a timer in case the browser missed an 'online' event.
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync()
    }, 600_000)

    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setStatus('anonymous')
        if (useDataStore.getState().mode === 'live') {
          switchToDemo()
          // Never stay on a company screen (or the kiosk) showing the sample company in place of the real
          // one: signed out means signing in again.
          navigate('/login', { replace: true })
          toast.info('Sesión cerrada', 'Inicia sesión de nuevo para continuar.')
        }
      }
    })

    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
