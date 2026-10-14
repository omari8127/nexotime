import { useCallback, useState } from 'react'
import { getDeviceUse, setDeviceUse, type DeviceUse } from '@/lib/deviceUse'

/** What this browser is for (see lib/deviceUse), readable and changeable from any screen. */
export function useDeviceUse(): [DeviceUse | null, (use: DeviceUse | null) => void] {
  const [use, setUse] = useState<DeviceUse | null>(() => getDeviceUse())
  const change = useCallback((next: DeviceUse | null) => {
    setDeviceUse(next)
    setUse(next)
  }, [])
  return [use, change]
}
