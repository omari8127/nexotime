import { useEffect, useState } from 'react'

/**
 * Wraps the Fullscreen API for kiosk-style deployments (e.g. an Android
 * tablet running the clock in Chrome). Falls back silently where the API or
 * permission is unavailable — the clock works fine without it.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  )

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Permission denied or unsupported (e.g. inside an iframe) — ignore.
    }
  }

  return { isFullscreen, toggle }
}
