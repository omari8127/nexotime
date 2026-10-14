import { useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { MAP_TILE, googleMapsUrl, metersPerPixel, worldPixel } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { PunchLocation } from '@/types'

const TILE = MAP_TILE

/**
 * A small map with a pin where the movement was made: nine map pictures (OpenStreetMap tiles) around
 * the point, nothing else. Not an embedded map page — that froze weak tablets at the moment of
 * checking in. Without Internet the pictures fail and it quietly shows a plain placeholder.
 */
export function MiniMap({
  location,
  zoom = 17,
  link = false,
  className,
}: {
  location: Pick<PunchLocation, 'lat' | 'lng' | 'accuracy'>
  zoom?: number
  /** Open Google Maps when tapped (not at the reloj checador: it would leave the kiosk). */
  link?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const tiles = useMemo(() => {
    const p = worldPixel(location.lat, location.lng, zoom)
    const cx = Math.floor(p.x / TILE)
    const cy = Math.floor(p.y / TILE)
    const max = 2 ** zoom
    const list: Array<{ key: string; src: string; dx: number; dy: number }> = []
    for (let ty = cy - 1; ty <= cy + 1; ty++) {
      if (ty < 0 || ty >= max) continue
      for (let tx = cx - 1; tx <= cx + 1; tx++) {
        const wrapped = ((tx % max) + max) % max
        list.push({
          key: `${tx}/${ty}`,
          src: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`,
          // Offset of the tile's corner from the point, which sits at the centre of the box.
          dx: tx * TILE - p.x,
          dy: ty * TILE - p.y,
        })
      }
    }
    return list
  }, [location.lat, location.lng, zoom])

  // The GPS margin of error as a soft circle (only when it is small enough to mean something).
  const radius =
    location.accuracy != null && location.accuracy <= 300 ? location.accuracy / metersPerPixel(location.lat, zoom) : 0

  const body = failed ? (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400">
      <MapPin className="h-6 w-6" />
      <span className="text-[11px] tabular-nums">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </span>
    </div>
  ) : (
    <>
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          draggable={false}
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailed(true)}
          className="pointer-events-none absolute max-w-none select-none"
          style={{ width: TILE, height: TILE, left: `calc(50% + ${t.dx}px)`, top: `calc(50% + ${t.dy}px)` }}
        />
      ))}
      {radius > 6 ? (
        <span
          className="pointer-events-none absolute rounded-full border border-sky-500/60 bg-sky-400/20"
          style={{ width: radius * 2, height: radius * 2, left: `calc(50% - ${radius}px)`, top: `calc(50% - ${radius}px)` }}
        />
      ) : null}
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md">
        <MapPin className="h-8 w-8 fill-rose-500 text-white" strokeWidth={1.75} />
      </span>
      <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-white/80 px-1 text-[9px] leading-tight text-slate-600">
        © OpenStreetMap
      </span>
    </>
  )

  const box = cn('relative block overflow-hidden bg-slate-100', className)
  return link && !failed ? (
    <a href={googleMapsUrl(location)} target="_blank" rel="noreferrer" title="Abrir en Google Maps" className={box}>
      {body}
    </a>
  ) : (
    <div className={box} role="img" aria-label={`Mapa: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}>
      {body}
    </div>
  )
}
