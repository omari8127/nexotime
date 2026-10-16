import { describe, expect, it } from 'vitest'
import { FACTORY_EXIT_CODE, exitCodeProblem } from '@/lib/exitCode'

describe('código de salida de la tablet', () => {
  it('acepta uno propio de 4 a 8 dígitos escrito dos veces igual', () => {
    expect(exitCodeProblem('7391', '7391')).toBeNull()
    expect(exitCodeProblem('85207164', '85207164')).toBeNull()
  })

  it('rechaza el de fábrica, los repetidos y las secuencias', () => {
    expect(exitCodeProblem(FACTORY_EXIT_CODE, FACTORY_EXIT_CODE)).toMatch(/fábrica/)
    expect(exitCodeProblem('0000', '0000')).toMatch(/repetido/)
    expect(exitCodeProblem('99999', '99999')).toMatch(/repetido/)
    expect(exitCodeProblem('4321', '4321')).toMatch(/secuencia/)
    expect(exitCodeProblem('23456', '23456')).toMatch(/secuencia/)
    // Casi una secuencia, pero no lo es.
    expect(exitCodeProblem('1243', '1243')).toBeNull()
  })

  it('exige la longitud y que las dos veces coincidan', () => {
    expect(exitCodeProblem('123', '123')).toMatch(/4 a 8/)
    expect(exitCodeProblem('123456789', '123456789')).toMatch(/4 a 8/)
    expect(exitCodeProblem('73a1', '73a1')).toMatch(/4 a 8/)
    expect(exitCodeProblem('7391', '7392')).toMatch(/no coinciden/)
  })
})
