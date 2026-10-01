# Base de datos (Supabase)

## Orden de instalación

Ejecuta en el **SQL Editor** de tu proyecto de Supabase, en este orden y una sola vez cada una:

1. `schema.sql` — tablas, alta de empresa y políticas base.
2. `migrations/002_roles_correcciones.sql` — roles (propietario, administrador, RRHH, supervisor, empleado), alcance por sucursal/departamento, solicitudes de corrección, auditoría y reglas de seguridad (RLS).
3. `migrations/003_biometricos_solo_admin.sql` — solo propietario y administrador pueden registrar, actualizar o borrar rostros.
4. `migrations/004_suscripciones.sql` — plan, estado de la suscripción y bitácora de pagos por empresa (Fase 1 del reemplazo del servidor de licencias; la app todavía no la usa, ver `docs/ESTADO.md`).
5. `migrations/005_sucursales_coordenadas.sql` — latitud/longitud de cada sucursal, para que el reloj checador muestre la ubicación real registrada en vez de depender del GPS del dispositivo.

Las migraciones se pueden volver a correr sin dañar nada.

## Verificación

Después de correrlas:

- **Authentication → Users:** crea un usuario y entra con él en la app; el alta de empresa crea su perfil de propietario.
- Con un usuario de **RRHH**, intenta registrar un rostro: la app ya no muestra el botón, y si se intenta por API la base rechaza el cambio.
- Con un usuario **empleado**, comprueba que solo ve su propia asistencia.

## Datos biométricos: qué se guarda y quién lo lee

- Solo se guarda una lista de 128 números por muestra del rostro (nunca fotografías), dentro de `employees.identifications`.
- El reconocimiento se hace en el navegador del reloj, por lo que **la sesión que abre el reloj debe poder leer las plantillas de todos los empleados** (propietario, administrador o RRHH). Usa una cuenta dedicada para el equipo del reloj, con contraseña propia, y no la de una persona.
- Un supervisor o un empleado puede leer las plantillas de las personas que ya puede ver, porque viven en la misma fila. Si esto es un problema para tu cliente, mantén el rol de supervisor solo donde sea necesario.
- Pide el consentimiento por escrito de cada empleado (hay una plantilla en `docs/legal/`).

## Respaldos

Activa los respaldos automáticos de Supabase (Project Settings → Database → Backups; el plan Pro incluye respaldos diarios) antes de tener clientes reales.
