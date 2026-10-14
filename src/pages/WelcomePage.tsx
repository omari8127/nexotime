import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  ClipboardList,
  FileSpreadsheet,
  MonitorSmartphone,
  Plane,
  ScanFace,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NexotimeLogo } from '@/components/shared/Logo'
import { BrandDarkBackdrop } from '@/components/shared/BrandDarkBackdrop'
import { AnalogClock } from '@/components/clock/AnalogClock'
import { useLiveClock, formatClockTime } from '@/hooks/useLiveClock'
import { LegalLinks } from '@/components/shared/LegalLinks'
import { LEGAL_ENTITY, copyrightLine } from '@/data/legal'
import { PAYMENT_STEPS, PLANS, TRIAL_DAYS } from '@/data/pricing'
import { currency, cn } from '@/lib/utils'

/** The three ways into the product: one per kind of person (or equipment). */
const PORTALS = [
  {
    to: '/login',
    icon: UserCog,
    label: 'Administrador',
    title: 'Portal de administración',
    text: 'El panel de la empresa: empleados, asistencia, vacaciones, reportes y configuración.',
    cta: 'Entrar al panel',
    tone: 'bg-blue-500/15 text-blue-300',
  },
  {
    to: '/activar?modo=empleado',
    icon: Smartphone,
    label: 'Empleado',
    title: 'Portal del empleado',
    text: 'Desde el celular: registra tu entrada y salida con tu número y PIN, y pide vacaciones.',
    cta: 'Entrar con mi PIN',
    tone: 'bg-emerald-500/15 text-emerald-300',
  },
  {
    to: '/activar?modo=reloj',
    icon: MonitorSmartphone,
    label: 'Reloj checador',
    title: 'Reloj checador',
    text: 'Una tablet o PC en la entrada donde todos checan con rostro, QR, código de barras o PIN.',
    cta: 'Activar este equipo',
    tone: 'bg-amber-400/15 text-amber-300',
  },
] as const

const FEATURES = [
  {
    icon: ScanFace,
    tone: 'bg-sky-500/15 text-sky-300',
    title: 'Checada que no se puede prestar',
    text: 'Reconocimiento facial, QR, código de barras o número + PIN. Con PIN se toma una foto que compruebas tú.',
  },
  {
    icon: Smartphone,
    tone: 'bg-emerald-500/15 text-emerald-300',
    title: 'También desde el celular',
    text: 'Cada empleado checa desde su teléfono con foto y ubicación: ideal para personal en ruta o en otra sede.',
  },
  {
    icon: ClipboardList,
    tone: 'bg-violet-500/15 text-violet-300',
    title: 'Asistencia al momento',
    text: 'Entradas, comidas y salidas del día de un vistazo; retardos, faltas y horas extra calculados solos.',
  },
  {
    icon: Plane,
    tone: 'bg-cyan-500/15 text-cyan-300',
    title: 'Vacaciones e incidencias',
    text: 'El empleado pide sus vacaciones y tú las apruebas o rechazas. Los días por ley se calculan solos.',
  },
  {
    icon: FileSpreadsheet,
    tone: 'bg-amber-400/15 text-amber-300',
    title: 'Reportes para nómina',
    text: 'Horas trabajadas, retardos, faltas y extras por persona, listos para exportar a Excel o CSV.',
  },
  {
    icon: ShieldCheck,
    tone: 'bg-rose-500/15 text-rose-300',
    title: 'Evidencia y auditoría',
    text: 'Cada corrección queda con quién la hizo, cuándo y por qué. Tu registro electrónico de jornada, en orden.',
  },
]

const STEPS = [
  { icon: Users, title: 'Crea la cuenta de tu empresa', text: 'Datos básicos, sucursales y jornada. Toma unos minutos.' },
  { icon: CalendarClock, title: 'Da de alta a tu equipo', text: 'Uno por uno o desde Excel, con su horario y su PIN.' },
  { icon: MonitorSmartphone, title: 'Activa cómo van a checar', text: 'Un reloj checador en la entrada, el celular de cada quien, o ambos.' },
  { icon: BarChart3, title: 'Revisa y exporta', text: 'Asistencia del día, vacaciones por aprobar y reportes para tu nómina.' },
]

const FAQ = [
  {
    q: '¿Tengo que instalar algo?',
    a: 'No. NEXOTIME se abre en el navegador de cualquier tablet, PC o celular. Solo necesitas una cámara si vas a usar rostro, QR o foto.',
  },
  {
    q: '¿Qué pasa si se va el Internet?',
    a: 'El reloj checador sigue funcionando: reconoce rostros y guarda las checadas en el equipo, y las envía solo cuando vuelve la conexión.',
  },
  {
    q: '¿Cómo entran mis empleados desde su celular?',
    a: 'Con el código de tu empresa, su número de empleado y su PIN. Cada movimiento se guarda con una foto y la ubicación, para que nadie cheque por otra persona.',
  },
  {
    q: '¿Guardan fotos del rostro?',
    a: 'Del reconocimiento facial solo se guardan medidas numéricas, no fotografías. La foto de verificación de una checada sí se guarda, como evidencia para tu empresa, y se elimina sola a los 90 días.',
  },
]

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
}

function Section({ id, eyebrow, title, lead, children }: { id?: string; eyebrow: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="relative mx-auto max-w-6xl scroll-mt-28 px-6 py-16 sm:px-10 lg:py-20">
      <motion.div {...reveal} className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">{eyebrow}</p>
        <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">{title}</h2>
        {lead ? <p className="mt-3 text-[15px] leading-relaxed text-sidebar-foreground/75">{lead}</p> : null}
      </motion.div>
      <div className="mt-10">{children}</div>
    </section>
  )
}

/**
 * Página pública (quien la abre no ha iniciado sesión): qué es NEXOTIME, para qué sirve, cómo se
 * entra y cómo se paga. A propósito usa siempre la paleta oscura de marca (los mismos tokens
 * --sidebar del panel y del reloj checador) en vez de seguir el tema claro/oscuro guardado: es la
 * primera impresión del producto y no debe verse distinta según el navegador de quien la abra.
 */
export function WelcomePage() {
  const now = useLiveClock()
  const contact = LEGAL_ENTITY.email ?? LEGAL_ENTITY.phone

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-sidebar text-sidebar-foreground">
      <BrandDarkBackdrop />

      {/* --- Barra superior: los tres accesos, al centro ---------------------- */}
      <header className="sticky top-0 z-30 border-b border-sidebar-border/70 bg-sidebar/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-6 py-3 sm:px-10">
          <Link to="/bienvenida" aria-label="NEXOTIME, inicio">
            <NexotimeLogo tone="light" />
          </Link>
          <nav aria-label="Accesos" className="order-3 flex w-full items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 md:order-none md:w-auto">
            {PORTALS.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                className="group flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/10 hover:text-white md:flex-none"
              >
                <p.icon className="h-4 w-4 transition-transform group-hover:scale-110" />
                {p.label}
              </Link>
            ))}
          </nav>
          <Link to="/signup">
            <Button size="sm" className="shadow-lg shadow-primary/25">
              Crear cuenta
            </Button>
          </Link>
        </div>
      </header>

      {/* --- Presentación ------------------------------------------------------ */}
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-10 pt-14 sm:px-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:pt-20">
        <motion.div
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-sidebar-foreground/80">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Control de asistencia para empresas
          </span>

          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-[3.1rem]">
            Controla la asistencia de tu equipo{' '}
            <span className="bg-gradient-to-r from-sky-300 to-primary bg-clip-text text-transparent">
              sin hojas de cálculo
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-sidebar-foreground/75">
            NEXOTIME es el reloj checador digital de tu empresa: tu personal registra entrada, comida y salida en una
            tablet o desde su celular, y tú ves la asistencia, apruebas vacaciones y sacas los reportes de nómina
            desde cualquier navegador.
          </p>

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <Link to="/signup">
              <Button size="lg" className="w-full shadow-lg shadow-primary/25 sm:w-auto">
                Probar {TRIAL_DAYS} días gratis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#para-que-sirve">
              <Button
                size="lg"
                variant="ghost"
                className="w-full border border-sidebar-border bg-white/[0.03] text-white hover:bg-white/[0.08] sm:w-auto"
              >
                Ver para qué sirve
              </Button>
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-sidebar-foreground/75">
            {['Sin instalar nada', 'Sin tarjeta para probar', 'Funciona sin Internet'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" />
                {t}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ y: 14, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-full max-w-sm"
        >
          <div
            className="absolute -inset-10 -z-10 rounded-full opacity-70 blur-3xl"
            style={{ background: 'radial-gradient(closest-side, hsl(var(--primary) / 0.35), transparent)' }}
            aria-hidden
          />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-2xl shadow-black/40 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Reloj checador</p>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                Vista previa en vivo
              </span>
            </div>
            <div className="p-6">
              <AnalogClock now={now} className="mx-auto h-40 w-40" />
              <p className="mt-4 text-center font-mono text-3xl font-semibold tabular-nums text-white">
                {formatClockTime(now)}
              </p>
              <p className="mt-1 text-center text-sm text-white/70">Registra tu asistencia</p>
              <div className="mt-5 space-y-2">
                {['Reconocimiento facial', 'Escanear código QR', 'Número de empleado'].map((m) => (
                  <Link
                    key={m}
                    to="/activar?modo=reloj"
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08]"
                  >
                    {m}
                    <span className="text-white/40">›</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* --- Tres accesos ------------------------------------------------------ */}
      <div className="relative mx-auto max-w-6xl px-6 pb-6 sm:px-10">
        <div className="grid gap-4 md:grid-cols-3">
          {PORTALS.map((p, i) => (
            <motion.div key={p.to} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}>
              <Link
                to={p.to}
                className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] hover:shadow-xl hover:shadow-black/30"
              >
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', p.tone)}>
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">{p.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-sidebar-foreground/75">{p.text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300">
                  {p.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* --- Para qué sirve ---------------------------------------------------- */}
      <Section
        id="para-que-sirve"
        eyebrow="Para qué sirve"
        title="Todo lo que antes llevabas en libretas y hojas de cálculo"
        lead="Un solo lugar para saber quién llegó, a qué hora, cuánto trabajó y qué días faltó — con evidencia de cada registro."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 3) * 0.07 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]"
            >
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', f.tone)}>
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-sidebar-foreground/75">{f.text}</p>
            </motion.div>
          ))}
        </div>
        <motion.p {...reveal} className="mt-6 flex items-center gap-2 text-sm text-sidebar-foreground/75">
          <WifiOff className="h-4 w-4 shrink-0 text-sky-300" />
          El reloj checador abre y registra aunque se caiga el Internet, y sincroniza al volver.
        </motion.p>
      </Section>

      {/* --- Cómo funciona ----------------------------------------------------- */}
      <Section id="como-funciona" eyebrow="Cómo funciona" title="Listo el mismo día">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.08 }}
              className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-[13px] font-semibold text-white">
                {i + 1}
              </span>
              <p className="mt-4 flex items-center gap-1.5 text-[15px] font-semibold text-white">
                <s.icon className="h-4 w-4 text-sky-300" strokeWidth={2} />
                {s.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-sidebar-foreground/75">{s.text}</p>
            </motion.li>
          ))}
        </ol>
      </Section>

      {/* --- Planes y pago ----------------------------------------------------- */}
      <Section
        id="planes"
        eyebrow="Planes y pago"
        title={`Empieza gratis ${TRIAL_DAYS} días`}
        lead="Usa el sistema completo durante la prueba. Después eliges el plan que te conviene; puedes cambiarlo cuando crezcas."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.08 }}
              className={cn(
                'relative flex flex-col rounded-2xl border p-6',
                plan.highlight
                  ? 'border-primary/60 bg-primary/10 shadow-xl shadow-primary/10'
                  : 'border-white/10 bg-white/[0.03]',
              )}
            >
              {plan.highlight ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-white">
                  Recomendado
                </span>
              ) : null}
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-sidebar-foreground/75">{plan.tagline}</p>
              <p className="mt-4 text-white">
                {plan.monthlyPrice != null ? (
                  <>
                    <span className="text-3xl font-semibold tabular-nums">{currency(plan.monthlyPrice)}</span>
                    <span className="text-sm text-sidebar-foreground/75"> / mes + IVA</span>
                  </>
                ) : (
                  <span className="text-lg font-semibold">Solicita tu cotización</span>
                )}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-sidebar-foreground/85">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="mt-6">
                <Button
                  className={cn('w-full', !plan.highlight && 'border border-sidebar-border bg-white/[0.04] text-white hover:bg-white/[0.1]')}
                  variant={plan.highlight ? 'default' : 'ghost'}
                >
                  Empezar la prueba gratis
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div {...reveal} className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h3 className="text-base font-semibold text-white">Cómo se paga</h3>
          <ol className="mt-4 grid gap-5 md:grid-cols-3">
            {PAYMENT_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[13px] font-semibold text-sky-200">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-sidebar-foreground/75">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          {contact ? (
            <p className="mt-5 border-t border-white/10 pt-4 text-sm text-sidebar-foreground/75">
              ¿Dudas sobre planes o pagos? Escríbenos: <span className="font-medium text-white">{contact}</span>
            </p>
          ) : null}
        </motion.div>
      </Section>

      {/* --- Preguntas ---------------------------------------------------------- */}
      <Section eyebrow="Preguntas frecuentes" title="Antes de empezar">
        <div className="grid gap-3 lg:grid-cols-2">
          {FAQ.map((item, i) => (
            <motion.details
              key={item.q}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 2) * 0.06 }}
              className="group rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 open:bg-white/[0.06]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="text-xl leading-none text-sky-300 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-sidebar-foreground/75">{item.a}</p>
            </motion.details>
          ))}
        </div>
      </Section>

      {/* --- Cierre -------------------------------------------------------------- */}
      <div className="relative mx-auto max-w-6xl px-6 pb-16 sm:px-10">
        <motion.div
          {...reveal}
          className="flex flex-col items-start justify-between gap-5 rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/25 to-sky-400/10 p-8 md:flex-row md:items-center"
        >
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Pon en orden la asistencia esta semana</h2>
            <p className="mt-1.5 text-sm text-sidebar-foreground/80">
              Crea la cuenta de tu empresa y prueba todo {TRIAL_DAYS} días, sin tarjeta.
            </p>
          </div>
          <Link to="/signup">
            <Button size="lg" className="shadow-lg shadow-primary/30">
              Crear cuenta de mi empresa
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.div>

        <footer className="mt-12 flex flex-col gap-3 border-t border-sidebar-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <LegalLinks className="text-sidebar-foreground/70 hover:text-white" />
          <p className="text-xs text-sidebar-foreground/75">{copyrightLine()}</p>
        </footer>
      </div>
    </div>
  )
}
