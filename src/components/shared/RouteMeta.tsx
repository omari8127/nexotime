import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LEGAL_PATHS } from '@/data/legal'

const SITE_NAME = 'NEXOTIME'
const DEFAULT_DESCRIPTION =
  'Reloj checador con rostro, QR o código de empleado, horarios, reportes exportables y auditoría completa. Controla la asistencia de tu equipo desde cualquier navegador.'

interface Meta {
  title: string
  description?: string
  /** Only public, useful pages are offered to search engines; everything else is `noindex`. */
  index?: boolean
}

const PUBLIC: Record<string, Meta> = {
  '/bienvenida': {
    title: `${SITE_NAME} — Control de asistencia y reloj checador para empresas`,
    index: true,
  },
  '/signup': {
    title: `Crear cuenta de empresa · ${SITE_NAME}`,
    description: 'Crea la cuenta de tu empresa en NEXOTIME: configura sucursales, empleados y horarios, y conecta tu reloj checador en minutos.',
    index: true,
  },
  '/login': { title: `Iniciar sesión · ${SITE_NAME}` },
  [LEGAL_PATHS.aviso]: {
    title: `Aviso legal · ${SITE_NAME}`,
    description: 'Titular del sitio y condiciones generales de uso de NEXOTIME.',
    index: true,
  },
  [LEGAL_PATHS.privacidad]: {
    title: `Aviso de privacidad · ${SITE_NAME}`,
    description: 'Cómo se tratan los datos personales en NEXOTIME: cuenta, rostro, foto de verificación y ubicación.',
    index: true,
  },
  [LEGAL_PATHS.terminos]: {
    title: `Términos y condiciones · ${SITE_NAME}`,
    description: 'Condiciones de uso del servicio NEXOTIME para empresas.',
    index: true,
  },
  [LEGAL_PATHS.cookies]: {
    title: `Aviso de cookies · ${SITE_NAME}`,
    description: 'NEXOTIME solo usa almacenamiento técnico del navegador; sin cookies de publicidad ni seguimiento.',
    index: true,
  },
  '/404': { title: `Página no encontrada · ${SITE_NAME}` },
}

/** Tab titles for the private screens (they are never indexed). */
const PRIVATE_TITLES: [prefix: string, title: string][] = [
  ['/clock', 'Reloj checador'],
  ['/onboarding', 'Configuración inicial'],
  ['/mi-asistencia', 'Mi asistencia'],
  ['/empleados', 'Empleados'],
  ['/asistencia', 'Asistencia'],
  ['/incidencias', 'Incidencias'],
  ['/horarios', 'Horarios'],
  ['/sucursales', 'Sucursales'],
  ['/reportes', 'Reportes'],
  ['/dispositivos', 'Dispositivos'],
  ['/usuarios', 'Usuarios'],
  ['/auditoria', 'Auditoría'],
  ['/configuracion', 'Configuración'],
  ['/integraciones', 'Integraciones'],
]

function metaFor(pathname: string): Required<Meta> {
  const pub = PUBLIC[pathname]
  if (pub) return { description: DEFAULT_DESCRIPTION, index: false, ...pub }
  const priv = PRIVATE_TITLES.find(([p]) => pathname === p || pathname.startsWith(p + '/'))
  const title = priv ? `${priv[1]} · ${SITE_NAME}` : pathname === '/' ? `Panel · ${SITE_NAME}` : SITE_NAME
  return { title, description: DEFAULT_DESCRIPTION, index: false }
}

function head<K extends keyof HTMLElementTagNameMap>(tag: K, attr: string, key: string) {
  let el = document.head.querySelector<HTMLElementTagNameMap[K]>(`${tag}[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement(tag)
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  return el
}

/**
 * Keeps the document title, description, robots, canonical and Open Graph tags in step with the
 * route. Search engines that run JavaScript (Google) see these; link previews (WhatsApp, Slack)
 * read the static tags in index.html instead, which describe the site as a whole.
 */
export function RouteMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const m = metaFor(pathname)
    const url = `${__SITE_URL__}${pathname === '/' ? '' : pathname}`
    document.title = m.title
    head('meta', 'name', 'description').setAttribute('content', m.description)
    head('meta', 'name', 'robots').setAttribute('content', m.index ? 'index,follow' : 'noindex,nofollow')
    head('meta', 'property', 'og:title').setAttribute('content', m.title)
    head('meta', 'property', 'og:description').setAttribute('content', m.description)
    head('meta', 'property', 'og:url').setAttribute('content', url)
    if (m.index) head('link', 'rel', 'canonical').setAttribute('href', url)
    else document.head.querySelector('link[rel="canonical"]')?.remove()
  }, [pathname])

  return null
}
