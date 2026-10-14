import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTO_MAX_ZOOM, nextAutoZoom, targetFaceRatio } from '@/lib/autoFrame'
import type { QualityIssue, ReadResult } from '@/lib/face'
import type { FaceDistance } from '@/types'

/** Back to the starting zoom after nobody has been seen for this long (the next person starts wide). */
const FORGET_AFTER_MS = 20_000

/**
 * The zoom of the face camera. With the distance set to "automatic" it follows the face (see autoFrame);
 * with a fixed distance it is just the zoom chosen in Configuración, as before.
 *  - `zoom`: for drawing the picture; `zoomRef`: what the next reading must use (always current).
 *  - `note(result)`: call after every reading.
 *  - `relevant(issues)`: drops "come closer / step back" while the zoom is still catching up.
 */
export function useAutoFrame({ distance, baseZoom, aspect }: { distance: FaceDistance; baseZoom: number; aspect: number }) {
  const auto = distance === 'auto'
  const min = Math.max(1, baseZoom)
  const [zoom, setZoom] = useState(min)
  const zoomRef = useRef(min)
  const lastFace = useRef(0)
  const aspectRef = useRef(aspect)
  useEffect(() => {
    aspectRef.current = aspect
  })
  useEffect(() => {
    zoomRef.current = min
    setZoom(min)
  }, [min, auto])

  const note = useCallback(
    (result: ReadResult) => {
      if (!auto) return
      const now = Date.now()
      if (result.kind === 'face') {
        lastFace.current = now
        const r = result.reading
        const next = nextAutoZoom(zoomRef.current, r.size, r.offset, {
          min,
          max: AUTO_MAX_ZOOM,
          target: targetFaceRatio(aspectRef.current),
          aspect: aspectRef.current,
        })
        if (next !== zoomRef.current) {
          zoomRef.current = next
          setZoom(next)
        }
      } else if (result.kind === 'none' && lastFace.current && now - lastFace.current > FORGET_AFTER_MS) {
        lastFace.current = 0
        if (zoomRef.current !== min) {
          zoomRef.current = min
          setZoom(min)
        }
      }
    },
    [auto, min],
  )

  const relevant = useCallback(
    (issues: QualityIssue[]): QualityIssue[] => {
      if (!auto) return issues
      return issues.filter(
        (i) =>
          !(i === 'small' && zoomRef.current < AUTO_MAX_ZOOM - 0.1) && !(i === 'close' && zoomRef.current > min + 0.1),
      )
    },
    [auto, min],
  )

  return { auto, zoom, zoomRef, note, relevant }
}
