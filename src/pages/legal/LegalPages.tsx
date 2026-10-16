import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ColorStrip, PublicPage } from '@/components/shared/PublicChrome'
import { BRAND, LEGAL_ENTITY, LEGAL_PATHS, LEGAL_UPDATED } from '@/data/legal'

/* -------------------------------------------------------------------------- */
/*  Layout                                                                     */
/* -------------------------------------------------------------------------- */

function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <PublicPage>
      <ColorStrip className="h-1" />
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-slate-900">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{intro}</p>
        <p className="mt-2 text-sm text-slate-500">Última actualización: {LEGAL_UPDATED}</p>
        <div className="mt-10 space-y-9">{children}</div>
      </div>
    </PublicPage>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-[15px] leading-relaxed text-slate-700">
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

const List = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 pl-5 marker:text-slate-400">{children}</ul>
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

const PrivacyLink = ({ children = 'Aviso de privacidad' }: { children?: ReactNode }) => (
  <Link to={LEGAL_PATHS.privacidad} className="font-medium text-primary hover:underline">
    {children}
  </Link>
)
const CookiesLink = () => (
  <Link to={LEGAL_PATHS.cookies} className="font-medium text-primary hover:underline">
    Aviso de cookies
  </Link>
)

/** Where disputes go: the courts of the provider's city, without taking away what consumer law grants. */
const JURISDICTION =
  'Se rige por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales competentes de Tijuana, Baja California, salvo lo que la Ley Federal de Protección al Consumidor disponga en favor del consumidor.'

/* -------------------------------------------------------------------------- */
/*  Aviso legal                                                                */
/* -------------------------------------------------------------------------- */

export function AvisoLegalPage() {
  return (
    <LegalLayout
      title="Aviso legal"
      intro={`Quién está detrás de este sitio y de la plataforma ${BRAND}, y las condiciones generales de uso del sitio.`}
    >
      <Section title="Titular del sitio">
        <List>
          <li>
            <strong>Titular:</strong> {LEGAL_ENTITY.holder}, quien opera la marca {BRAND}
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
          {BRAND} es una plataforma web de control de asistencia y reloj checador para empresas. Este sitio permite
          conocer el servicio, crear la cuenta de una empresa e iniciar sesión.
        </p>
      </Section>

      <Section title="Propiedad intelectual">
        <p>
          El software, el diseño, los textos, la marca «{BRAND}» y su logotipo pertenecen a su titular. Queda prohibida
          su reproducción, distribución o modificación sin autorización por escrito, salvo lo que la ley permita
          expresamente. Los datos que cada empresa carga en su cuenta (empleados, asistencia, reportes) siguen siendo de
          esa empresa.
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
          El tratamiento de datos personales se describe en el <PrivacyLink /> y el uso del almacenamiento del navegador
          en el <CookiesLink />.
        </p>
      </Section>

      <Section title="Legislación aplicable">
        <p>{JURISDICTION}</p>
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
      intro={`Cómo se tratan los datos personales de quien crea una cuenta o usa ${BRAND}, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (publicada en el Diario Oficial de la Federación el 20 de marzo de 2025).`}
    >
      <Section title="Responsable">
        <p>
          <strong>{LEGAL_ENTITY.holder}</strong>, quien opera la marca {BRAND}, con domicilio en{' '}
          <Fact value={LEGAL_ENTITY.address} />, es el responsable del tratamiento de los datos personales descritos en
          este aviso. Contacto para privacidad: <Fact value={email()} />.
        </p>
      </Section>

      <Section title="Dos papeles distintos">
        <List>
          <li>
            <strong>Datos de quien abre la cuenta y de los usuarios del panel</strong> (quien administra la empresa):
            aquí somos responsables.
          </li>
          <li>
            <strong>Datos del personal de cada empresa</strong> (empleados, asistencia, fotos, rostro, ubicación): la
            empresa cliente es la responsable y {BRAND} actúa solo como encargado que presta la plataforma, siguiendo
            sus instrucciones. Cada empresa debe dar a su personal su propio aviso de privacidad y, para el rostro,
            contar con su consentimiento expreso y por escrito. Si eres empleado, la empresa donde trabajas es quien
            responde por tus datos.
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
            <strong>Técnicos:</strong> registros de errores de la aplicación (sin correos ni números largos, que se
            ocultan antes de enviarse) y un identificador del dispositivo donde se usa el reloj checador.
          </li>
          <li>
            <strong>Datos que la empresa carga o genera en su cuenta</strong> (como encargados): datos laborales del
            personal, fechas y horas de cada movimiento, la foto tomada al checar, la ubicación al checar y, si el
            reconocimiento facial está activado, una representación numérica del rostro, que es un{' '}
            <strong>dato personal sensible</strong>.
          </li>
        </List>
      </Section>

      <Section title="Rostro, fotos y ubicación">
        <List>
          <li>
            <strong>Rostro (dato sensible).</strong> El reconocimiento se procesa en el propio dispositivo. Solo se
            conserva una representación numérica (1024 valores por muestra), nunca una fotografía para este fin. Requiere
            el consentimiento expreso y por escrito de la persona: lo registra un administrador que cuenta con ese
            consentimiento, o la propia persona desde su celular, después de entrar con su número de empleado y su PIN
            y de aceptar la casilla de consentimiento (solo si todavía no tenía un rostro registrado). Siempre hay
            otros métodos para checar: credencial QR, código de barras o número y PIN.
          </li>
          <li>
            <strong>Foto de cada movimiento.</strong> Al registrar una entrada, comida o salida, en el reloj checador o
            desde el celular, se toma una fotografía vinculada a la persona, la fecha y la hora, para que la empresa
            pueda revisar quién checó. Se conserva <strong>90 días</strong> desde la fecha del movimiento (o el plazo que
            la empresa configure, entre 30 días y 10 años) y después se elimina automáticamente; el registro de
            asistencia permanece.
          </li>
          <li>
            <strong>Ubicación.</strong> Solo con el permiso del navegador y solo para el registro de asistencia. En el
            reloj checador de la empresa se guarda el punto fijo de su sucursal. Desde el celular se usa el GPS del
            teléfono mientras la pantalla para checar está abierta, y con cada movimiento se guardan las coordenadas, su
            precisión y la distancia a la sucursal; según lo que configure la empresa, fuera de la zona permitida el
            movimiento no se registra o queda marcado. No se sigue la ubicación fuera de esos momentos.
          </li>
        </List>
      </Section>

      <Section title="Finalidades">
        <List>
          <li>Crear y administrar la cuenta, y prestar el servicio de control de asistencia.</li>
          <li>Verificar la identidad de quien registra su asistencia y el lugar donde lo hace.</li>
          <li>Seguridad, prevención de fraude y atención de errores o soporte.</li>
          <li>Cumplir obligaciones legales.</li>
        </List>
        <p>
          Todas son necesarias para prestar el servicio. No tratamos datos para finalidades secundarias: no vendemos
          datos personales ni los usamos para publicidad.
        </p>
      </Section>

      <Section title="Correos electrónicos">
        <p>
          Solo enviamos los correos necesarios para la cuenta: confirmar el registro, recuperar la contraseña y avisos
          importantes del servicio. No enviamos publicidad. Si algún día lo hiciéramos, sería con una forma sencilla de
          dejar de recibirla, sin escribir a quien nos haya pedido no hacerlo y respetando el Registro Público para
          Evitar Publicidad de la PROFECO.
        </p>
      </Section>

      <Section title="Proveedores que nos ayudan a prestar el servicio">
        <p>Tratan los datos solo por cuenta nuestra y para lo que se indica:</p>
        <List>
          <li>Supabase (base de datos, autenticación y envío de los correos de la cuenta) y Vercel (alojamiento del sitio).</li>
          <li>
            Google Fonts: al abrir el sitio, tu navegador descarga las tipografías desde los servidores de Google, que
            reciben tu dirección IP como en cualquier descarga web.
          </li>
          <li>
            OpenStreetMap: las imágenes del mapa pequeño que acompaña a cada checada y la búsqueda de direcciones al dar
            de alta una sucursal. Sus servidores reciben tu dirección IP y, al buscar, la dirección escrita.
          </li>
          <li>
            Google, únicamente si la empresa decide conectar Google Drive para guardar sus reportes: se almacena la
            autorización para subir archivos a su Drive, que puede revocar cuando quiera.
          </li>
        </List>
        <p>
          Algunos de estos proveedores pueden almacenar o procesar la información fuera de México. Solo compartimos
          datos con autoridades cuando la ley lo exija.
        </p>
      </Section>

      <Section title="Cómo limitar el uso de tus datos">
        <List>
          <li>Puedes negar o quitar el permiso de ubicación y de cámara desde la configuración de tu navegador.</li>
          <li>
            Si eres empleado, puedes pedir a tu empresa no usar el reconocimiento facial y checar con otro método, o que
            borre tu rostro registrado.
          </li>
          <li>
            Para cualquier otra limitación, escríbenos a <Fact value={email()} />.
          </li>
        </List>
      </Section>

      <Section title="Derechos ARCO y revocación del consentimiento">
        <p>
          Puedes <strong>acceder, rectificar, cancelar u oponerte</strong> al tratamiento de tus datos, y revocar tu
          consentimiento, escribiendo a <Fact value={email()} /> con tu nombre, un medio para responderte, un documento
          que acredite tu identidad y la descripción de lo que solicitas. Te responderemos en un máximo de 20 días y, si
          procede, se hará efectivo dentro de los 15 días siguientes. Si eres empleado de una empresa que usa {BRAND},
          dirige tu solicitud a esa empresa, que es la responsable de tus datos; nosotros la apoyaremos. Si no estás
          conforme con la respuesta, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, autoridad en materia de
          protección de datos personales.
        </p>
      </Section>

      <Section title="Conservación y seguridad">
        <p>
          Conservamos los datos de la cuenta mientras esté activa y el tiempo que exija la ley; las fotos de cada
          movimiento, el plazo indicado arriba. Aplicamos medidas como cifrado en tránsito, aislamiento de los datos de
          cada empresa, acceso por roles, registro de auditoría de los cambios y el procesamiento del rostro en el propio
          dispositivo.
        </p>
      </Section>

      <Section title="Cambios a este aviso">
        <p>
          Publicaremos aquí cualquier cambio, con su fecha. Si el cambio es importante, también lo avisaremos al iniciar
          sesión o por correo. Consulta también el <CookiesLink />.
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
      intro={`Condiciones para usar el servicio ${BRAND}. Al crear una cuenta confirmas que las has leído y aceptas.`}
    >
      <Section title="1. Quién presta el servicio">
        <p>
          El servicio lo presta {LEGAL_ENTITY.holder}, quien opera la marca {BRAND} («el Proveedor»), a la empresa que
          crea la cuenta («el Cliente»). Quien crea la cuenta declara tener facultades para obligar a su empresa.
        </p>
      </Section>

      <Section title="2. Licencia de uso">
        <p>
          El Proveedor concede al Cliente una licencia no exclusiva, intransferible y revocable para usar {BRAND} según
          el plan contratado. No se puede copiar, descompilar, revender, sublicenciar ni eludir los mecanismos de
          licencia. El código, el diseño y la marca son del Proveedor.
        </p>
      </Section>

      <Section title="3. Cuenta y seguridad">
        <p>
          El Cliente es responsable de la confidencialidad de sus credenciales, de los usuarios que dé de alta, de los
          PIN de su personal y de lo que se haga con su cuenta. Debe avisar de inmediato ante un uso no autorizado.
        </p>
      </Section>

      <Section title="4. Datos del Cliente y privacidad">
        <List>
          <li>Los datos que el Cliente carga le pertenecen. El Proveedor los trata solo para prestar el servicio.</li>
          <li>
            El Cliente es el responsable del tratamiento de los datos de su personal: debe darle su propio aviso de
            privacidad, contar con el consentimiento expreso y por escrito de cada persona antes de registrar su rostro
            (o activar que cada quien lo registre desde su celular) y ofrecer métodos alternos de registro.
          </li>
          <li>
            El Cliente usará la ubicación solo para verificar dónde se registró la asistencia y respetará la privacidad de
            quien trabaja a distancia, conforme a la Ley Federal del Trabajo.
          </li>
          <li>
            Más detalle en el <PrivacyLink />.
          </li>
        </List>
      </Section>

      <Section title="5. Registro de la jornada">
        <p>
          {BRAND} registra la hora de entrada, comida y salida de cada persona y permite exportarla. La Ley Federal del
          Trabajo obliga a los patrones a llevar un registro electrónico de la jornada conforme a las disposiciones que
          emita la Secretaría del Trabajo y Previsión Social. {BRAND} es una herramienta para llevarlo; corresponde al
          Cliente verificar que su configuración y su uso cumplan esas disposiciones.
        </p>
      </Section>

      <Section title="6. Precio, vigencia y suspensión">
        <p>
          Las condiciones comerciales (precio, periodicidad, facturación y vigencia) se acuerdan con cada Cliente por
          escrito. El Proveedor puede suspender o cancelar el servicio por falta de pago, uso no autorizado o
          incumplimiento de estos términos.
        </p>
      </Section>

      <Section title="7. Disponibilidad y alcance">
        <p>
          El Proveedor procura la continuidad del servicio, pero no garantiza disponibilidad ininterrumpida ni ausencia
          de errores. El reconocimiento facial y la ubicación son ayudas de verificación y no son infalibles; el Cliente
          debe mantener métodos alternos. El cálculo de nómina, el cumplimiento de la Ley Federal del Trabajo y las
          decisiones laborales son responsabilidad del Cliente.
        </p>
      </Section>

      <Section title="8. Responsabilidad">
        <p>
          En la medida que la ley lo permita, la responsabilidad total del Proveedor se limita al monto pagado por el
          Cliente en los 12 meses previos al hecho que la origine. No se limita lo que la ley no permita limitar.
        </p>
      </Section>

      <Section title="9. Terminación">
        <p>
          Cualquiera de las partes puede terminar el servicio avisando por escrito. Al terminar, el Cliente puede
          exportar sus datos durante un plazo razonable; después podrán eliminarse.
        </p>
      </Section>

      <Section title="10. Cambios y ley aplicable">
        <p>
          Podemos actualizar estos términos; la versión vigente y su fecha estarán siempre en esta página. {JURISDICTION}{' '}
          Contacto: <Fact value={email()} />.
        </p>
      </Section>
    </LegalLayout>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cookies                                                                    */
/* -------------------------------------------------------------------------- */

const STORAGE_ITEMS: { name: string; purpose: string; duration: string }[] = [
  { name: 'Sesión (sb-…-auth-token)', purpose: 'Mantiene tu sesión iniciada en el panel.', duration: 'Hasta cerrar sesión' },
  { name: 'nexotime.portal.session / .device', purpose: 'Mantiene la sesión del portal del empleado en su celular.', duration: '12 horas / persistente' },
  { name: 'nexotime.ui / nexotime.voice.*', purpose: 'Recuerda tu tema (claro u oscuro), el menú y si las indicaciones habladas están activas.', duration: 'Persistente' },
  { name: 'nexotime.device / .license / .deviceUse', purpose: 'Identifica el equipo del reloj checador, su licencia y si este equipo es reloj o panel.', duration: 'Persistente' },
  { name: 'nexotime.clockBranch / .kiosk.light / .cameraRotation', purpose: 'Sucursal, luz de pantalla y orientación de la cámara de este reloj checador.', duration: 'Persistente' },
  { name: 'nexotime.panelUnlockedAt', purpose: 'Abre el panel 15 minutos después de escribir el código de salida del reloj.', duration: 'Hasta cerrar el navegador' },
  { name: 'nexotime.liveSnapshot / .currentUser', purpose: 'Copia local de los datos de tu empresa para que el reloj funcione sin Internet.', duration: 'Hasta cerrar sesión' },
  { name: 'nexotime.syncQueue / .syncRejected', purpose: 'Checadas hechas sin Internet que esperan enviarse, y las que el servidor rechazó.', duration: 'Hasta sincronizar' },
  { name: 'nexotime.attendancePhotos (base local)', purpose: 'Fotos de las checadas hechas en este equipo mientras se envían al servidor.', duration: 'Hasta sincronizar' },
  { name: 'nexotime.errorQueue / .lastError', purpose: 'Errores de la aplicación pendientes de reportar (sin datos personales).', duration: 'Hasta enviarse' },
  { name: 'nexotime.cookies', purpose: 'Recuerda que viste este aviso.', duration: 'Persistente' },
  { name: 'Caché de la aplicación', purpose: 'Permite abrir el reloj checador sin conexión y cargar más rápido (incluye el reconocimiento facial).', duration: 'Hasta la siguiente versión' },
]

export function CookiesPage() {
  return (
    <LegalLayout
      title="Aviso de cookies"
      intro={`${BRAND} solo usa almacenamiento técnico del navegador, necesario para que la plataforma funcione. No usamos cookies de publicidad, de analítica ni de seguimiento.`}
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

      <Section title="Servicios externos que carga el sitio">
        <p>
          Las tipografías (Google Fonts) y las imágenes del mapa (OpenStreetMap) se descargan de sus servidores, que
          reciben tu dirección IP como en cualquier descarga web. No colocan cookies de publicidad en este sitio.
        </p>
      </Section>

      <Section title="Cómo borrarlos">
        <p>
          Puedes eliminarlos desde la configuración de tu navegador (borrar datos del sitio). Si lo haces, se cerrará tu
          sesión, el equipo del reloj tendrá que volver a activarse y se perderán las checadas que no se hayan enviado.
        </p>
      </Section>

      <Section title="Si esto cambia">
        <p>
          Si algún día incorporamos analítica u otras cookies no esenciales, pediremos tu consentimiento antes de
          activarlas y actualizaremos esta página. Más información en el <PrivacyLink />.
        </p>
      </Section>
    </LegalLayout>
  )
}
