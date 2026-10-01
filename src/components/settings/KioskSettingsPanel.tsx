import { useMemo, useState } from 'react'
import { LockKeyhole, MonitorCheck, ScanFace, ShieldAlert, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Avatar, Progress } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { FaceEnrollDialog } from '@/components/employees/FaceEnrollDialog'
import { useDataStore } from '@/store/dataStore'
import { usePermissions } from '@/hooks/useScopedData'
import { resolveKiosk } from '@/lib/kiosk'
import { useFeature } from '@/lib/license/features'
import { TUNING, matchPercent } from '@/lib/face'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import type { Employee, FaceStrictness } from '@/types'

const STRICTNESS: Record<FaceStrictness, { label: string; text: string }> = {
  strict: { label: 'Estricto', text: 'Máxima seguridad. Puede pedir repetir con más frecuencia.' },
  balanced: { label: 'Equilibrado', text: 'Recomendado para la mayoría de los casos.' },
  relaxed: { label: 'Flexible', text: 'Reconoce con más facilidad; algo menos seguro con rostros parecidos.' },
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

const faceState = (e: Employee) => {
  const face = e.identifications.find((i) => i.method === 'face')
  const n = face?.descriptors?.length ?? 0
  return { enrolled: n > 0, enabled: !!face?.enabled && n > 0, samples: n, enrolledAt: n > 0 ? face?.enrolledAt : undefined }
}

/** Kiosk behaviour + the roll-out of face enrollment across the team. */
export function KioskSettingsPanel() {
  const faceAllowed = useFeature('face')
  const company = useDataStore((s) => s.company)
  const employees = useDataStore((s) => s.employees)
  const updateSettings = useDataStore((s) => s.updateSettings)
  const currentUser = useDataStore((s) => s.currentUser)
  const { can } = usePermissions()
  const canManage = can('settings.manage')
  const canEnroll = can('biometrics.manage')
  const audit = useDataStore((s) => s.audit)
  const removeFace = useDataStore((s) => s.removeFace)
  const rejections = useMemo(() => audit.filter((a) => a.action === 'face.rejected').slice(0, 30), [audit])

  const saved = resolveKiosk(company.attendanceSettings)
  const [autoRegister, setAutoRegister] = useState(saved.autoRegister)
  const [seconds, setSeconds] = useState(String(saved.autoRegisterSeconds))
  const [blink, setBlink] = useState(saved.faceRequireBlink)
  const [strictness, setStrictness] = useState<FaceStrictness>(saved.faceStrictness)
  const [threshold, setThreshold] = useState<number | null>(saved.faceThreshold)
  const [challenge, setChallenge] = useState(saved.faceChallenge)
  const [gap, setGap] = useState(String(saved.minGapMinutes))
  const [exitPin, setExitPin] = useState(saved.exitPin)
  const exitPinValid = /^\d{4,8}$/.test(exitPin)
  const [testing, setTesting] = useState<Employee | null>(null)
  const [removing, setRemoving] = useState<Employee | null>(null)
  const [enrolling, setEnrolling] = useState<Employee | null>(null)
  const [query, setQuery] = useState('')

  const dirty =
    autoRegister !== saved.autoRegister ||
    Number(seconds) !== saved.autoRegisterSeconds ||
    blink !== saved.faceRequireBlink ||
    strictness !== saved.faceStrictness ||
    threshold !== saved.faceThreshold ||
    challenge !== saved.faceChallenge ||
    Number(gap) !== saved.minGapMinutes ||
    (exitPin !== saved.exitPin && exitPinValid)

  const active = useMemo(() => employees.filter((e) => e.status === 'active'), [employees])
  const enrolledCount = active.filter((e) => faceState(e).enrolled).length
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return active
      .filter((e) => (q ? `${e.fullName} ${e.employeeNumber}`.toLowerCase().includes(q) : true))
      .sort((a, b) => Number(faceState(a).enrolled) - Number(faceState(b).enrolled) || a.fullName.localeCompare(b.fullName))
  }, [active, query])

  const save = () => {
    updateSettings(
      {
        kiosk: {
          autoRegister,
          autoRegisterSeconds: Number(seconds),
          faceRequireBlink: blink,
          faceStrictness: strictness,
          faceThreshold: threshold ?? undefined,
          faceChallenge: challenge,
          minGapMinutes: Number(gap),
          exitPin: exitPinValid ? exitPin : saved.exitPin,
        },
      },
      currentUser,
    )
    toast.success('Reloj checador actualizado', 'Los cambios aplican de inmediato en el reloj.')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorCheck className="h-4 w-4 text-primary" />
            Registro en el reloj
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label>Registrar automáticamente</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Al identificarse, el reloj propone el siguiente movimiento (entrada, comida, salida) y lo
                registra solo. El empleado puede cancelar o elegir otro movimiento.
              </p>
            </div>
            <Switch checked={autoRegister} onCheckedChange={setAutoRegister} disabled={!canManage} />
          </div>
          {autoRegister ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Tiempo para cancelar</Label>
                <p className="mt-1 text-sm text-muted-foreground">Cuenta regresiva antes de registrar.</p>
              </div>
              <Select
                className="w-32"
                value={seconds}
                onValueChange={setSeconds}
                disabled={!canManage}
                options={['2', '3', '5', '8'].map((v) => ({ value: v, label: `${v} segundos` }))}
              />
            </div>
          ) : null}

          <div className="border-t border-border pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label>Prueba de vida (parpadeo)</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pide parpadear antes de aceptar un rostro. Evita que alguien use una foto o una pantalla.
                </p>
              </div>
              <Switch checked={blink} onCheckedChange={setBlink} disabled={!canManage} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Exigencia del reconocimiento</Label>
              <p className="mt-1 text-sm text-muted-foreground">{STRICTNESS[strictness].text}</p>
            </div>
            <Select
              className="w-40"
              value={strictness}
              onValueChange={(v) => setStrictness(v as FaceStrictness)}
              disabled={!canManage}
              options={(Object.keys(STRICTNESS) as FaceStrictness[]).map((k) => ({ value: k, label: STRICTNESS[k].label }))}
            />
          </div>

          <div className="border-t border-border pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label>Prueba de vida reforzada</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Además de parpadear, pide girar la cabeza a un lado y volver. Es más difícil de burlar con un video
                  grabado, pero es un paso más para el empleado.
                </p>
              </div>
              <Switch checked={challenge} onCheckedChange={setChallenge} disabled={!canManage || !blink} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Umbral de coincidencia</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Porcentaje mínimo de parecido para aceptar un rostro: menos exige más rapidez, más exige más
                  seguridad. Si no lo fijas, se usa el del nivel de exigencia ({matchPercent(TUNING[strictness].threshold)}%).
                </p>
              </div>
              <span className="w-14 text-right font-mono text-sm tabular-nums">
                {matchPercent(threshold ?? TUNING[strictness].threshold)}%
              </span>
            </div>
            <input
              type="range"
              min={0.35}
              max={0.75}
              step={0.01}
              value={threshold ?? TUNING[strictness].threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={!canManage}
              className="w-full accent-[hsl(var(--primary))]"
              aria-label="Umbral de coincidencia"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Más estricto</span>
              {threshold !== null ? (
                <button type="button" className="underline" onClick={() => setThreshold(null)}>
                  Usar el nivel de exigencia
                </button>
              ) : null}
              <span>Más permisivo</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Tiempo entre checadas</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Evita registros dobles: quien acaba de checar debe esperar este tiempo.
              </p>
            </div>
            <Select
              className="w-32"
              value={gap}
              onValueChange={setGap}
              disabled={!canManage}
              options={['0', '1', '2', '5', '10'].map((v) => ({ value: v, label: v === '0' ? 'Sin espera' : `${v} min` }))}
            />
          </div>

          <div className="border-t border-border pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="flex items-center gap-1.5">
                  <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />
                  Código de salida del reloj
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  El reloj checador no tiene botón para salir: se sale manteniendo presionado el logo 3
                  segundos y escribiendo este código (4 a 8 dígitos). Solo compártelo con quien administra
                  la tablet.
                </p>
              </div>
              <Input
                className="w-28 text-center font-mono tracking-widest"
                inputMode="numeric"
                maxLength={8}
                value={exitPin}
                onChange={(e) => setExitPin(e.target.value.replace(/\D/g, ''))}
                disabled={!canManage}
              />
            </div>
            {!exitPinValid ? (
              <p className="mt-1.5 text-right text-xs text-destructive">Debe tener de 4 a 8 dígitos.</p>
            ) : null}
          </div>

          {canManage ? (
            <Button onClick={save} disabled={!dirty}>
              Guardar cambios
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {faceAllowed ? (
        <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanFace className="h-4 w-4 text-primary" />
              Rostros registrados
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {enrolledCount} de {active.length} empleados activos ya pueden checar con el rostro.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={active.length ? (enrolledCount / active.length) * 100 : 0} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empleado"
            className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground dark:bg-background"
          />
          <div className="max-h-[420px] divide-y divide-border overflow-auto rounded-lg border border-border">
            {rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Sin empleados que coincidan.</p>
            ) : (
              rows.map((e) => {
                const st = faceState(e)
                return (
                  <div key={e.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Avatar name={e.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.employeeNumber} · {e.department}
                        {st.enrolledAt ? ` · Registrado el ${fmt(st.enrolledAt)}` : ''}
                      </p>
                    </div>
                    {st.enrolled ? (
                      <Badge variant={st.enabled ? 'success' : 'muted'}>{st.enabled ? 'Registrado' : 'Desactivado'}</Badge>
                    ) : (
                      <Badge variant="warning">No registrado</Badge>
                    )}
                    {canEnroll ? (
                      <div className="flex shrink-0 gap-1.5">
                        {st.enrolled ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setTesting(e)}>
                              Probar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Eliminar datos biométricos de ${e.fullName}`}
                              onClick={() => setRemoving(e)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                        <Button size="sm" variant={st.enrolled ? 'secondary' : 'default'} onClick={() => setEnrolling(e)}>
                          {st.enrolled ? 'Actualizar' : 'Registrar'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Intentos rechazados
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Rostros que el reloj no aceptó por baja confianza o por no superar la prueba de vida. También aparecen en
            Auditoría.
          </p>
        </CardHeader>
        <CardContent>
          {rejections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Sin intentos rechazados.
            </p>
          ) : (
            <div className="max-h-72 divide-y divide-border overflow-auto rounded-lg border border-border">
              {rejections.map((a) => (
                <div key={a.id} className="px-3.5 py-2.5">
                  <p className="text-sm">{a.reason}</p>
                  <p className="text-xs text-muted-foreground">{fmt(a.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

        </>
      ) : null}

      {testing ? (
        <FaceEnrollDialog
          open
          testOnly
          onOpenChange={(o) => {
            if (!o) setTesting(null)
          }}
          employee={employees.find((e) => e.id === testing.id) ?? testing}
        />
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => {
          if (!o) setRemoving(null)
        }}
        title="Eliminar datos biométricos"
        description={`Se borrará el rostro registrado de ${removing?.fullName ?? ''}. Tendrá que registrarlo de nuevo para checar con la cámara.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (removing) {
            removeFace(removing.id, currentUser)
            toast.success('Datos biométricos eliminados', removing.fullName)
          }
          setRemoving(null)
        }}
      />

      {enrolling ? (
        <FaceEnrollDialog
          open
          onOpenChange={(o) => {
            if (!o) setEnrolling(null)
          }}
          employee={employees.find((e) => e.id === enrolling.id) ?? enrolling}
        />
      ) : null}
    </div>
  )
}
