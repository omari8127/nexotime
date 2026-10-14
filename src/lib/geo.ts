/**
 * Location helpers: reading coordinates people paste, measuring how far a movement was from the
 * branch, and deciding which position a movement is stamped with.
 */
import type { PunchLocation } from '@/types'

export interface LatLng {
  lat: number
  lng: number
}

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

/**
 * Coordinates from whatever an administrator pastes: the pair Google Maps copies on right-click
 * ("32.520930, -117.007890"), or a Google Maps link (…/@32.52,-117.00,17z, ?q=32.52,-117.00,
 * !3d32.52!4d-117.00). Returns null when there is no usable pair in the text.
 */
export function parseCoordinates(text: string): LatLng | null {
  const s = text.trim()
  if (!s) return null
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'
  const patterns = [
    // The pin of a place link: the most exact pair in a Google Maps URL.
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`[?&](?:q|query|ll|center|destination)=(?:loc:)?${num}(?:,|%2C)\\s*${num}`, 'i'),
    new RegExp(`@${num},${num}`),
    new RegExp(`^\\(?\\s*${num}\\s*[,;\\s]\\s*${num}\\s*\\)?$`),
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(s)
    if (!m) continue
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (valid(lat, lng)) return { lat, lng }
  }
  return null
}

/** Straight-line distance in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))))
}

/** "85 m", "1.4 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
}

/** Beyond this the device only knows the area: shown as approximate, never as "where it was". */
export const ROUGH_FIX_METERS = 250

/** Whether a stored position came from the device's own GPS or is the branch's fixed point. */
export function locationSource(location: PunchLocation): 'gps' | 'branch' {
  // Movements saved before the source was recorded: the branch's point never carried an accuracy.
  return location.source ?? (location.accuracy != null ? 'gps' : 'branch')
}

/**
 * The position a movement made at a reloj checador is stamped with:
 *  - the branch's fixed point when an administrator set it: the reloj does not move, and a PC or a
 *    tablet does not really know where it is — it guesses from the Internet connection or nearby
 *    Wi-Fi, often the same wrong point every time, sometimes even claiming to be precise;
 *  - otherwise whatever the device has, marked with its accuracy (shown as approximate when rough).
 * Phones in the employee portal always send their own GPS: that is where it matters.
 */
export function pickPunchLocation(device: PunchLocation | null | undefined, branch: LatLng | undefined): PunchLocation | undefined {
  if (branch) return { lat: branch.lat, lng: branch.lng, source: 'branch' }
  return device ? { ...device, source: 'gps' } : undefined
}

export function googleMapsUrl(point: LatLng): string {
  return `https://www.google.com/maps?q=${point.lat},${point.lng}`
}

/** A small OpenStreetMap view with a marker on the point (no key, no account). */
export function mapEmbedUrl(point: LatLng, spanMeters = 350): string {
  const dLat = spanMeters / 111_320
  const dLng = spanMeters / (111_320 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)))
  const box = [point.lng - dLng, point.lat - dLat, point.lng + dLng, point.lat + dLat].map((n) => n.toFixed(6)).join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(box)}&layer=mapnik&marker=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`
}

/** Size of one OpenStreetMap tile, in pixels. */
export const MAP_TILE = 256

/** Where a point falls on the OpenStreetMap tile grid at a zoom level, in pixels of the whole world. */
export function worldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const size = MAP_TILE * 2 ** zoom
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return {
    x: ((lng + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size,
  }
}

/** Meters one screen pixel covers at that latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}
