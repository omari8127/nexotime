/** The factory exit code, which anyone who has seen a tablet being set up can guess. */
export const FACTORY_EXIT_CODE = '1234'

/**
 * Why a proposed exit code is not acceptable (null when it is). 4 to 8 digits, not the factory one,
 * not one digit repeated (0000), not a straight run (2345, 8765), and typed twice the same.
 */
export function exitCodeProblem(code: string, again: string): string | null {
  if (!/^\d{4,8}$/.test(code)) return 'Debe tener de 4 a 8 dígitos.'
  if (code === FACTORY_EXIT_CODE) return 'Ese es el código de fábrica: elige uno propio.'
  if (/^(\d)\1+$/.test(code)) return 'No uses el mismo dígito repetido.'
  const digits = [...code].map(Number)
  const step = digits[1] - digits[0]
  if ((step === 1 || step === -1) && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) {
    return 'No uses una secuencia (1234, 4321…): es de las primeras que se prueban.'
  }
  if (code !== again) return 'Los dos códigos no coinciden.'
  return null
}
