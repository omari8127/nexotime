import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { NexotimeLogo } from '@/components/shared/Logo'
import { WeeklyHoursPicker } from '@/components/shared/WeeklyHoursPicker'
import { useDataStore } from '@/store/dataStore'
import { useUIStore } from '@/store/uiStore'
import { toast } from '@/components/ui/toast'

const STEPS = ['Empresa', 'Jornada', 'Reloj checador', 'Listo']

export function OnboardingPage() {
  const navigate = useNavigate()
  const company = useDataStore((s) => s.company)
  const updateCompany = useDataStore((s) => s.updateCompany)
  const updateSettings = useDataStore((s) => s.updateSettings)
  const currentUser = useDataStore((s) => s.currentUser)
  const completeOnboarding = useUIStore((s) => s.completeOnboarding)

  const [step, setStep] = useState(0)
  const [name, setName] = useState(company.name)
  const [industry, setIndustry] = useState(company.industry)
  const [weekly, setWeekly] = useState(company.weeklyTargetHours)
  const [tolerance, setTolerance] = useState(company.attendanceSettings.entryToleranceMinutes)

  const finish = () => {
    updateCompany({ name, industry, weeklyTargetHours: weekly }, currentUser)
    updateSettings({ entryToleranceMinutes: tolerance }, currentUser)
    completeOnboarding()
    toast.success('Configuración guardada', 'Tu empresa está lista.')
    navigate('/')
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-6 py-10">
      <NexotimeLogo tone="dark" />

      <div className="mt-8 w-full max-w-lg">
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                      ? 'bg-primary/15 text-primary ring-2 ring-primary'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 ? (
                <div className={`h-0.5 flex-1 rounded ${i < step ? 'bg-primary' : 'bg-border'}`} />
              ) : null}
            </div>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ x: 16 }}
          animate={{ x: 0 }}
          transition={{ duration: 0.22 }}
          className="rounded-xl border border-border bg-card p-6"
        >
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Configura tu empresa</h2>
                <p className="text-sm text-muted-foreground">Estos datos aparecen en reportes y en el reloj checador.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Nombre de la empresa</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Giro</Label>
                <Select
                  value={industry}
                  onValueChange={setIndustry}
                  options={[
                    'Servicios administrativos',
                    'Comercio / Retail',
                    'Restaurantes',
                    'Manufactura',
                    'Salud / Clínicas',
                    'Gimnasios',
                    'Logística / Bodegas',
                  ].map((v) => ({ value: v, label: v }))}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Jornada laboral</h2>
                <p className="text-sm text-muted-foreground">
                  El objetivo semanal es configurable. Cámbialo cuando quieras por empresa o por horario.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Horas semanales objetivo</Label>
                <WeeklyHoursPicker value={weekly} onChange={setWeekly} />
              </div>
              <div className="space-y-1.5">
                <Label>Tolerancia de entrada (minutos)</Label>
                <Input
                  type="number"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value) || 0)}
                  className="max-w-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Después de {tolerance} min se considera retardo.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Conecta tu reloj checador</h2>
                <p className="text-sm text-muted-foreground">
                  Abre el reloj en una tablet o PC en recepción e ingresa el código de emparejamiento.
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-6 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Código de emparejamiento</p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em]">418-207</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Válido por 10 minutos · o abre <span className="font-medium">/clock</span> directamente en la demo
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/12 text-success">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Todo listo</h2>
                <p className="text-sm text-muted-foreground">
                  {name} está configurada con {weekly} h semanales y {tolerance} min de tolerancia.
                  Ya puedes explorar el panel.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => (step === 0 ? navigate('/bienvenida') : setStep((s) => s - 1))}
            >
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish}>Ir al dashboard</Button>
            )}
          </div>
        </motion.div>

        <button
          type="button"
          onClick={() => {
            completeOnboarding()
            navigate('/')
          }}
          className="mx-auto mt-4 block text-sm text-muted-foreground hover:text-foreground"
        >
          Omitir configuración
        </button>
      </div>
    </div>
  )
}
