import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceDistance } from '@/types'
import {
  loadRotation,
  nextRotation,
  saveRotation,
  screenOrientation,
  streamOrientation,
  uprightAspect,
  viewKey,
  windowAspect,
  type Orientation,
  type Rotation,
} from '@/lib/cameraView'

/**
 * The camera picture as it should be shown and read on THIS device, the way it is being held:
 *  - the picture's real shape (and how the screen is turned) decides the box, never a fixed 16:9;
 *  - a rotation (0/90/180/270) turns a sideways or upside-down picture upright. It is found on its own
 *    when nobody can be seen (see `useRotationSearch`), can be set by hand, and is remembered per
 *    way of holding the device.
 */
export function useCameraView(size: { width: number; height: number }, distance: FaceDistance = 'normal') {
  const [screen, setScreen] = useState<Orientation>(() => screenOrientation())
  useEffect(() => {
    const update = () => setScreen(screenOrientation())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  const stream: Orientation = size.width ? streamOrientation(size.width, size.height) : screen
  const key = viewKey(screen, stream)
  // Rotation chosen during this visit; anything not chosen yet comes from what was remembered.
  const [chosen, setChosen] = useState<Record<string, Rotation>>({})
  const rotation: Rotation = chosen[key] ?? loadRotation(key)

  const setRotation = useCallback(
    (next: Rotation) => {
      saveRotation(key, next)
      setChosen((prev) => ({ ...prev, [key]: next }))
    },
    [key],
  )
  const rotate = useCallback(() => setRotation(nextRotation(rotation)), [rotation, setRotation])

  return {
    rotation,
    setRotation,
    rotate,
    screen,
    stream,
    /** Width ÷ height of the window that shows (and is read from) the picture: the device's shape. */
    aspect: windowAspect(uprightAspect(size.width, size.height, rotation), screen, distance),
  }
}

/**
 * Looks for the rotation that makes a face visible: when readings keep finding nobody although the
 * camera is on, other rotations are tried, one per call, and the first that shows a face is kept.
 * `report(found)` is called after every reading; `tryRotation` is the cheap probe (see findFaceRotation).
 */
export function useRotationSearch({
  enabled,
  rotation,
  setRotation,
  probe,
}: {
  enabled: boolean
  rotation: Rotation
  setRotation: (r: Rotation) => void
  /** Returns the rotation (other than the current one) at which a face is visible, or null. */
  probe: (current: Rotation) => Promise<Rotation | null>
}) {
  const empty = useRef(0)
  const lastTry = useRef(0)
  const busy = useRef(false)
  const latest = useRef({ rotation, setRotation, probe })
  useEffect(() => {
    latest.current = { rotation, setRotation, probe }
  })

  return useCallback(
    (faceSeen: boolean) => {
      if (!enabled) return
      if (faceSeen) {
        empty.current = 0
        return
      }
      empty.current += 1
      // About 2 s of an empty picture, and not more often than every 5 s: it costs a little each time.
      if (empty.current < 8 || busy.current || Date.now() - lastTry.current < 5000) return
      busy.current = true
      lastTry.current = Date.now()
      const { rotation: current, setRotation: set, probe: find } = latest.current
      void find(current)
        .then((found) => {
          if (found !== null && found !== current) {
            empty.current = 0
            set(found)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy.current = false
        })
    },
    [enabled],
  )
}
