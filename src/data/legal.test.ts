import { describe, expect, it } from 'vitest'
import { COPYRIGHT_HOLDER, LEGAL_LINKS, LEGAL_PATHS, copyrightLine, pendingLegalFields } from '@/data/legal'

describe('datos legales', () => {
  it('lista lo que falta por completar y nada más', () => {
    expect(pendingLegalFields({ rfc: null, address: null, email: null })).toEqual(['rfc', 'address', 'email'])
    expect(pendingLegalFields({ rfc: 'XXXX', address: 'Calle 1', email: null })).toEqual(['email'])
    expect(pendingLegalFields({ rfc: 'XXXX', address: 'Calle 1', email: 'a@b.mx' })).toEqual([])
  })

  it('el pie de página muestra la marca, no el nombre del titular', () => {
    expect(copyrightLine(2026)).toBe('© 2026 NEXOTIME. Todos los derechos reservados.')
    expect(copyrightLine(2026)).not.toContain(COPYRIGHT_HOLDER)
  })

  it('cada enlace legal apunta a una ruta distinta y pública', () => {
    const paths = LEGAL_LINKS.map((l) => l.to)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.sort()).toEqual(Object.values(LEGAL_PATHS).sort())
  })
})
