import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { NexotimeLogo } from '@/components/shared/Logo'
import { LegalLinks } from '@/components/shared/LegalLinks'
import { COPYRIGHT_HOLDER, LEGAL_ENTITY, LEGAL_PATHS, LEGAL_UPDATED, copyrightLine } from '@/data/legal'

/* -------------------------------------------------------------------------- */
/*  Layout                                                                     */
/* -------------------------------------------------------------------------- */

function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/bienvenida" aria-label="Nexotime, ir al inicio">
            <NexotimeLogo tone="dark" />
          </Link>
          <Link
            to="/bienvenida"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{intro}</p>
        <p className="mt-2 text-sm text-muted-foreground">Última actualización: {LEGAL_UPDATED}</p>
        <div className="mt-10 space-y-9">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <LegalLinks className="text-muted-foreground hover:text-foreground" />
          <p>{copyrightLine()}</p>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  )
}

const List = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>
)

/** A required fact that has not been filled in yet is shown as such, never invented. */
function Fact({ value }: { value: string | null }) {
  return value ? (
    <>{value}</>
  ) : (
    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
      pendiente de completar
    </span>
  )
}

const email = () => LEGAL_ENTITY.email

/* -------------------------------------------------------------------------- */
/*  Aviso legal                                                                */
/* -------------------------------------------------------------------------- */

export function AvisoLegalPage() {
  return (
    <LegalLayout
      title="Aviso legal"
      intro="Información sobre quién es el titular de este sitio y de la plataforma NEXOTIME, y las condiciones generales de uso del sitio."
    >
      <Section title="Titular del sitio">
        <List>
          <li>
            <strong>Titular:</strong> {LEGAL_ENTITY.holder}
          </li>
          <li>
            <strong>RFC:</strong> <Fact value={LEGAL_ENTITY.rfc} />
          </li>
          <li>
            <strong>Domicilio:</strong> <Fact value={LEGAL_ENTITY.address} />
          </li>
          <li>
            <strong>Correo de contacto:</strong> <Fact value={email()} />
          </li>
          {LEGAL_ENTITY.phone ? (
            <li>
              <strong>Teléfono:</strong> {LEGAL_ENTITY.phone}
            </li>
          ) : null}
        </List>
      </Section>

      <Section title="Objeto">
        <p>
          NEXOTIME es una plataforma web de control de asistencia y reloj checador para empresas. Este sitio
          permite conocer el servicio, crear la cuenta de una empresa e iniciar sesión.
        </p>
      </Section>

      <Section title="Propiedad intelectual">
        <p>
          El software, el diseño, los textos, la marca «NEXOTIME» y su logotipo son propiedad de {COPYRIGHT_HOLDER}.
          Queda prohibida su reproducción, distribución o modificación sin autorización por escrito, salvo lo que la ley
          permita expresamente. Los datos que cada empresa carga en su cuenta (empleados, asistencia, reportes) siguen
          siendo de esa empresa.
        </p>
      </Section>

      <Section title="Uso del sitio">
        <p>
          El usuario se compromete a usar el sitio y la plataforma conforme a la ley y a estas condiciones: no intentar
          acceder a cuentas ajenas, no vulnerar ni sobrecargar la plataforma, no usarla para fines ilícitos y no
          registrar la asistencia de otra persona en su nombre.
        </p>
      </Section>

      <Section title="Responsabilidad">
        <p>
          Se procura que el sitio y la plataforma estén disponibles y sin errores, pero no se garantiza el servicio
          ininterrumpido. El cálculo de nómina y las decisiones laborales son responsabilidad de cada empresa. El
          detalle de la relación con las empresas clientes está en los{' '}
          <Link to={LEGAL_PATHS.terminos} className="font-medium text-primary hover:underline">
            Términos y condiciones
          </Link>
          .
        </p>
      </Section>

      <Section title="Datos personales y cookies">
        <p>
          El tratamiento de datos personales se describe en el{' '}
          <Link to={LEGAL_PATHS.privacidad} className="font-medium text-primary hover:underline">
            Aviso de privacidad
          </Link>{' '}
          y el uso del almacenamiento del navegador en el{' '}
          <Link to={LEGAL_PATHS.cookies} className="font-medium text-primary hover:underline">
            Aviso de cookies
          </Link>
          .
        </p>
      </Section>

      <Section title="Legislación aplicable">
        <p>
          Este aviso se rige por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia serán competentes
          los tribunales que correspondan conforme a la ley.
        </p>
      </Section>
    </LegalLayout>
  )
}

/* -------------------------------------------------------------------------- */
/*  Aviso de privacidad                                                        */
/* -------------------------------------------------------------------------- */

export function PrivacidadPage() {
  return (
    <LegalLayout
      title="Aviso de privacidad"
      intro="Cómo se tratan los datos personales de quien crea una cuenta o usa NEXOTIME, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares."
    >
      <Section title="Responsable">
        <p>
          <strong>{LEGAL_ENTITY.holder}</strong>, con domicilio en <Fact value={LEGAL_ENTITY.address} />, es el
          responsable del tratamiento de los datos personales descritos en este aviso. Contacto para privacidad:{' '}
          <Fact value={email()} />.
        </p>
      </Section>

      <Section title="Dos papeles distintos">
        <List>
          <li>
            <strong>Datos de quien abre la cuenta</strong> (la persona que administra la empresa): aquí somos
            responsables.
          </li>
          <li>
            <strong>Datos del personal de cada empresa</strong> (empleados, asistencia, rostro, ubicación): la empresa
            cliente es la responsable y NEXOTIME actúa solo como encargado que presta la plataforma, siguiendo sus
            instrucciones. Cada empresa debe dar a su personal su propio aviso de privacidad y, para el rostro, pedir su
            consentimiento expreso.
          </li>
        </List>
      </Section>

      <Section title="Datos que recabamos">
        <List>
          <li>
            <strong>Cuenta:</strong> nombre, correo electrónico, nombre de la empresa y contraseña. La contraseña se
            guarda cifrada por el proveedor de autenticación; nosotros no podemos verla.
          </li>
          <li>
            <strong>Técnicos:</strong> registros de errores de la aplicación y un identificador del dispositivo donde se
            usa el reloj checador.
          </li>
          <li>
            <strong>Datos que la empresa carga en su cuenta</strong> (como encargados): datos laborales del personal,
            fechas y horas de asistencia, ubicación al registrar y, si el reconocimiento facial está activado, una
            representación numérica del rostro.
          </li>
        </List>
      </Section>

      <Section title="Rostro, foto de verificación y ubicación">
        <List>
          <li>
            El reconocimiento facial se procesa <strong>en el propio dispositivo</strong>. Solo se conserva una
            representación numérica (un conjunto de 128 valores) para identificar el rostro; la evidencia de entrada descrita abajo se guarda por separado.
          </li>
          <li>
            Al registrar una entrada por número de empleado o PIN, se toma y conserva una fotografía de evidencia
            vinculada al empleado, fecha y hora. Se guarda en el dispositivo mientras se sincroniza y en el servidor
            de la empresa para consulta con los permisos de asistencia. La foto permite revisar quién checó;
            no demuestra por sí sola la identidad. Las vistas previas de otros métodos siguen siendo temporales.
          </li>
          <li>
            La ubicación se toma con el permiso del navegador, solo al registrar la asistencia, para validar la
            sucursal.
          </li>
        </List>
      </Section>

      <Section title="Finalidades">
        <List>
          <li>Crear y administrar la cuenta, y prestar el servicio de control de asistencia.</li>
          <li>Verificar la identidad de quien registra su asistencia.</li>
          <li>Seguridad, prevención de fraude y atención de errores o soporte.</li>
          <li>Cumplir obligaciones legales.</li>
        </List>
        <p>No vendemos datos personales ni los usamos para publicidad.</p>
      </Section>

      <Section title="Con quién se comparten">
        <p>Solo con proveedores que hacen posible el servicio, por cuenta nuestra:</p>
        <List>
          <li>Supabase (base de datos y autenticación) y Vercel (alojamiento del sitio).</li>
          <li>
            Google Fonts: al abrir el sitio, tu navegador descarga las tipografías desde los servidores de Google, que
            reciben tu dirección IP como en cualquier descarga web.
          </li>
          <li>
            Google, únicamente si la empresa decide conectar Google Drive para guardar sus reportes: se almacena la
            autorización para subir archivos a su Drive, que puede revocar cuando quiera.
          </li>
          <li>Autoridades, cuando la ley lo exija.</li>
        </List>
      </Section>

      <Section title="Derechos ARCO y revocación">
        <p>
          Puedes <strong>acceder, rectificar, cancelar u oponerte</strong> al tratamiento de tus datos, y revocar tu
          consentimiento, escribiendo a <Fact value={email()} /> con tu nombre, el medio para responderte y la
          descripción de lo que solicitas. Responderemos en un máximo de 20 días hábiles. Si eres empleado de una
          empresa que usa NEXOTIME, dirige tu solicitud primero a esa empresa, que es la responsable de tus datos.
        </p>
      </Section>

      <Section title="Conservación y seguridad">
        <p>
          Conservamos los datos mientras la cuenta esté activa y el tiempo que exija la ley. Aplicamos medidas como
          cifrado en tránsito, aislamiento de los datos de cada empresa, acceso por roles y registro de auditoría.
        </p>
      </Section>

      <Section title="Cambios a este aviso">
        <p>
          Publicaremos aquí cualquier cambio, con su fecha. Consulta también el{' '}
          <Link to={LEGAL_PATHS.cookies} className="font-medium text-primary hover:underline">
            Aviso de cookies
          </Link>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}

/* -------------------------------------------------------------------------- */
/*  Términos y condiciones                                                     */
/* -------------------------------------------------------------------------- */

export function TerminosPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      intro="Condiciones para usar el servicio NEXOTIME. Al crear una cuenta confirmas que las has leído y aceptas."
    >
      <Section title="1. Quién presta el servicio">
        <p>
          El servicio lo presta {LEGAL_ENTITY.holder} («el Proveedor») a la empresa que crea la cuenta («el Cliente»).
          Quien crea la cuenta declara tener facultades para obligar a su empresa.
        </p>
      </Section>

      <Section title="2. Licencia de uso">
        <p>
          El Proveedor concede al Cliente una licencia no exclusiva, intransferible y revocable para usar NEXOTIME según
          el plan contratado. No se puede copiar, descompilar, revender, sublicenciar ni eludir los mecanismos de
          licencia. El código, el diseño y la marca son del Proveedor.
        </p>
      </Section>

      <Section title="3. Cuenta y seguridad">
        <p>
          El Cliente es responsable de la confidencialidad de sus credenciales, de los usuarios que dé de alta y de lo
          que se haga con su cuenta. Debe avisar de inmediato ante un uso no autorizado.
        </p>
      </Section>

      <Section title="4. Datos del Cliente y privacidad">
        <List>
          <li>Los datos que el Cliente carga le pertenecen. El Proveedor los trata solo para prestar el servicio.</li>
          <li>
            El Cliente es el responsable del tratamiento de los datos de su personal: debe contar con su propio aviso de
            privacidad y con el consentimiento expreso de cada empleado antes de registrar su rostro, y ofrecer
            métodos alternos de registro.
          </li>
          <li>
            Más detalle en el{' '}
            <Link to={LEGAL_PATHS.privacidad} className="font-medium text-primary hover:underline">
              Aviso de privacidad
            </Link>
            .
          </li>
        </List>
      </Section>

      <Section title="5. Precio, vigencia y suspensión">
        <p>
          Las condiciones comerciales (precio, periodicidad, facturación y vigencia) se acuerdan con cada Cliente por
          escrito. El Proveedor puede suspender o cancelar el servicio por falta de pago, uso no autorizado o
          incumplimiento de estos términos.
        </p>
      </Section>

      <Section title="6. Disponibilidad y alcance">
        <p>
          El Proveedor procura la continuidad del servicio, pero no garantiza disponibilidad ininterrumpida ni ausencia
          de errores. El reconocimiento facial es una ayuda de identificación y no es infalible; el Cliente debe
          mantener métodos alternos. NEXOTIME es una herramienta de apoyo: el cálculo de nómina, el cumplimiento de la
          Ley Federal del Trabajo y las decisiones laborales son responsabilidad del Cliente.
        </p>
      </Section>

      <Section title="7. Responsabilidad">
        <p>
          En la medida que la ley lo permita, la responsabilidad total del Proveedor se limita al monto pagado por el
          Cliente en los 12 meses previos al hecho que la origine. No se limita lo que la ley no permita limitar.
        </p>
      </Section>

      <Section title="8. Terminación">
        <p>
          Cualquiera de las partes puede terminar el servicio avisando por escrito. Al terminar, el Cliente puede
          exportar sus datos durante un plazo razonable; después podrán eliminarse.
        </p>
      </Section>

      <Section title="9. Cambios y ley aplicable">
        <p>
          Podemos actualizar estos términos; la versión vigente y su fecha estarán siempre en esta página. Se rigen por
          las leyes de los Estados Unidos Mexicanos. Contacto: <Fact value={email()} />.
        </p>
      </Section>
    </LegalLayout>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cookies                                                                    */
/* -------------------------------------------------------------------------- */

const STORAGE_ITEMS: { name: string; purpose: string; duration: string }[] = [
  { name: 'Sesión (sb-…-auth-token)', purpose: 'Mantiene tu sesión iniciada.', duration: 'Hasta cerrar sesión' },
  { name: 'nexotime.ui', purpose: 'Recuerda tu tema (claro u oscuro).', duration: 'Persistente' },
  { name: 'nexotime.device / nexotime.license', purpose: 'Identifica el dispositivo del reloj checador y su licencia.', duration: 'Persistente' },
  { name: 'nexotime.liveSnapshot / nexotime.syncQueue', purpose: 'Copia local de tus datos y cola de registros para que el reloj funcione sin Internet.', duration: 'Hasta sincronizar' },
  { name: 'nexotime.cookies', purpose: 'Recuerda que viste este aviso.', duration: 'Persistente' },
  { name: 'Caché de la aplicación', purpose: 'Permite abrir el reloj checador sin conexión y cargar más rápido.', duration: 'Hasta la siguiente versión' },
]

export function CookiesPage() {
  return (
    <LegalLayout
      title="Aviso de cookies"
      intro="NEXOTIME solo usa almacenamiento técnico del navegador, necesario para que la plataforma funcione. No usamos cookies de publicidad ni de seguimiento."
    >
      <Section title="Qué guardamos en tu navegador">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Elemento</th>
                <th className="px-4 py-2.5 font-medium">Para qué sirve</th>
                <th className="px-4 py-2.5 font-medium">Duración</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {STORAGE_ITEMS.map((i) => (
                <tr key={i.name}>
                  <td className="px-4 py-2.5 align-top font-mono text-[12px]">{i.name}</td>
                  <td className="px-4 py-2.5 align-top">{i.purpose}</td>
                  <td className="px-4 py-2.5 align-top text-muted-foreground">{i.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Son elementos estrictamente necesarios, por lo que no requieren tu consentimiento previo. No se comparten con
          terceros con fines publicitarios.
        </p>
      </Section>

      <Section title="Cómo borrarlos">
        <p>
          Puedes eliminarlos desde la configuración de tu navegador (borrar datos del sitio). Si lo haces, se cerrará
          tu sesión y el dispositivo del reloj tendrá que volver a activarse.
        </p>
      </Section>

      <Section title="Si esto cambia">
        <p>
          Si algún día incorporamos analítica u otras cookies no esenciales, pediremos tu consentimiento antes de
          activarlas y actualizaremos esta página. Más información en el{' '}
          <Link to={LEGAL_PATHS.privacidad} className="font-medium text-primary hover:underline">
            Aviso de privacidad
          </Link>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}
