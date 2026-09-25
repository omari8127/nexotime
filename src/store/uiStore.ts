import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  branchFilter: string // 'all' | branchId
  onboardingCompleted: boolean
  toggleTheme: () => void
  toggleSidebar: () => void
  setMobileNav: (open: boolean) => void
  setBranchFilter: (value: string) => void
  completeOnboarding: () => void
  resetOnboarding: () => void
}

const KEY = 'nexotime.ui'

function load(): Partial<UIState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function persist(state: UIState) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        branchFilter: state.branchFilter,
        onboardingCompleted: state.onboardingCompleted,
      }),
    )
  } catch {
    /* ignore */
  }
}

const saved = load()

export const useUIStore = create<UIState>((set, get) => ({
  theme: saved.theme ?? 'light',
  sidebarCollapsed: saved.sidebarCollapsed ?? false,
  mobileNavOpen: false,
  branchFilter: saved.branchFilter ?? 'all',
  onboardingCompleted: saved.onboardingCompleted ?? false,

  toggleTheme: () => {
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' }))
    persist(get())
  },
  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
    persist(get())
  },
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  setBranchFilter: (value) => {
    set({ branchFilter: value })
    persist(get())
  },
  completeOnboarding: () => {
    set({ onboardingCompleted: true })
    persist(get())
  },
  resetOnboarding: () => {
    set({ onboardingCompleted: false })
    persist(get())
  },
}))

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}
