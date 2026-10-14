import { describe, expect, it } from 'vitest'
import { distanceMeters, formatDistance, locationSource, parseCoordinates, pickPunchLocation } from '@/lib/geo'

describe('parseCoordinates', () => {
  it('lee el par que Google Maps copia con clic derecho', () => {
    expect(parseCoordinates('32.520930, -117.007890')).toEqual({ lat: 32.52093, lng: -117.00789 })
    expect(parseCoordinates(' (32.52093,-117.00789) ')).toEqual({ lat: 32.52093, lng: -117.00789 })
    expect(parseCoordinates('32.52093 -117.00789')).toEqual({ lat: 32.52093, lng: -117.00789 })
  })

  it('lee enlaces de Google Maps y prefiere el pin del lugar sobre el centro de la vista', () => {
    expect(parseCoordinates('https://www.google.com/maps?q=32.5209,-117.0078')).toEqual({ lat: 32.5209, lng: -117.0078 })
    expect(parseCoordinates('https://www.google.com/maps/@32.5209294,-117.0078967,17z')).toEqual({ lat: 32.5209294, lng: -117.0078967 })
    expect(
      parseCoordinates('https://www.google.com/maps/place/Local/@32.5300,-117.0200,15z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d32.5209294!4d-117.0078967'),
    ).toEqual({ lat: 32.5209294, lng: -117.0078967 })
  })

  it('rechaza lo que no son coordenadas', () => {
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates('Av. Revolución 123, Tijuana')).toBeNull()
    expect(parseCoordinates('132.5, -117.0')).toBeNull()
    expect(parseCoordinates('0, 0')).toBeNull()
    expect(parseCoordinates('https://maps.app.goo.gl/AbCdEf123')).toBeNull()
  })
})

describe('distanceMeters', () => {
  it('mide en línea recta', () => {
    const a = { lat: 32.520929, lng: -117.007897 }
    expect(distanceMeters(a, a)).toBe(0)
    // 0.001° de latitud son unos 111 m.
    expect(distanceMeters(a, { lat: a.lat + 0.001, lng: a.lng })).toBeGreaterThan(108)
    expect(distanceMeters(a, { lat: a.lat + 0.001, lng: a.lng })).toBeLessThan(114)
    // Tijuana centro ↔ Otay: varios kilómetros.
    expect(distanceMeters({ lat: 32.5317, lng: -117.0197 }, { lat: 32.5422, lng: -116.9717 })).toBeGreaterThan(4000)
  })

  it('se muestra en metros o kilómetros', () => {
    expect(formatDistance(85)).toBe('85 m')
    expect(formatDistance(1430)).toBe('1.4 km')
    expect(formatDistance(23_400)).toBe('23 km')
  })
})

describe('pickPunchLocation', () => {
  const branch = { lat: 32.52, lng: -117.0 }

  it('con punto de sucursal, el reloj siempre usa ese punto (el equipo no se mueve y su GPS puede mentir)', () => {
    expect(pickPunchLocation({ lat: 32.5365, lng: -117.0371, accuracy: 20 }, branch)).toEqual({ ...branch, source: 'branch' })
    expect(pickPunchLocation({ lat: 32.54, lng: -117.04, accuracy: 1800 }, branch)).toEqual({ ...branch, source: 'branch' })
    expect(pickPunchLocation({ lat: 32.54, lng: -117.04 }, branch)).toEqual({ ...branch, source: 'branch' })
    expect(pickPunchLocation(null, branch)).toEqual({ ...branch, source: 'branch' })
  })

  it('sin punto de sucursal guarda lo que tenga el equipo, con su precisión', () => {
    expect(pickPunchLocation({ lat: 32.54, lng: -117.04, accuracy: 1800 }, undefined)).toMatchObject({ accuracy: 1800, source: 'gps' })
    expect(pickPunchLocation(null, undefined)).toBeUndefined()
  })
})

describe('locationSource', () => {
  it('reconoce los registros anteriores: el punto de sucursal nunca traía precisión', () => {
    expect(locationSource({ lat: 1, lng: 1 })).toBe('branch')
    expect(locationSource({ lat: 1, lng: 1, accuracy: 20 })).toBe('gps')
    expect(locationSource({ lat: 1, lng: 1, accuracy: 20, source: 'branch' })).toBe('branch')
  })
})
