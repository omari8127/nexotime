/** The name shown to the public: in the footers, the clock and the copyright line. */
export const BRAND = 'NEXOTIME'

/**
 * Who owns the software and provides the service. It appears only where the law asks for it: the
 * Aviso de privacidad (identity of the responsable, LFPDPPP 2025 art. 15 I), the Aviso legal and the
 * Términos (who the client contracts with). If the service moves to a company (e.g. an S.A.S.), change
 * it here once.
 */
export const COPYRIGHT_HOLDER = 'Omar Isaird Espinoza Guevara'

/**
 * The footer line on every screen. The brand, not the person: the copyright exists from the moment
 * the work is created (Ley Federal del Derecho de Autor) and does not depend on printing a name here.
 */
export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} ${BRAND}. Todos los derechos reservados.`
}

/**
 * Who is behind the service, as shown in the public legal pages. Fill the `null`s in
 * (they render as a visible "pendiente" marker until then — nothing is invented).
 * `docs/ESTADO.md` lists what each one is needed for.
 */
export const LEGAL_ENTITY = {
  holder: COPYRIGHT_HOLDER,
  /** Persona física con actividad empresarial: RFC. */
  rfc: null as string | null,
  /** Domicilio para oír y recibir notificaciones (obligatorio en el aviso legal y de privacidad). */
  address: null as string | null,
  /** Correo para soporte, avisos legales y solicitudes ARCO. */
  email: null as string | null,
  phone: null as string | null,
}

/** Shown on every public legal page and stored with the acceptance at sign-up. */
export const LEGAL_VERSION = '2026-10-15'
export const LEGAL_UPDATED = '15 de octubre de 2026'

export const LEGAL_PATHS = {
  aviso: '/aviso-legal',
  privacidad: '/privacidad',
  terminos: '/terminos',
  cookies: '/cookies',
} as const

export const LEGAL_LINKS: { to: string; label: string }[] = [
  { to: LEGAL_PATHS.aviso, label: 'Aviso legal' },
  { to: LEGAL_PATHS.privacidad, label: 'Privacidad' },
  { to: LEGAL_PATHS.terminos, label: 'Términos' },
  { to: LEGAL_PATHS.cookies, label: 'Cookies' },
]

/** Required entity fields still missing, so they can be listed (docs, tests) instead of forgotten. */
export function pendingLegalFields(entity: Pick<typeof LEGAL_ENTITY, 'rfc' | 'address' | 'email'> = LEGAL_ENTITY): string[] {
  return (['rfc', 'address', 'email'] as const).filter((k) => !entity[k])
}
