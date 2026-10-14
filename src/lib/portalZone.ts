import { distanceMeters, formatDistance, type LatLng } from '@/lib/geo'
import type { AttendanceSettings, PunchLocation } from '@/types'

/**
 * Checking in from the phone (employee portal): only with the phone's real GPS, and close to the
 * employee's branch. The same rules run in the database (migration 013), which is what really
 * decides; here they only tell the person beforehand, instead of after the photo.
 */

/** A phone fix worse than this is a guess from the network, not where the person is. */
export const PORTAL_MAX_ACCURACY_METERS = 100
export const PORTAL_ZONE_DEFAULT_METERS = 150
export const PORTAL_ZONE_MIN_METERS = 50
export const PORTAL_ZONE_MAX_METERS = 5000

/** What happens outside the zone: not registered, registered but marked, or not checked. */
export type OutsideZoneRule = 'block' | 'flag' | 'off'

export interface ResolvedPortalZone {
  radius: number
  rule: OutsideZoneRule
}

export function resolvePortalZone(settings?: Pick<AttendanceSettings, 'portalZone'> | null): ResolvedPortalZone {
  const zone = settings?.portalZone
  const rule: OutsideZoneRule = zone?.outsideZone === 'flag' || zone?.outsideZone === 'off' ? zone.outsideZone : 'block'
  const raw = Number(zone?.radiusMeters)
  // Same as the database: whole meters, at least 50; anything absurd falls back to the default.
  const radius =
    Number.isInteger(raw) && raw > 0 && raw <= 99_999
      ? Math.min(Math.max(raw, PORTAL_ZONE_MIN_METERS), PORTAL_ZONE_MAX_METERS)
      : PORTAL_ZONE_DEFAULT_METERS
  return { radius, rule }
}

export type PortalZoneCheck =
  /** No position from the phone yet (or the permission is blocked). */
  | { kind: 'no_location' }
  /** The phone only knows its area: wait for the GPS. */
  | { kind: 'imprecise'; accuracy: number | null }
  /** Can check in. `distance` is null when there is nothing to measure against. */
  | { kind: 'inside'; distance: number | null; checked: boolean }
  /** Too far from the branch. `blocked`: it will not be registered (otherwise it is, marked). */
  | { kind: 'outside'; distance: number; radius: number; blocked: boolean }

export function checkPortalZone(
  location: PunchLocation | null | undefined,
  branch: LatLng | undefined,
  zone: ResolvedPortalZone,
  anywhere = false,
): PortalZoneCheck {
  if (!location) return { kind: 'no_location' }
  if (location.accuracy == null || location.accuracy > PORTAL_MAX_ACCURACY_METERS) {
    return { kind: 'imprecise', accuracy: location.accuracy ?? null }
  }
  const distance = branch ? distanceMeters(location, branch) : null
  const checked = zone.rule !== 'off' && !anywhere && distance != null
  // Outside is outside even counting the GPS margin of error: the benefit of the doubt goes to the person.
  if (checked && distance - location.accuracy > zone.radius) {
    return { kind: 'outside', distance, radius: zone.radius, blocked: zone.rule === 'block' }
  }
  return { kind: 'inside', distance, checked }
}

/** The sentence the person reads when they cannot check in (same wording as the database). */
export function portalZoneProblem(check: PortalZoneCheck, branchName?: string): string | null {
  switch (check.kind) {
    case 'no_location':
      return 'Activa la ubicación (GPS) de tu celular y permite que esta página la use para poder checar.'
    case 'imprecise':
      return 'Tu ubicación todavía no es precisa. Activa el GPS, sal a un lugar abierto o acércate a una ventana y espera unos segundos.'
    case 'outside':
      return check.blocked
        ? `Estás a ${formatDistance(check.distance)} de tu sucursal${branchName ? ` (${branchName})` : ''}. Para checar desde el celular debes estar a menos de ${check.radius} m de ella.`
        : null
    default:
      return null
  }
}

/** The location stored with a portal movement: the phone's GPS, its distance to the branch and the mark. */
export function portalPunchLocation(location: PunchLocation, check: PortalZoneCheck): PunchLocation {
  const stamped: PunchLocation = { lat: location.lat, lng: location.lng, accuracy: location.accuracy, source: 'gps' }
  if ((check.kind === 'inside' || check.kind === 'outside') && check.distance != null) stamped.distance = Math.round(check.distance)
  if (check.kind === 'outside') stamped.outside = true
  return stamped
}
