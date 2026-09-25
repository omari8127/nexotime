import { useEffect, useRef, useState } from 'react'

/** Tracks an element's content width via ResizeObserver. Avoids Recharts'
 *  ResponsiveContainer, which can mis-measure to a tiny size under StrictMode. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, width }
}
