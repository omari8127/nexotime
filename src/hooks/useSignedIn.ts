import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'

/** A real (not demo) session is open in this browser. */
export function useSignedIn(): boolean {
  const mode = useDataStore((s) => s.mode)
  const status = useAuthStore((s) => s.status)
  return mode === 'live' && status === 'authenticated'
}
