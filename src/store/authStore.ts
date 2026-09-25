import { create } from 'zustand'

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated'

interface AuthState {
  status: AuthStatus
  setStatus: (status: AuthStatus) => void
}

/**
 * Tracks whether there's a real (Supabase) session — separate from
 * `dataStore`'s `mode`, because we need to know "logged out" even before any
 * company data has ever been loaded (e.g. straight after opening /login).
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',
  setStatus: (status) => set({ status }),
}))
