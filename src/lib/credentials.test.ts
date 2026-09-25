import { describe, expect, it } from 'vitest'
import { findEmployeeByCode, generateBarcodeValue, generateQrValue, takenBarcodes } from '@/lib/credentials'
import type { Employee } from '@/types'

const emp = (id: string, ids: Employee['identifications'], status: Employee['status'] = 'active') =>
  ({ id, fullName: id, status, identifications: ids }) as unknown as Employee

describe('generación de códigos', () => {
  it('QR: prefijo NXT1 y no repetible', () => {
    const values = new Set(Array.from({ length: 500 }, generateQrValue))
    expect(values.size).toBe(500)
    for (const v of values) expect(v).toMatch(/^NXT1-[A-Z0-9]{12}$/)
  })
  it('código de barras: 10 dígitos, sin cero inicial y único entre los existentes', () => {
    const taken = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const v = generateBarcodeValue(taken)
      expect(v).toMatch(/^[1-9]\d{9}$/)
      expect(taken.has(v)).toBe(false)
      taken.add(v)
    }
  })
})

describe('findEmployeeByCode', () => {
  const ana = emp('ana', [{ method: 'qr', enabled: true, value: 'NXT1-AAAA' }, { method: 'barcode', enabled: true, value: '1234567890' }])
  const beto = emp('beto', [{ method: 'qr', enabled: false, value: 'NXT1-BBBB' }])
  const carla = emp('carla', [{ method: 'qr', enabled: true, value: 'NXT1-CCCC' }], 'inactive')
  const all = [ana, beto, carla]

  it('identifica por QR y por código de barras', () => {
    expect(findEmployeeByCode(all, 'NXT1-AAAA')).toMatchObject({ ok: true, method: 'qr' })
    expect(findEmployeeByCode(all, ' 1234567890 ')).toMatchObject({ ok: true, method: 'barcode' })
  })
  it('rechaza códigos desconocidos, desactivados y de empleados inactivos', () => {
    expect(findEmployeeByCode(all, 'NXT1-ZZZZ')).toEqual({ ok: false, reason: 'unknown' })
    expect(findEmployeeByCode(all, 'NXT1-BBBB')).toEqual({ ok: false, reason: 'disabled' })
    expect(findEmployeeByCode(all, 'NXT1-CCCC')).toEqual({ ok: false, reason: 'inactive' })
    expect(findEmployeeByCode(all, '   ')).toEqual({ ok: false, reason: 'unknown' })
  })
  it('lista los códigos de barras ya asignados', () => {
    expect(takenBarcodes(all)).toEqual(['1234567890'])
  })
})
