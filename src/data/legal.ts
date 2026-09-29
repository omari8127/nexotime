/**
 * Single source of truth for the copyright notice shown across the app
 * (landing, login/signup, reloj checador, panel) and referenced in the legal
 * drafts under docs/legal/. Change the name here once if it's ever needed.
 */
export const COPYRIGHT_HOLDER = 'Omar Isaird Espinoza Guevara'

export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} ${COPYRIGHT_HOLDER}. Todos los derechos reservados.`
}
