import { useEffect, useState } from 'react'

/** Tracks browser connectivity so the clock can keep taking registros
 *  offline and show when it's back to sync — common in tablets deployed in
 *  bodegas o sucursales con wifi poco confiable. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
