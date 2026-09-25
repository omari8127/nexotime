# NEXOTIME — Control de Asistencia y Reloj Checador

Demo funcional de un sistema SaaS independiente para control de asistencia,
horarios y registro de empleados en empresas de México.

> **No** es un POS ni un sistema de ventas/inventario. Producto autónomo.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 3 (tokens tipo shadcn/ui, tema claro/oscuro)
- Framer Motion (animaciones sutiles), Recharts (gráficas), Zustand (estado)
- Lucide Icons · date-fns
- Sin backend: datos mock deterministas. La arquitectura está lista para
  conectar Supabase o una API propia reemplazando `src/services/*` y
  `src/store/dataStore.ts`.

## Arranque

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # verificación de tipos + build de producción
npm run lint
```

## Dos experiencias

| Ruta | Para quién | Descripción |
|------|-----------|-------------|
| `/` (y resto del panel) | Dueño, RH, Administrador, Supervisor | Panel administrativo con sidebar |
| `/clock` | Empleado (tablet en recepción) | Reloj checador a pantalla completa, sin acceso al panel |
| `/bienvenida`, `/onboarding` | Primera vez | Bienvenida + asistente de configuración (se puede omitir) |

El empleado **no** puede entrar al panel desde el reloj checador.

## Cómo demostrarlo

1. Omitir el onboarding → Dashboard.
2. `/clock` en otra pestaña → Escanear QR → *Simular lectura QR* → identifica a
   **Juan Pérez López** (aún sin entrada hoy) → **Registrar entrada**.
3. Volver al Dashboard: la entrada de Juan aparece en *Actividad en tiempo real*
   y sube el contador de *Presentes hoy*.
4. **Empleados → Juan Pérez** → pestaña Asistencia → abrir un día → **Corregir
   registro** → se recalculan horas/estado y queda un evento en **Auditoría**
   (antes → después + motivo + usuario + fecha).
5. **Reportes** → elegir tipo y periodo → **Exportar CSV** (funcional) /
   **Excel** (descarga compatible, `.xlsx` nativo queda para la versión
   conectada).
6. Cambiar de rol desde el menú de perfil (abajo en el sidebar): como
   **Supervisor** el menú se reduce y los datos se limitan a su sucursal.

## Arquitectura

```
src/
  components/   ui (primitivas), shared, dashboard, employees, attendance,
                schedules, clock
  pages/        una por ruta · pages/clock para el reloj checador
  layouts/      AdminLayout (sidebar + topbar)
  services/     biometricService (STUB), exportService, reportService
  store/        dataStore (fuente única, escribe auditoría en cada cambio),
                uiStore (tema, sidebar, filtro de sucursal, onboarding)
  hooks/        useScopedData (multi-sucursal + permisos), useLiveClock, ...
  lib/          attendance.ts (cálculos puros), week.ts, utils.ts
  data/         catalog, names, roles, mock (generador determinista con semilla)
  types/        modelo de dominio multi-tenant
```

### Multi-tenant desde el día 1

Todas las entidades del cliente llevan `companyId`; las de sucursal llevan
`branchId`. `useScopedData` filtra por la empresa y por las sucursales
asignadas al usuario. Conceptos listos: `Company`, `Branch`, `User`, `Role`,
`Employee`, `Schedule`, `AttendanceRecord`, `Device`, `AuditLog`.

### Cálculos (`src/lib/attendance.ts`)

`calculateWorkedHours`, `calculateWeeklyHours`, `calculateOvertime`,
`calculateLateMinutes`, `calculateMissingHours`, `getAttendanceStatus`,
`detectNextPunch`. La hora de comida no cuenta como trabajada. El objetivo
semanal es **configurable** (40/42/44/45/46/48…), nunca fijo.

### Cumplimiento LFT (reforma de registro de jornada, vigente 1 ene 2027)

- Cada semana se clasifica automáticamente en **horas ordinarias**, **extra
  dobles (200%, primeras 9 h/semana)** y **extra triples (300%, excedente)**
  conforme a los Art. 66-68 LFT (`splitOvertimeLFT` en `src/lib/attendance.ts`).
- Alerta en el Dashboard y badge "Revisar cumplimiento" cuando un empleado
  supera las 16 h extra/semana de referencia.
- **Configuración → Cumplimiento LFT**: resume la reforma, multas de la STPS
  y cómo NEXOTIME genera evidencia.
- **Reportes → Evidencia legal (LFT)** y el botón **Evidencia legal** en el
  perfil de cada empleado generan un documento consultable (folio, periodo,
  desglose diario y semanal) exportable a CSV/impresión — pensado para un
  requerimiento de la autoridad.

### Incidencias (vacaciones, permisos, incapacidades)

Registro de ausencias justificadas (`src/store/dataStore.ts` → `addIncidencia`)
desde **Asistencia** o desde el perfil del empleado. Un día cubierto por una
incidencia aprobada no cuenta como falta ni dispara alertas — inspirado en
cómo Buk/Runa integran incapacidades y permisos junto al registro de
asistencia.

### Notificaciones y autoservicio

- **Campanita** en la barra superior (todas las páginas del panel) con las
  mismas alertas del Dashboard — `useComplianceAlerts`.
- **Reloj checador**: botón "Ver mi semana" tras identificarse, para que el
  empleado consulte sus horas/retardos sin entrar al panel administrativo.
- **Modo sin conexión**: el reloj checador sigue registrando localmente si se
  pierde la red y sincroniza (con aviso) al reconectar — común en tablets de
  bodega/tienda con wifi poco confiable.

### Reconocimiento facial

Solo simulación visual. `src/services/biometricService.ts` expone la interfaz
final (`verifyFace`, `registerFace`, `deleteFaceData`) devolviendo datos mock.
Al conectar un proveedor real de biometría + liveness, solo se reemplaza esa
implementación.

## Pendiente para producción (fuera del alcance de la demo)

Reconocimiento facial real, liveness, integración con nómina, API pública, app
móvil, notificaciones, geolocalización, generación real de `.xlsx`,
autenticación y persistencia.
