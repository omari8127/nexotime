import { create } from 'zustand'

/** Live-mode sync status: how many writes are parked waiting for the network. */
interface SyncState {
  pending: number
  syncing: boolean
  setPending: (n: number) => void
  setSyncing: (v: boolean) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  pending: 0,
  syncing: false,
  setPending: (pending) => set({ pending }),
  setSyncing: (syncing) => set({ syncing }),
}))
