/**
 * How the camera image sits on THIS device right now. A tablet can be held either way and some of
 * them (or their kiosk browsers) hand over the sensor's own orientation: the picture arrives sideways
 * or upside down, and a fixed 16:9 box with a landscape-shaped guide shows it wrong. Nothing here
 * assumes a device: the image's real shape decides the box, and a rotation is found and remembered.
 */

export type Rotation = 0 | 90 | 180 | 270
export type Orientation = 'portrait' | 'landscape'

export function screenOrientation(width = window.innerWidth, height = window.innerHeight): Orientation {
  return height > width ? 'portrait' : 'landscape'
}

export const streamOrientation = (width: number, height: number): Orientation =>
  height > width ? 'portrait' : 'landscape'

/** Shape (width ÷ height) of the image after it is rotated upright. */
export function uprightAspect(width: number, height: number, rotation: Rotation): number {
  if (!width || !height) return 16 / 9
  return rotation === 90 || rotation === 270 ? height / width : width / height
}

/**
 * Shape of the window that shows the camera, from the device and from how far people stand. A tablet held
 * upright is a tall screen and the camera's picture is wide: farther away, a taller window is cut from
 * its middle (3:4, people are small and the view can afford it); at a normal distance a little (4:3);
 * and when people are at arm's reach ("near") the whole picture is shown, because anything cut away
 * would be part of the face. A picture that already has the screen's shape is always shown whole.
 */
export function windowAspect(upright: number, screen: Orientation, distance: 'near' | 'normal' | 'far' = 'normal'): number {
  if (screen === 'portrait' && upright > 1) return distance === 'near' ? upright : distance === 'far' ? 3 / 4 : 4 / 3
  if (screen === 'landscape' && upright < 1) return 4 / 3
  return upright
}

/**
 * Rotations worth trying when nobody is found, most likely first. A picture whose shape disagrees
 * with the screen's (landscape frame on a portrait screen, or the reverse) is almost surely turned a
 * quarter; otherwise it can only be upside down.
 */
export function rotationCandidates(screen: Orientation, stream: Orientation, current: Rotation): Rotation[] {
  const order: Rotation[] = screen !== stream ? [90, 270, 180, 0] : [180, 90, 270, 0]
  return order.filter((r) => r !== current)
}

// v2: the first version's saved turns came from a button pressed while the picture was already upright.
const KEY = 'nexotime.cameraRotation.v2'

/** The saved rotation is per way of holding the device (a tablet that comes sideways in portrait is fine in landscape). */
export const viewKey = (screen: Orientation, stream: Orientation) => `${screen}/${stream}`

export function loadRotation(key: string): Rotation {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>
    const r = all[key]
    return r === 90 || r === 180 || r === 270 ? r : 0
  } catch {
    return 0
  }
}

export function saveRotation(key: string, rotation: Rotation) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>
    all[key] = rotation
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private mode: it just won't be remembered */
  }
}

export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation

/**
 * Brightening applied to what the networks see when the room is dark. A tablet screen is a weak lamp;
 * what the person can do (brightness, distance) is asked of them, and this recovers the rest. Target:
 * a face averaging ~105/255, never more than 2.4×, and 1 (nothing) when the light is already fine.
 */
export function gainFor(rawFaceBrightness: number): number {
  if (!Number.isFinite(rawFaceBrightness) || rawFaceBrightness <= 0) return 1
  return Math.min(2.4, Math.max(1, 105 / Math.max(15, rawFaceBrightness)))
}
