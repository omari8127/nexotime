/**
 * Automatic framing: the reloj measures how big the face is on every reading and zooms by itself so the
 * face always fills the oval, whether the person is at arm's reach or three steps back. Nobody has to
 * choose a "distance" for it, and a counter where people stand at different spots just works.
 */

/** Most the picture is magnified: beyond this there is no real detail left to gain (the zoom is digital). */
export const AUTO_MAX_ZOOM = 2.5

/**
 * How wide the face should look, as a share of the window's width, so that it sits inside the oval with a
 * margin. The oval is drawn in FaceViewport as rx = min(0.8·41, 0.46·width) on a 100-high canvas.
 */
export function targetFaceRatio(aspect: number): number {
  const w = Math.max(0.5, aspect) * 100
  const rx = Math.min(41 * 0.8, w * 0.46)
  return Math.min(0.55, ((2 * rx) / w) * 0.78)
}

/**
 * The zoom to use for the next reading.
 *  - `size`: face width ÷ window width in the reading just taken (already includes the current zoom);
 *  - `offset`: where the face centre is, −0.5…0.5 from the middle.
 * It moves toward the target by at most 20 % per reading, ignores small differences (no hunting back and
 * forth) and never zooms in so far that the face would leave the window.
 */
export function nextAutoZoom(
  current: number,
  size: number,
  offset: { x: number; y: number },
  opts: { min: number; max: number; target: number; aspect: number },
): number {
  if (!Number.isFinite(size) || size <= 0) return current
  const ratio = opts.target / size
  if (Math.abs(ratio - 1) < 0.15) return current
  let factor = Math.min(1.2, Math.max(1 / 1.2, ratio))
  if (factor > 1) {
    // Zooming in crops the edges: how far does the face reach from the centre, horizontally and vertically
    // (a face is about 1.3 times taller than wide)?
    const reachX = Math.abs(offset.x) + size / 2
    const reachY = Math.abs(offset.y) + (size * 1.3 * opts.aspect) / 2
    const reach = Math.max(reachX, reachY)
    if (reach * factor > 0.47) factor = Math.max(1, 0.47 / reach)
  }
  const next = Math.min(opts.max, Math.max(opts.min, current * factor))
  return Math.abs(next - current) < 0.01 ? current : next
}
