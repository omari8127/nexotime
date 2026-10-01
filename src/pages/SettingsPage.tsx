import { useState } from 'react'
import { Building, Check, Clock, Database, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SubscriptionPanel } from '@/components/settings/SubscriptionPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { WeeklyHoursPicker } from '@/components/shared/WeeklyHoursPicker'
import { MX_TIMEZONES } from '@/data/timezones'
import { KioskSettingsPanel } from '@/components/settings/KioskSettingsPanel'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { useUIStore } from '@/store/uiStore'

export function SettingsPage() {
  const mode = useDataStore((s) => s.mode)
  const company = useDataStore((s) => s.company)
  const updateCompany = useDataStore((s) => s.updateCompany)
  const updateSettings = useDataStore((s) => s.updateSettings)
  const currentUser = useDataStore((s) => s.currentUser)
  const reset = useDataStore((s) => s.reset)
  const resetOnboarding = useUIStore((s) => s.resetOnboarding)
  const { can } = usePermissions()

  const [name, setName] = useState(company.name)
  const [rfc, setRfc] = useState(company.rfc)
  const [timezone, setTimezone] = useState(company.timezone)
  const [weekly, setWeekly] = useState(company.weeklyTargetHours)
  const s = company.attendanceSettings
  const [tolerance, setTolerance] = useState(s.entryToleranceMinutes)
  const [absence, setAbsence] = useState(s.absenceThresholdMinutes)
  const [overtime, setOvertime] = useState(s.overtimeThresholdMinutes)
  const [earlyLeave, setEarlyLeave] = useState(s.allowEarlyLeave)
  const [trackLunch, setTrackLunch] = useState(s.trackLunch)
  const [multiple, setMultiple] = useState(s.allowMultipleEntries)
  const [resetOpen, setResetOpen] = useState(false)

  const canManage = can('settings.manage')

  const saveCompany = () => {
    updateCompany({ name, rfc, weeklyTargetHours: weekly, timezone }, currentUser)
    toast.success('Datos de empresa guardados')
  }

  const saveAttendance = () => {
    updateSettings(
      {
        entryToleranceMinutes: tolerance,
        absenceThresholdMinutes: absence,
        overtimeThresholdMinutes: overtime,
        allowEarlyLeave: earlyLeave,
        trackLunch,
        allowMultipleEntries: multiple,
      },
      currentUser,
    )
    toast.success('Configuración de asistencia guardada', 'Se recalcularon los estados.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Ajusta cómo NEXOTIME calcula y registra la asistencia."
        actions={
          <Badge variant={mode === 'live' ? 'success' : 'secondary'}>
            <Database className="h-3 w-3" />
            {mode === 'live' ? 'Conectado — base de datos real' : 'Modo demostración'}
          </Badge>
        }
      />

      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="jornada">Jornada laboral</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
          <TabsTrigger value="reloj">Reloj checador</TabsTrigger>
          <TabsTrigger value="cumplimiento">Cumplimiento LFT</TabsTrigger>
          {mode === 'live' ? <TabsTrigger value="plan">Plan y pago</TabsTrigger> : null}
          {mode === 'demo' ? <TabsTrigger value="demo">Demo</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="plan">
          <SubscriptionPanel />
        </TabsContent>

        <TabsContent value="empresa">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building className="h-4 w-4 text-primary" />
                Datos de la empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nombre comercial</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
                </div>
                <div className="space-y-1.5">
                  <Label>RFC</Label>
                  <Input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} disabled={!canManage} />
                </div>
                <div className="space-y-1.5">
                  <Label>Razón social</Label>
                  <Input value={company.legalName} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Zona horaria</Label>
                  <Select value={timezone} onValueChange={setTimezone} options={MX_TIMEZONES} disabled={!canManage} />
                </div>
              </div>
              {canManage ? <Button onClick={saveCompany}>Guardar</Button> : <LockedNote />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jornada">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" />
                Jornada semanal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Horas semanales objetivo (predeterminado)</Label>
                <WeeklyHoursPicker value={weekly} onChange={setWeekly} disabled={!canManage} />
                <p className="text-xs text-muted-foreground">
                  Cada horario puede sobrescribir este valor. El sistema calcula automáticamente
                  horas trabajadas, faltantes y extra a partir de este objetivo.
                </p>
              </div>
              {canManage ? <Button onClick={saveCompany}>Guardar</Button> : <LockedNote />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asistencia">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Reglas de asistencia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <NumberField
                label="Tolerancia de entrada"
                suffix="minutos"
                value={tolerance}
                onChange={setTolerance}
                disabled={!canManage}
                hint={`Después de ${tolerance} min se considera retardo.`}
              />
              <NumberField
                label="Umbral de falta"
                suffix="minutos"
                value={absence}
                onChange={setAbsence}
                disabled={!canManage}
                hint={`Sin entrada tras ${absence} min del horario, el día se marca como falta.`}
              />
              <NumberField
                label="Umbral de horas extra"
                suffix="minutos"
                value={overtime}
                onChange={setOvertime}
                disabled={!canManage}
                hint={`El tiempo extra acumula después de ${overtime} min sobre el horario.`}
              />
              <ToggleRow
                label="Permitir salida anticipada"
                checked={earlyLeave}
                onChange={setEarlyLeave}
                disabled={!canManage}
              />
              <ToggleRow
                label="Registrar comida (salida y regreso)"
                checked={trackLunch}
                onChange={setTrackLunch}
                disabled={!canManage}
              />
              <ToggleRow
                label="Permitir múltiples registros de entrada por día"
                checked={multiple}
                onChange={setMultiple}
                disabled={!canManage}
              />
              {canManage ? (
                <Button onClick={saveAttendance}>Guardar cambios</Button>
              ) : (
                <LockedNote />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reloj">
          <KioskSettingsPanel />
        </TabsContent>

        <TabsContent value="cumplimiento">
          <div className="space-y-4">
            <Card className="border-primary/20 bg-accent/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Reforma a la Ley Federal del Trabajo — registro de jornada
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  A partir del <strong>1 de enero de 2027</strong> el registro electrónico de
                  entrada y salida será obligatorio (Art. 132, fracción XXXIV LFT) y la única
                  prueba válida ante la STPS para el pago de horas extra y el respeto a los
                  periodos de descanso.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ComplianceRow
                  title="Jornada semanal"
                  detail="La reforma reduce la jornada máxima de 48 a 40 horas semanales."
                />
                <ComplianceRow
                  title="Tope de horas extra"
                  detail="Máximo 16 horas extra a la semana (56 h totales). NEXOTIME marca una alerta de revisión cuando un empleado se acerca o excede ese límite."
                />
                <ComplianceRow
                  title="Clasificación legal automática"
                  detail="Art. 66-68 LFT: las primeras 9 horas extra a la semana se pagan dobles (200%); el excedente, triples (300%). Se calcula automáticamente por empleado y por semana."
                />
                <ComplianceRow
                  title="Sanciones por no llevar el registro"
                  detail="Multas de la STPS de $29,325 a $586,500 MXN, y el trabajador puede reclamar hasta 2 años de horas extra al triple si no hay evidencia digital."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cómo cumple NEXOTIME</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Registro digital de entrada, salida y comida con hora exacta, método usado y
                    dispositivo.
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Toda corrección manual queda en <strong>Auditoría</strong> con usuario, motivo
                    y valores antes/después — el registro nunca se sobrescribe en silencio.
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Clasificación automática de horas ordinarias, dobles y triples por empleado y
                    semana.
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Alertas en el Dashboard cuando alguien excede el límite legal de horas extra.
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Reporte <strong>"Evidencia legal (LFT)"</strong> exportable, y evidencia
                    individual imprimible desde el perfil de cada empleado.
                  </li>
                </ul>
                <p className="mt-4 text-xs text-muted-foreground">
                  Esta sección es informativa y no constituye asesoría legal.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {mode === 'demo' ? (
        <TabsContent value="demo">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RotateCcw className="h-4 w-4 text-primary" />
                Datos de la demostración
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Restablece todos los datos mock (empleados, asistencia, auditoría) a su estado
                inicial, o vuelve a ver el asistente de bienvenida.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setResetOpen(true)}>
                  Restablecer datos
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetOnboarding()
                    toast.success('Onboarding reactivado', 'Verás la bienvenida al recargar.')
                  }}
                >
                  Volver a mostrar onboarding
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        ) : null}
      </Tabs>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="¿Restablecer la demostración?"
        description="Se descartarán los cambios que hiciste en esta sesión y los datos volverán a su estado inicial."
        confirmLabel="Restablecer"
        destructive
        onConfirm={() => {
          reset()
          toast.success('Demostración restablecida')
        }}
      />
    </div>
  )
}

function ComplianceRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string
  suffix: string
  value: number
  onChange: (value: number) => void
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-24"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

function LockedNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Solo un administrador puede modificar esta configuración.
    </p>
  )
}
