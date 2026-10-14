import { describe, expect, it } from 'vitest'
import { checkPortalZone, portalPunchLocation, portalZoneProblem, resolvePortalZone } from '@/lib/portalZone'

const branch = { lat: 32.5209, lng: -117.0079 }
/** Meters north of the branch. */
const north = (m: number, accuracy?: number) => ({ lat: branch.lat + m / 111195, lng: branch.lng, accuracy })
const zone = resolvePortalZone(undefined)

describe('resolvePortalZone', () => {
  it('por defecto: 150 m y bloquear', () => {
    expect(zone).toEqual({ radius: 150, rule: 'block' })
  })

  it('respeta lo configurado dentro de los límites, igual que la base de datos', () => {
    expect(resolvePortalZone({ portalZone: { radiusMeters: 300, outsideZone: 'flag' } })).toEqual({ radius: 300, rule: 'flag' })
    expect(resolvePortalZone({ portalZone: { radiusMeters: 10 } }).radius).toBe(50)
    expect(resolvePortalZone({ portalZone: { radiusMeters: 20_000 } }).radius).toBe(5000)
    expect(resolvePortalZone({ portalZone: { radiusMeters: 99_999_999 } }).radius).toBe(150)
    expect(resolvePortalZone({ portalZone: { outsideZone: 'x' as never } }).rule).toBe('block')
  })
})

describe('checkPortalZone', () => {
  it('sin ubicación o con una aproximada no se puede checar', () => {
    expect(checkPortalZone(null, branch, zone).kind).toBe('no_location')
    expect(checkPortalZone(north(10, 1800), branch, zone)).toEqual({ kind: 'imprecise', accuracy: 1800 })
    expect(checkPortalZone(north(10), branch, zone)).toEqual({ kind: 'imprecise', accuracy: null })
  })

  it('cerca de la sucursal sí, con la distancia', () => {
    const check = checkPortalZone(north(50, 12), branch, zone)
    expect(check.kind).toBe('inside')
    expect(check.kind === 'inside' && Math.round(check.distance!)).toBe(50)
  })

  it('el margen de error del GPS cuenta a favor de la persona', () => {
    expect(checkPortalZone(north(185, 40), branch, zone).kind).toBe('inside')
    expect(checkPortalZone(north(185, 10), branch, zone).kind).toBe('outside')
  })

  it('desde su casa: bloqueado, o marcado si la empresa así lo eligió', () => {
    expect(checkPortalZone(north(3000, 15), branch, zone)).toMatchObject({ kind: 'outside', blocked: true, radius: 150 })
    expect(checkPortalZone(north(3000, 15), branch, { radius: 150, rule: 'flag' })).toMatchObject({ kind: 'outside', blocked: false })
    expect(checkPortalZone(north(3000, 15), branch, { radius: 150, rule: 'off' })).toMatchObject({ kind: 'inside', checked: false })
  })

  it('quien puede checar en cualquier lugar, o una sucursal sin punto, no se revisa', () => {
    expect(checkPortalZone(north(3000, 15), branch, zone, true)).toMatchObject({ kind: 'inside', checked: false })
    expect(checkPortalZone(north(3000, 15), undefined, zone)).toEqual({ kind: 'inside', distance: null, checked: false })
  })
})

describe('portalZoneProblem / portalPunchLocation', () => {
  it('explica por qué no se puede checar', () => {
    expect(portalZoneProblem(checkPortalZone(north(3000, 15), branch, zone), 'Centro')).toBe(
      'Estás a 3.0 km de tu sucursal (Centro). Para checar desde el celular debes estar a menos de 150 m de ella.',
    )
    expect(portalZoneProblem(checkPortalZone(north(50, 12), branch, zone))).toBeNull()
  })

  it('guarda el GPS real con su distancia y la marca de fuera de zona', () => {
    const where = north(3000, 15)
    expect(portalPunchLocation(where, checkPortalZone(where, branch, { radius: 150, rule: 'flag' }))).toMatchObject({
      source: 'gps',
      accuracy: 15,
      outside: true,
    })
    const near = north(50, 12)
    expect(portalPunchLocation(near, checkPortalZone(near, branch, zone))).toEqual({ ...near, source: 'gps', distance: 50 })
  })
})
