import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  History,
  ImageOff,
  MonitorSmartphone,
  Plane,
  Smartphone,
  UserCog,
  WifiOff,
} from 'lucide-react'
import { NexotimeMark } from '@/components/shared/Logo'
import { LegalLinks } from '@/components/shared/LegalLinks'
import {
  BrowserFrame,
  FaceScanScreen,
  KioskSuccessScreen,
  PanelLogScreen,
  PhoneFrame,
  PhonePortalScreen,
  Scaled,
  TabletFrame,
} from '@/components/welcome/ProductIllustrations'
import { useLiveClock } from '@/hooks/useLiveClock'
import { LEGAL_ENTITY, copyrightLine } from '@/data/legal'
import { PAYMENT_STEPS, PLANS, TRIAL_DAYS } from '@/data/pricing'
import { PUNCH_STYLE } from '@/lib/punchStyle'
import { currency, cn } from '@/lib/utils'
import type { PunchType } from '@/types'

/** The three ways into the product: one per kind of person (or equipment). */
const PORTALS = [
  {
    to: '/login',
    icon: UserCog,
    label: 'Administrador',
    text: 'Empleados, asistencia, vacaciones y reportes de tu empresa.',
    cta: 'Entrar al panel',
  },
  {
    to: '/activar?modo=empleado',
    icon: Smartphone,
    label: 'Empleado',
    text: 'Registra tu entrada y salida desde tu celular y pide vacaciones.',
    cta: 'Entrar con mi PIN',
  },
  {
    to: '/activar?modo=reloj',
    icon: MonitorSmartphone,
    label: 'Reloj checador',
    text: 'Convierte una tablet de la entrada en el reloj donde todos checan.',
    cta: 'Activar este equipo',
  },
] as const

/** A real workday, the thread of the page: every movement with its own colour. */
const DAY: Array<{ type: PunchType; time: string }> = [
  { type: 'entry', time: '8:57 a.m.' },
  { type: 'lunch_out', time: '2:02 p.m.' },
  { type: 'lunch_in', time: '3:01 p.m.' },
  { type: 'exit', time: '6:05 p.m.' },
]

const MORE = [
  {
    icon: Plane,
    title: 'Vacaciones e incidencias',
    text: 'El empleado pide sus días desde el celular y tú los apruebas. Los días que marca la ley se calculan solos.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Reportes para tu nómina',
    text: 'Horas trabajadas, retardos, faltas y horas extra por persona, listos para Excel o CSV.',
  },
  {
    icon: History,
    title: 'Cada cambio queda registrado',
    text: 'Si alguien corrige una checada, queda quién lo hizo, cuándo y por qué.',
  },
  {
    icon: WifiOff,
    title: 'Sigue funcionando sin Internet',
    text: 'El reloj checador reconoce y guarda las checadas en el equipo, y las envía cuando vuelve la conexión.',
  },
  {
    icon: ImageOff,
    title: 'Fotos que no se acumulan',
    text: 'La foto de cada checada se guarda como evidencia y se borra sola a los 90 días.',
  },
]

const STEPS = [
  { title: 'Crea la cuenta de tu empresa', text: 'Datos básicos, sucursales y jornada. Toma unos minutos.' },
  { title: 'Da de alta a tu equipo', text: 'Uno por uno o desde Excel, con su horario y su PIN.' },
  { title: 'Elige cómo van a checar', text: 'Una tablet en la entrada, el celular de cada quien, o ambos.' },
  { title: 'Revisa y exporta', text: 'La asistencia del día, las vacaciones por aprobar y tus reportes.' },
]

/** The steps borrow the day's colours, in order: entrada, comida, regreso, salida. */
const STEP_COLORS = ['#059669', '#f59e0b', '#0284c7', '#e11d48']

const FAQ = [
  {
    q: '¿Tengo que instalar algo?',
    a: 'No. NEXOTIME se abre en el navegador de cualquier tablet o celular. Solo necesitas una cámara si vas a usar rostro, QR o foto.',
  },
  {
    q: '¿Qué pasa si se va el Internet?',
    a: 'El reloj checador sigue funcionando: reconoce rostros y guarda las checadas en el equipo, y las envía solo cuando vuelve la conexión.',
  },
  {
    q: '¿Mis empleados pueden checar desde su casa?',
    a: 'No. Desde el celular solo se puede checar con el GPS real del teléfono y cerca de su sucursal. A quien trabaja fuera (home office, ventas, choferes) le das permiso de checar desde cualquier lugar.',
  },
  {
    q: '¿Guardan fotos del rostro?',
    a: 'Del reconocimiento facial solo se guardan medidas numéricas, no fotografías. La foto de cada checada sí se guarda como evidencia para tu empresa y se borra sola a los 90 días.',
  },
]

function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <NexotimeMark className="h-8 w-8" />
      <span
        className={cn(
          'text-[19px] font-bold leading-none tracking-[-0.03em] text-slate-900',
          // On a narrow phone the header keeps only the mark, so both buttons fit beside it.
          compact && 'hidden min-[420px]:inline',
        )}
      >
        Nexotime
      </span>
    </span>
  )
}

function PrimaryLink({ to, children, size = 'md' }: { to: string; children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300',
        size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-9 px-3 text-[13px] sm:px-4 sm:text-sm',
      )}
    >
      {children}
    </Link>
  )
}

function SecondaryLink({ to, children, size = 'md' }: { to: string; children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200',
        size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-9 px-3 text-[13px] sm:px-4 sm:text-sm',
      )}
    >
      {children}
    </Link>
  )
}

function FeatureRow({
  title,
  text,
  points,
  picture,
  flip,
}: {
  title: string
  text: string
  points: string[]
  picture: ReactNode
  flip?: boolean
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(flip && 'lg:order-2')}>
        <h3 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-slate-900">{title}</h3>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate-600">{text}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[15px] text-slate-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={cn('flex justify-center', flip && 'lg:order-1')}>{picture}</div>
    </div>
  )
}

/**
 * Página pública (quien la abre no ha iniciado sesión): qué es NEXOTIME, cómo se ve, cómo se entra y
 * cómo se paga. Siempre en claro, con sus propios colores (no los del tema guardado): es la primera
 * impresión del producto y no debe verse distinta según el navegador de quien la abra. El hilo visual
 * son los cuatro colores de los movimientos del día, los mismos del producto.
 */
export function WelcomePage() {
  const now = useLiveClock()
  const reduce = useReducedMotion()
  const contact = LEGAL_ENTITY.email ?? LEGAL_ENTITY.phone
  const hours = now.getHours()
  const kioskTime = `${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'a.m.' : 'p.m.'}`
  // One orchestrated entrance (the hero scene), nothing else animates on its own.
  const enter = (delay: number, y = 18) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
        }

  return (
    <div className="min-h-dvh overflow-x-clip bg-white font-sans text-slate-900 antialiased">
      {/* --- Barra superior ---------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-8">
          <Link to="/bienvenida" aria-label="NEXOTIME, inicio" className="rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">
            <Wordmark compact />
          </Link>
          <nav aria-label="Accesos" className="order-3 flex w-full items-center justify-between gap-0.5 md:order-none md:w-auto md:justify-center md:gap-1">
            {PORTALS.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:px-3 sm:text-[13px]"
              >
                <p.icon className="h-4 w-4" />
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <SecondaryLink to="/login">Iniciar sesión</SecondaryLink>
            <PrimaryLink to="/signup">Crear cuenta</PrimaryLink>
          </div>
        </div>
      </header>

      {/* --- Presentación ------------------------------------------------------ */}
      <section className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_60%_at_75%_30%,#f1f5f9_0%,rgba(255,255,255,0)_70%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:pb-24 lg:pt-20">
          <div>
            <motion.h1
              {...enter(0, 12)}
              className="font-display text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-slate-900 sm:text-[3rem] xl:text-[3.5rem]"
            >
              La asistencia de tu equipo, registrada en la entrada y en cada celular.
            </motion.h1>
            <motion.p {...enter(0.08, 12)} className="mt-6 max-w-lg text-[17px] leading-relaxed text-slate-600">
              NEXOTIME es el reloj checador digital de tu empresa. Tu personal checa entrada, comida y salida con su
              rostro, su credencial o su celular, y tú ves quién llegó, a qué hora y desde dónde.
            </motion.p>
            <motion.div {...enter(0.14, 12)} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink to="/signup" size="lg">
                Probar {TRIAL_DAYS} días gratis
                <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <SecondaryLink to="/login" size="lg">
                Ya tengo cuenta
              </SecondaryLink>
            </motion.div>
            <motion.ul {...enter(0.2, 8)} className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {['Sin instalar nada', 'Sin tarjeta para probar', 'Funciona sin Internet'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                  {t}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* The product, as it looks the moment someone clocks in. */}
          <div className="relative mx-auto w-full max-w-[580px] pb-8 pr-[22%]">
            <motion.div {...enter(0.1, 24)}>
              <Scaled width={480} height={400}>
                <TabletFrame label="Tablet del reloj checador: entrada registrada con foto y mapa" className="h-full w-full">
                  <KioskSuccessScreen time={kioskTime} />
                </TabletFrame>
              </Scaled>
            </motion.div>
            <motion.div {...enter(0.35, 36)} className="absolute bottom-0 right-0 w-[34%]">
              <Scaled width={220} height={452}>
                <PhoneFrame label="Celular del empleado: dentro de la zona de su sucursal" className="h-full w-full">
                  <PhonePortalScreen zone="inside" />
                </PhoneFrame>
              </Scaled>
            </motion.div>
          </div>
        </div>
      </section>

      {/* --- Un día de trabajo ------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-slate-50/70">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-14">
            <div className="lg:w-64 lg:shrink-0">
              <p className="font-display text-xl font-semibold tracking-[-0.02em] text-slate-900">Así queda el día de María</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">Cada movimiento con su hora, su foto y el lugar donde checó.</p>
            </div>
            <ol className="relative grid flex-1 grid-cols-2 gap-y-6 sm:grid-cols-4">
              <span className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-0.5 bg-gradient-to-r from-emerald-400 via-amber-300 via-sky-400 to-rose-400 sm:block" aria-hidden />
              {DAY.map((d, i) => {
                const s = PUNCH_STYLE[d.type]
                return (
                  <motion.li
                    key={d.type}
                    {...(reduce
                      ? {}
                      : {
                          initial: { opacity: 0, scale: 0.85 },
                          whileInView: { opacity: 1, scale: 1 },
                          viewport: { once: true, margin: '-40px' },
                          transition: { delay: i * 0.12, duration: 0.35 },
                        })}
                    className="relative flex flex-col items-center text-center"
                  >
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-white', s.solid)}>
                      <s.Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="mt-2.5 text-[15px] font-semibold tabular-nums text-slate-900">{d.time}</span>
                    <span className="text-[13px] text-slate-500">{s.label}</span>
                  </motion.li>
                )
              })}
            </ol>
            <div className="rounded-2xl bg-white px-5 py-4 text-center ring-1 ring-slate-200 lg:shrink-0">
              <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-slate-900">8 h 09 min</p>
              <p className="text-[13px] text-slate-500">trabajadas, sin contar la comida</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- Dónde se checa ------------------------------------------------------ */}
      <section id="para-que-sirve" className="mx-auto max-w-6xl scroll-mt-24 space-y-24 px-5 py-24 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[2.2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-900">
            Un solo sistema para la entrada, la calle y la oficina
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-slate-600">
            Todo lo que antes llevabas en libretas y hojas de cálculo, con evidencia de cada registro.
          </p>
        </div>

        <FeatureRow
          title="En la entrada, una tablet"
          text="Tus empleados checan con su rostro, su credencial QR o de código de barras, o con su número y PIN. Nadie puede checar por otro."
          points={[
            'Reconoce el rostro en segundos, aunque cambie la luz',
            'Con PIN toma una foto que tú puedes revisar',
            'Sigue funcionando si se va el Internet',
          ]}
          picture={
            <Scaled width={540} height={340} className="w-full max-w-[540px]">
              <TabletFrame label="Reconocimiento facial en el reloj checador" className="h-full w-full">
                <FaceScanScreen />
              </TabletFrame>
            </Scaled>
          }
        />

        <FeatureRow
          flip
          title="En la calle, su propio celular"
          text="Para quien trabaja en otra sede o en ruta. Se checa con el GPS real del teléfono y solo cerca de su sucursal: desde su casa no se puede."
          points={[
            'Foto en cada movimiento, tomada en ese momento',
            'Zona permitida alrededor de cada sucursal',
            'Permiso para checar en cualquier lugar a quien lo necesite',
          ]}
          picture={
            <Scaled width={220} height={452} className="w-[240px]">
              <PhoneFrame label="Celular del empleado fuera de la zona: no puede checar" className="h-full w-full">
                <PhonePortalScreen zone="outside" />
              </PhoneFrame>
            </Scaled>
          }
        />

        <FeatureRow
          title="En la oficina, todo a la vista"
          text="Ves quién llegó, a qué hora, con su foto y desde dónde checó. Retardos, faltas y horas extra se calculan solos."
          points={[
            'Entradas, comidas y salidas, cada una con su color',
            'Las checadas fuera de zona se marcan en rojo',
            'Corrige un día completo y queda registrado quién lo hizo',
          ]}
          picture={
            <Scaled width={540} height={302} className="w-full max-w-[560px]">
              <BrowserFrame label="Registro de checadas del administrador" className="h-full w-full">
                <PanelLogScreen />
              </BrowserFrame>
            </Scaled>
          }
        />
      </section>

      {/* --- Además -------------------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-slate-50/70">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="font-display text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-900">
              Y lo demás que necesita Recursos Humanos
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-slate-600">
              Desde la solicitud de vacaciones hasta el reporte que le pasas a tu nómina.
            </p>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {MORE.map((m) => (
              <li key={m.title} className="flex gap-4 py-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200">
                  <m.icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-slate-900">{m.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{m.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --- Cómo empiezas -------------------------------------------------------- */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8">
        <h2 className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-slate-900">Listo el mismo día</h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative border-t-2 pt-5" style={{ borderColor: STEP_COLORS[i] }}>
              <span className="font-display text-5xl font-semibold tabular-nums leading-none" style={{ color: STEP_COLORS[i] }}>
                {i + 1}
              </span>
              <p className="mt-4 text-[15px] font-semibold text-slate-900">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Planes y pago ------------------------------------------------------- */}
      <section id="planes" className="scroll-mt-24 border-y border-slate-200 bg-slate-50/70">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-slate-900">Empieza gratis {TRIAL_DAYS} días</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Usa el sistema completo durante la prueba. Después eliges el plan que te conviene y lo cambias cuando crezcas.
            </p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={cn(
                  'relative flex flex-col rounded-2xl bg-white p-7',
                  plan.highlight ? 'shadow-xl shadow-slate-900/10 ring-2 ring-slate-900' : 'ring-1 ring-slate-200',
                )}
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">
                    Recomendado
                  </span>
                ) : null}
                <h3 className="font-display text-xl font-semibold text-slate-900">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{plan.tagline}</p>
                <p className="mt-5">
                  {plan.monthlyPrice != null ? (
                    <>
                      <span className="font-display text-3xl font-semibold tabular-nums">{currency(plan.monthlyPrice)}</span>
                      <span className="text-sm text-slate-500"> al mes + IVA</span>
                    </>
                  ) : (
                    <span className="text-[15px] font-semibold text-slate-900">Solicita tu cotización</span>
                  )}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 border-t border-slate-100 pt-6 text-sm text-slate-700">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 [&>a]:w-full">
                  {plan.highlight ? (
                    <PrimaryLink to="/signup" size="lg">
                      Empezar la prueba gratis
                    </PrimaryLink>
                  ) : (
                    <SecondaryLink to="/signup" size="lg">
                      Empezar la prueba gratis
                    </SecondaryLink>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl bg-white p-7 ring-1 ring-slate-200">
            <h3 className="font-display text-lg font-semibold text-slate-900">Cómo se paga</h3>
            <ol className="mt-5 grid gap-6 md:grid-cols-3">
              {PAYMENT_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            {contact ? (
              <p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">
                ¿Dudas sobre planes o pagos? Escríbenos: <span className="font-semibold text-slate-900">{contact}</span>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* --- Accesos y preguntas ----------------------------------------------- */}
      <section className="mx-auto grid max-w-6xl gap-16 px-5 py-24 sm:px-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-slate-900">¿Ya usas NEXOTIME?</h2>
          <p className="mt-3 text-[15px] text-slate-600">Entra según quién eres o qué equipo vas a usar.</p>
          <ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
            {PORTALS.map((p) => (
              <li key={p.to}>
                <Link
                  to={p.to}
                  className="group flex items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white">
                    <p.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900">{p.label}</span>
                    <span className="block text-sm text-slate-600">{p.text}</span>
                  </span>
                  <span className="hidden whitespace-nowrap text-sm font-semibold text-slate-900 sm:inline">{p.cta}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-900" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-slate-900">Preguntas frecuentes</h2>
          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base leading-none text-slate-600 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2.5 pr-8 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* --- Cierre -------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-12 sm:px-12">
          <div className="absolute inset-x-0 top-0 flex h-1.5" aria-hidden>
            <span className="flex-1 bg-emerald-500" />
            <span className="flex-1 bg-amber-400" />
            <span className="flex-1 bg-sky-500" />
            <span className="flex-1 bg-rose-500" />
          </div>
          <div className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] text-white">
                Pon en orden la asistencia esta semana
              </h2>
              <p className="mt-2 text-[15px] text-slate-300">Crea la cuenta de tu empresa y prueba todo {TRIAL_DAYS} días, sin tarjeta.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-6 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                Crear cuenta de mi empresa
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl border border-white/25 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>

        <footer className="mt-12 flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <LegalLinks className="text-slate-500 hover:text-slate-900" />
          <p className="text-xs text-slate-500">{copyrightLine()}</p>
        </footer>
      </section>
    </div>
  )
}
