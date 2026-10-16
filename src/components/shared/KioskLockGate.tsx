import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useDataStore } from '@/store/dataStore'
import {
  PANEL_UNLOCK_MS,
  getDeviceUse,
  isPanelUnlocked,
  mustStayAtClock,
  touchPanel,
} from '@/lib/deviceUse'

/**
 * Keeps a device that works as the reloj checador out of the panel. Opening the app there (the home
 * icon, the address, the back button) goes to the clock; the panel opens only after the exit code
 * ("Salir" on the clock, or a tap on its logo) and closes again after 15 minutes without touching it.
 *
 * Demo mode and ordinary computers (no "kiosk" mark) are untouched.
 */
export function KioskLockGate({ children }: { children: ReactNode }) {
  const mode = useDataStore((s) => s.mode)
  const { pathname } = useLocation()
  const [, tick] = useState(0)
  const kiosk = mode === 'live' && getDeviceUse() === 'kiosk'
  const locked = kiosk && mustStayAtClock('kiosk', isPanelUnlocked())

  // Whoever is working in the panel keeps it open; leaving it idle closes it.
  useEffect(() => {
    if (!kiosk) return
    const keep = () => {
      if (isPanelUnlocked()) touchPanel()
    }
    window.addEventListener('pointerdown', keep)
    window.addEventListener('keydown', keep)
    const id = window.setInterval(() => tick((n) => n + 1), Math.min(30_000, PANEL_UNLOCK_MS / 2))
    return () => {
      window.removeEventListener('pointerdown', keep)
      window.removeEventListener('keydown', keep)
      clearInterval(id)
    }
  }, [kiosk])
  useEffect(() => {
    if (kiosk && isPanelUnlocked()) touchPanel()
  }, [kiosk, pathname])

  if (locked) return <Navigate to="/clock" replace />
  return <>{children}</>
}
