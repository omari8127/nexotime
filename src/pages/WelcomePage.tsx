import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BarChart3, CalendarClock, MonitorSmartphone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NexotimeLogo } from '@/components/shared/Logo'
import { AnalogClock } from '@/components/clock/AnalogClock'
import { useUIStore } from '@/store/uiStore'
import { isSupabaseConfigured } from '@/lib/supabaseClient'

const FIXED_NOW = new Date('2026-09-10T11:45:32')

const STEPS = [
  { icon: Users, title: 'Configura tu empresa', text: 'Datos fiscales, sucursales y jornada base.' },
  { icon: CalendarClock, title: 'Agrega empleados', text: 'Alta rápida con número, horario y método de checado.' },
  { icon: BarChart3, title: 'Configura horarios', text: 'Jornadas por día con objetivo semanal configurable.' },
  { icon: MonitorSmartphone, title: 'Conecta tu reloj checador', text: 'Tablet o PC en recepción, lista en minutos.' },
]

export function WelcomePage() {
  const navigate = useNavigate()
  const completeOnboarding = useUIStore((s) => s.completeOnboarding)

  const startDemo = () => {
    completeOnboarding()
    navigate('/')
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <NexotimeLogo tone="dark" size="lg" />
        <motion.div
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-10 max-w-md"
        >
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Bienvenido a Nexotime
          </h1>
          <p className="mt-3 text-muted-foreground">
            Controla la asistencia de tu equipo desde cualquier lugar. Reloj checador, horarios,
            reportes y auditoría en un solo lugar.
          </p>

          <ol className="mt-8 space-y-4">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ x: -10 }}
                animate={{ x: 0 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.25 }}
                className="flex gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{s.text}</p>
                </div>
              </motion.li>
            ))}
          </ol>

          {isSupabaseConfigured ? (
            <>
              <div className="mt-9 flex flex-col gap-2 sm:flex-row">
                <Link to="/signup" className="flex-1">
                  <Button size="lg" className="w-full">
                    Crear cuenta de mi empresa
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/login" className="flex-1">
                  <Button size="lg" variant="secondary" className="w-full">
                    Iniciar sesión
                  </Button>
                </Link>
              </div>
              <button
                type="button"
                onClick={startDemo}
                className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Solo quiero ver una demo, sin cuenta →
              </button>
            </>
          ) : (
            <div className="mt-9 space-y-3">
              <Button size="lg" className="w-full" onClick={startDemo}>
                Entrar a la demo
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground">
                El registro con cuenta real aún no está configurado en este entorno — por ahora
                puedes explorar todo con datos de ejemplo.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <motion.div
            initial={{ y: 10 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
          >
            <p className="border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white/50">
              Reloj checador
            </p>
            <div className="p-6">
              <AnalogClock now={FIXED_NOW} className="mx-auto h-40 w-40" />
              <p className="mt-4 text-center font-mono text-3xl font-semibold tabular-nums text-white">
                11:45:32
              </p>
              <p className="mt-1 text-center text-sm text-white/60">Registra tu asistencia</p>
              <div className="mt-5 space-y-2">
                {['Escanear código QR', 'Número de empleado'].map((m) => (
                  <div
                    key={m}
                    className="flex items-center justify-between rounded-md border border-white/10 px-3.5 py-3 text-sm font-medium text-white/80"
                  >
                    {m}
                    <span className="text-white/50">›</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
