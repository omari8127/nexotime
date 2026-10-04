import { describe, expect, it } from 'vitest'
import { LEGAL_LINKS, LEGAL_PATHS, pendingLegalFields } from '@/data/legal'

describe('datos legales', () => {
  it('lista lo que falta por completar y nada más', () => {
    expect(pendingLegalFields({ rfc: null, address: null, email: null })).toEqual(['rfc', 'address', 'email'])
    expect(pendingLegalFields({ rfc: 'XXXX', address: 'Calle 1', email: null })).toEqual(['email'])
    expect(pendingLegalFields({ rfc: 'XXXX', address: 'Calle 1', email: 'a@b.mx' })).toEqual([])
  })

  it('cada enlace legal apunta a una ruta distinta y pública', () => {
    const paths = LEGAL_LINKS.map((l) => l.to)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.sort()).toEqual(Object.values(LEGAL_PATHS).sort())
  })
})
