import { useLayoutEffect } from 'react'
import { applyTheme, useUIStore } from '@/store/uiStore'

/**
 * The public pages (login, sign-up, activation, legal, set-up, employee portal) are always light, like
 * the welcome page: the same first impression whatever theme the panel was left in. The form controls
 * take their dark colours from the `dark` class on <html>, so that class is lifted while one of these
 * pages is on screen and put back (to the saved theme) when it leaves.
 */
export function useLightTheme() {
  const saved = useUIStore((s) => s.theme)
  useLayoutEffect(() => {
    applyTheme('light')
    return () => applyTheme(saved)
  }, [saved])
}
