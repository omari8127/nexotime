import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BarChart3, CalendarClock, MonitorSmartphone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NexotimeLogo } from '@/components/shared/Logo'
import { BrandDarkBackdrop } from '@/components/shared/BrandDarkBackdrop'
import { AnalogClock } from '@/components/clock/AnalogClock'
import { useLiveClock, formatClockTime } from '@/hooks/useLiveClock'
import { LegalLinks } from '@/components/shared/LegalLinks'
import { copyrightLine } from '@/data/legal'

const STEPS = [
  { icon: Users, title: 'Configura tu empresa', text: 'Datos fiscales, sucursales y jornada base.' },
  { icon: CalendarClock, title: 'Agrega empleados', text: 'Alta rápida con número, horario y método de checado.' },
  { icon: BarChart3, title: 'Configura horarios', text: 'Jornadas por día con objetivo semanal configurable.' },
  { icon: MonitorSmartphone, title: 'Conecta tu reloj checador', text: 'Tablet o PC en recepción, lista en minutos.' },
]

/**
 * Pantalla pública de bienvenida (quien la abre no ha iniciado sesión). A
 * propósito usa siempre la paleta oscura de marca (los mismos tokens
 * --sidebar del panel y del reloj checador) en vez de seguir el tema
 * claro/oscuro guardado: es la primera impresión del producto y no debe
 * verse distinta según el navegador de quien la abra.
 */
export function WelcomePage() {
  const now = useLiveClock()

  return (
    <div className="relative min-h-dvh overflow-hidden bg-sidebar text-sidebar-foreground">
      <BrandDarkBackdrop />

      <div className="relative mx-auto grid min-h-dvh max-w-7xl lg:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-14 sm:px-12 lg:px-16">
          <NexotimeLogo tone="light" size="lg" />

          <motion.div
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-11 max-w-md"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-sidebar-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Control de asistencia para empresas
            </span>

            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-[2.75rem]">
              Controla la asistencia de tu equipo{' '}
              <span className="bg-gradient-to-r from-sky-300 to-primary bg-clip-text text-transparent">
                sin hojas de cálculo
              </span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-sidebar-foreground/70">
              Reloj checador con rostro, QR o código de empleado, horarios, reportes exportables y
              auditoría completa — todo desde cualquier navegador.
            </p>

            <ol className="relative mt-9 space-y-5">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-sidebar-border" aria-hidden />
              {STEPS.map((s, i) => (
                <motion.li
                  key={s.title}
                  initial={{ x: -8, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.3 }}
                  className="relative flex gap-3.5"
                >
                  <div className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-[13px] font-semibold text-sidebar-foreground/90">
                    {i + 1}
                  </div>
                  <div className="pt-0.5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                      <s.icon className="h-3.5 w-3.5 text-sky-300" strokeWidth={2} />
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-sm text-sidebar-foreground/75">{s.text}</p>
                  </div>
                </motion.li>
              ))}
            </ol>

            <div className="mt-10 flex flex-col gap-2.5 sm:flex-row">
              <Link to="/signup" className="flex-1">
                <Button size="lg" className="w-full shadow-lg shadow-primary/25">
                  Crear cuenta de mi empresa
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login" className="flex-1">
                <Button
                  size="lg"
                  variant="ghost"
                  className="w-full border border-sidebar-border bg-white/[0.03] text-white hover:bg-white/[0.08]"
                >
                  Iniciar sesión
                </Button>
              </Link>
            </div>
          </motion.div>

          <div className="mt-12 space-y-2.5">
            <LegalLinks className="text-sidebar-foreground/70 hover:text-white" />
            <p className="text-xs text-sidebar-foreground/75">{copyrightLine()}</p>
          </div>
        </div>

        <div className="relative hidden items-center justify-center p-12 lg:flex">
          <motion.div
            initial={{ y: 14, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm"
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
                  {['Escanear código QR', 'Número de empleado'].map((m) => (
                    <div
                      key={m}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
                    >
                      {m}
                      <span className="text-white/40">›</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
