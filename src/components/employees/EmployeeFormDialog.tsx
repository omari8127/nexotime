import { useEffect, useMemo, useState } from 'react'
import { QrCode, Barcode, ScanFace, UserRound, KeyRound } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { useDataStore } from '@/store/dataStore'
import { useScopedData } from '@/hooks/useScopedData'
import { useToday } from '@/hooks/useToday'
import { generateBarcodeValue, generateQrValue, takenBarcodes } from '@/lib/credentials'
import { SelectWithCustom } from '@/components/shared/SelectWithCustom'
import { DEPARTMENTS, POSITIONS } from '@/data/catalog'
import type { Employee, IdentificationMethod } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee
  onSaved?: (employee: Employee) => void
}

const METHOD_LABELS: Partial<Record<IdentificationMethod, { label: string; Icon: typeof QrCode; soon?: boolean }>> = {
  face: { label: 'Reconocimiento facial', Icon: ScanFace },
  qr: { label: 'Código QR', Icon: QrCode },
  barcode: { label: 'Código de barras', Icon: Barcode },
  employee_number: { label: 'Número de empleado', Icon: UserRound },
  pin: { label: 'PIN', Icon: KeyRound },
}

const SECTION = 'space-y-4 rounded-xl border border-border bg-secondary/30 p-4'
const SECTION_TITLE = 'text-sm font-semibold text-foreground'

export function EmployeeFormDialog({ open, onOpenChange, employee, onSaved }: Props) {
  const { allBranches, schedules } = useScopedData()
  const employees = useDataStore((s) => s.employees)
  const addEmployee = useDataStore((s) => s.addEmployee)
  const updateEmployee = useDataStore((s) => s.updateEmployee)
  const currentUser = useDataStore((s) => s.currentUser)
  const today = useToday()

  const positionOptions = useMemo(
    () => [...new Set([...POSITIONS, ...employees.map((e) => e.position).filter(Boolean)])],
    [employees],
  )
  const departmentOptions = useMemo(
    () => [...new Set([...DEPARTMENTS, ...employees.map((e) => e.department).filter(Boolean)])],
    [employees],
  )

  const nextNumber = useMemo(() => {
    const max = employees.reduce((m, e) => {
      const n = Number(e.employeeNumber.replace(/\D/g, ''))
      return Number.isFinite(n) ? Math.max(m, n) : m
    }, 0)
    return `EMP-${String(max + 1).padStart(3, '0')}`
  }, [employees])

  const [form, setForm] = useState(() => blank(nextNumber, today, allBranches[0]?.id, schedules[0]?.id))
  const [methods, setMethods] = useState<Record<IdentificationMethod, boolean>>({
    face: false,
    qr: true,
    barcode: false,
    employee_number: true,
    pin: true,
  })

  useEffect(() => {
    if (!open) return
    if (employee) {
      setForm({
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastNamePaternal: employee.lastNamePaternal,
        lastNameMaternal: employee.lastNameMaternal ?? '',
        phone: employee.phone ?? '',
        email: employee.email ?? '',
        position: employee.position,
        department: employee.department,
        branchId: employee.branchId,
        hireDate: employee.hireDate,
        status: employee.status,
        scheduleId: employee.scheduleId,
        pin: employee.pin ?? '',
        curp: employee.curp ?? '',
        address: employee.address ?? '',
        emergencyName: employee.emergencyContact?.name ?? '',
        emergencyPhone: employee.emergencyContact?.phone ?? '',
      })
      setMethods({
        face: !!employee.identifications.find((i) => i.method === 'face')?.enabled,
        qr: !!employee.identifications.find((i) => i.method === 'qr')?.enabled,
        barcode: !!employee.identifications.find((i) => i.method === 'barcode')?.enabled,
        employee_number: true,
        pin: !!employee.identifications.find((i) => i.method === 'pin')?.enabled,
      })
    } else {
      setForm(blank(nextNumber, today, allBranches[0]?.id, schedules[0]?.id))
    }
  }, [open, employee, nextNumber, today, allBranches, schedules])

  const hasFace = !!employee?.identifications.find((i) => i.method === 'face')?.descriptors?.length

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const canSave =
    form.firstName.trim() && form.lastNamePaternal.trim() && form.branchId && form.scheduleId

  const handleSave = () => {
    if (!canSave) {
      toast.error('Faltan datos', 'Nombre, apellido paterno, sucursal y horario son obligatorios.')
      return
    }
    if (methods.pin && !/^\d{4}$/.test(form.pin.trim())) {
      toast.error('PIN inválido', 'El PIN debe tener exactamente 4 dígitos (o desactiva el método PIN).')
      return
    }
    // Codes are generated once and kept on later edits — re-saving an employee must
    // never invalidate a badge that was already printed.
    const existingQr = employee?.identifications.find((i) => i.method === 'qr')?.value
    const qrValue = existingQr ?? generateQrValue()
    const existingBar = employee?.identifications.find((i) => i.method === 'barcode')?.value
    const barValue = existingBar ?? generateBarcodeValue(takenBarcodes(employees))
    const existingFace = employee?.identifications.find((i) => i.method === 'face')
    const identifications = (Object.keys(methods) as IdentificationMethod[]).map((method) => {
      if (method === 'face') {
        // Face samples come from the enrollment dialog; here only on/off can change.
        return existingFace?.descriptors?.length
          ? { ...existingFace, enabled: methods.face }
          : { method, enabled: false }
      }
      return {
        method,
        enabled: methods[method],
        value: method === 'qr' ? qrValue : method === 'barcode' ? barValue : undefined,
      }
    })

    const payload = {
      branchId: form.branchId,
      employeeNumber: form.employeeNumber,
      firstName: form.firstName.trim(),
      lastNamePaternal: form.lastNamePaternal.trim(),
      lastNameMaternal: form.lastNameMaternal.trim() || undefined,
      position: form.position,
      department: form.department,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      hireDate: form.hireDate,
      status: form.status,
      scheduleId: form.scheduleId,
      identifications,
      pin: form.pin.trim() || undefined,
      curp: form.curp.trim() || undefined,
      address: form.address.trim() || undefined,
      emergencyContact: form.emergencyName.trim()
        ? {
            name: form.emergencyName.trim(),
            relationship: 'Contacto de emergencia',
            phone: form.emergencyPhone.trim(),
          }
        : undefined,
    }

    if (employee) {
      updateEmployee(employee.id, payload, currentUser)
      toast.success('Empleado actualizado', `${payload.firstName} ${payload.lastNamePaternal}`)
      onSaved?.({ ...employee, ...payload, fullName: `${payload.firstName} ${payload.lastNamePaternal}` } as Employee)
    } else {
      const created = addEmployee(payload, currentUser)
      toast.success('Empleado creado', `${created.fullName} · ${created.employeeNumber}`)
      onSaved?.(created)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
          <DialogDescription>
            {employee
              ? 'Actualiza la información del colaborador. Los cambios quedan registrados en auditoría.'
              : 'Registra un nuevo colaborador y define cómo registrará su asistencia.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información personal */}
          <div className={SECTION}>
            <p className={SECTION_TITLE}>Información personal</p>
            <div className="flex items-center gap-4">
              <Avatar
                name={`${form.firstName} ${form.lastNamePaternal}`.trim() || 'Nuevo empleado'}
                size="xl"
              />
              <div className="text-xs text-muted-foreground">
                La foto se sincroniza desde el reloj checador la primera vez que el empleado registra
                su rostro. Por ahora se usa un avatar con iniciales.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Número de empleado">
                <Input value={form.employeeNumber} onChange={(e) => set({ employeeNumber: e.target.value })} />
              </Field>
              <Field label="Nombre(s)" required>
                <Input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
              </Field>
              <Field label="Apellido paterno" required>
                <Input
                  value={form.lastNamePaternal}
                  onChange={(e) => set({ lastNamePaternal: e.target.value })}
                />
              </Field>
              <Field label="Apellido materno">
                <Input
                  value={form.lastNameMaternal}
                  onChange={(e) => set({ lastNameMaternal: e.target.value })}
                />
              </Field>
              <Field label="Teléfono">
                <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="Correo electrónico">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {/* Información laboral */}
          <div className={SECTION}>
            <p className={SECTION_TITLE}>Información laboral</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Puesto">
                <SelectWithCustom
                  value={form.position}
                  onChange={(v) => set({ position: v })}
                  options={positionOptions}
                  placeholder="Escribe el puesto"
                />
              </Field>
              <Field label="Departamento">
                <SelectWithCustom
                  value={form.department}
                  onChange={(v) => set({ department: v })}
                  options={departmentOptions}
                  placeholder="Escribe el departamento"
                />
              </Field>
              <Field label="Sucursal" required>
                <Select
                  value={form.branchId}
                  onValueChange={(v) => set({ branchId: v })}
                  options={allBranches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Field>
              <Field label="Fecha de ingreso">
                <Input
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => set({ hireDate: e.target.value })}
                />
              </Field>
              <Field label="Estado">
                <Select
                  value={form.status}
                  onValueChange={(v) => set({ status: v as Employee['status'] })}
                  options={[
                    { value: 'active', label: 'Activo' },
                    { value: 'inactive', label: 'Inactivo' },
                  ]}
                />
              </Field>
            </div>
          </div>

          {/* Horario */}
          <div className={SECTION}>
            <p className={SECTION_TITLE}>Horario</p>
            <Field label="Asignar horario" required>
              <Select
                value={form.scheduleId}
                onValueChange={(v) => set({ scheduleId: v })}
                options={schedules.map((s) => ({
                  value: s.id,
                  label: `${s.name} · ${s.weeklyTargetHours} h/semana`,
                }))}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              ¿Necesitas una jornada distinta? Crea un horario personalizado desde{' '}
              <span className="font-medium text-foreground">Horarios → Nuevo horario</span> y
              asígnalo aquí.
            </p>
          </div>

          {/* Identificación */}
          <div className={SECTION}>
            <p className={SECTION_TITLE}>Métodos de identificación</p>
            <div className="space-y-2">
              {(Object.keys(METHOD_LABELS) as IdentificationMethod[]).map((method) => {
                const meta = METHOD_LABELS[method]!
                return (
                  <div
                    key={method}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <meta.Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{meta.label}</span>
                      {meta.soon ? <Badge variant="muted">Próximamente</Badge> : null}
                      {method === 'face' && !hasFace ? (
                        <span className="text-xs text-muted-foreground">Se registra desde el perfil</span>
                      ) : null}
                    </div>
                    <Switch
                      checked={method === 'face' ? hasFace && methods.face : methods[method]}
                      disabled={meta.soon || method === 'employee_number' || (method === 'face' && !hasFace)}
                      onCheckedChange={(v) => setMethods((m) => ({ ...m, [method]: v }))}
                    />
                  </div>
                )
              })}
            </div>
            {methods.pin ? (
              <Field label="PIN (4 dígitos)">
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ej. 4820"
                  className="max-w-[140px]"
                />
              </Field>
            ) : null}
          </div>

          {/* Adicional */}
          <details className="rounded-xl border border-border bg-secondary/30 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Información adicional <span className="font-normal text-muted-foreground">(opcional)</span>
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="CURP">
                <Input value={form.curp} onChange={(e) => set({ curp: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Dirección">
                <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <Field label="Contacto de emergencia">
                <Input
                  value={form.emergencyName}
                  onChange={(e) => set({ emergencyName: e.target.value })}
                />
              </Field>
              <Field label="Teléfono de emergencia">
                <Input
                  value={form.emergencyPhone}
                  onChange={(e) => set({ emergencyPhone: e.target.value })}
                />
              </Field>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>{employee ? 'Guardar cambios' : 'Crear empleado'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  )
}

function blank(employeeNumber: string, hireDate: string, branchId?: string, scheduleId?: string) {
  return {
    employeeNumber,
    firstName: '',
    lastNamePaternal: '',
    lastNameMaternal: '',
    phone: '',
    email: '',
    position: POSITIONS[4] as string,
    department: DEPARTMENTS[2] as string,
    branchId: branchId ?? '',
    hireDate,
    status: 'active' as Employee['status'],
    scheduleId: scheduleId ?? '',
    pin: '',
    curp: '',
    address: '',
    emergencyName: '',
    emergencyPhone: '',
  }
}
