import { Suspense, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { Sidebar } from '@/components/shared/Sidebar'
import { NexotimeLogo } from '@/components/shared/Logo'
import { BranchSelector } from '@/components/shared/BranchSelector'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { PageSkeleton } from '@/components/shared/Loaders'
import { useUIStore, applyTheme } from '@/store/uiStore'
import { useDataStore } from '@/store/dataStore'
import { copyrightLine } from '@/data/legal'

export function AdminLayout() {
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen)
  const setMobileNav = useUIStore((s) => s.setMobileNav)
  const theme = useUIStore((s) => s.theme)
  const isEmployee = useDataStore((s) => s.currentUser.role === 'employee')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden shrink-0 border-r border-sidebar-border lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-slate-950/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNav(false)}
            />
            <motion.div
              className="absolute left-0 top-0 h-full"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sidebar onNavigate={() => setMobileNav(false)} />
            </motion.div>
            <button
              type="button"
              onClick={() => setMobileNav(false)}
              className="absolute right-4 top-4 rounded-lg bg-card p-2 text-foreground shadow-md"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <NexotimeLogo tone="dark" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <NotificationBell />
            {isEmployee ? null : <BranchSelector />}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
            <p className="mt-10 text-center text-xs text-muted-foreground">{copyrightLine()}</p>
          </div>
        </main>
      </div>
    </div>
  )
}
