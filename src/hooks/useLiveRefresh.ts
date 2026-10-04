import { useEffect } from 'react'
import { restoreSession } from '@/services/live/liveApi'
import { useDataStore } from '@/store/dataStore'
import { toast } from '@/components/ui/toast'

/**
 * Re-fetches this company's data from Supabase so a long-lived screen (the
 * kiosk clock, a dashboard tab left open for hours) picks up changes made
 * elsewhere — a new employee, an edited branch — without a manual reload.
 * Runs when the screen mounts and again whenever its tab regains focus.
 * Silent no-op in demo mode or while offline.
 */
export function useLiveRefresh() {
  const mode = useDataStore((s) => s.mode)
  const hydrateLive = useDataStore((s) => s.hydrateLive)

  useEffect(() => {
    if (mode !== 'live') return
    const refresh = () => {
      restoreSession()
        .then((bundle) => {
          if (!bundle) return
          // The sign-in is shared by every tab of this browser. If another tab signed in with a different
          // account, this screen would silently turn into that company — say so instead.
          const { company } = useDataStore.getState()
          if (company.id !== bundle.company.id) {
            toast.info('Cambió la cuenta', `Se inició sesión con otra cuenta en este navegador: ahora ves ${bundle.company.name}.`)
          }
          hydrateLive(bundle)
        })
        .catch(() => {
          // Best-effort: offline or a transient hiccup just keeps showing the last known data.
        })
    }
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])
}
