# Base de datos (Supabase)

## Orden de instalación

Ejecuta en el **SQL Editor** de tu proyecto de Supabase, en este orden y una sola vez cada una:

1. `schema.sql` — tablas, alta de empresa y políticas base.
2. `migrations/002_roles_correcciones.sql` — roles (propietario, administrador, RRHH, supervisor, empleado), alcance por sucursal/departamento, solicitudes de corrección, auditoría y reglas de seguridad (RLS).
3. `migrations/003_biometricos_solo_admin.sql` — solo propietario y administrador pueden registrar, actualizar o borrar rostros.
4. `migrations/004_suscripciones.sql` — plan, estado de la suscripción y bitácora de pagos por empresa (Fase 1 del reemplazo del servidor de licencias; la app todavía no la usa, ver `docs/ESTADO.md`).
5. `migrations/005_sucursales_coordenadas.sql` — latitud/longitud de cada sucursal, para que el reloj checador muestre la ubicación real registrada en vez de depender del GPS del dispositivo.
6. `migrations/006_integracion_google_drive.sql` — tabla donde cada empresa guarda su propia conexión a Google Drive (ver § Integraciones más abajo).
7. `migrations/007_empleados_rfc.sql` — RFC opcional de cada empleado, que se imprime en su gafete junto al QR y al número de empleado.
8. `migrations/008_portal_empleado.sql` — portal del empleado: entrar desde el celular con código de empresa + número de empleado + PIN, checar con foto y pedir vacaciones. Requiere antes `patches/NX01_fotos_entrada.sql`. Al terminar, el código de tu empresa aparece en **Configuración → Portal de empleados**.
9. `migrations/009_borrado_fotos_90_dias.sql` — borrado automático de las fotos de checada pasado el plazo de la empresa.
10. `migrations/010_portal_bloqueo_progresivo_y_topes.sql` — portal del empleado: bloqueo progresivo por intentos y topes.
11. `migrations/011_cuenta_reloj_checador.sql` — rol «Reloj checador (tablet)» para la cuenta dedicada de la tablet.
12. `migrations/012_borrar_rostros_motor_anterior.sql` — **una sola vez, al cambiar a Human**: borra las muestras de rostro del motor anterior (ya no se pueden comparar). Esos empleados quedan como «No registrado» y registran su rostro de nuevo. No toca los rostros ya registrados con Human.

Las migraciones se pueden volver a correr sin dañar nada.

## Verificación

Después de correrlas:

- **Authentication → Users:** crea un usuario y entra con él en la app; el alta de empresa crea su perfil de propietario.
- Con un usuario de **RRHH**, intenta registrar un rostro: la app ya no muestra el botón, y si se intenta por API la base rechaza el cambio.
- Con un usuario **empleado**, comprueba que solo ve su propia asistencia.

## Portal del empleado: cómo está protegido

El empleado no tiene cuenta de Supabase. Todo pasa por las funciones `employee_portal_*` de la migración 008, que el navegador llama sin sesión:

- `employee_portal_login` comprueba código de empresa, número y PIN, y entrega una llave de sesión de 12 horas (en la base solo se guarda su huella). Cinco intentos fallidos bloquean a ese empleado 15 minutos.
- Con esa llave, las demás funciones solo leen y escriben lo de **ese** empleado: su día de hoy, sus registros recientes y sus solicitudes de vacaciones.
- Cada movimiento exige una foto tomada en ese momento y se compara con la hora del servidor (±5 minutos): cambiar el reloj del teléfono no sirve para checar a otra hora.
- Las tablas `employee_portal_sessions` y `employee_portal_attempts` no son legibles desde el navegador.
- Para apagarlo: **Configuración → Portal de empleados**. El reloj checador no se ve afectado.

## Datos biométricos: qué se guarda y quién lo lee

- Solo se guarda una lista de 128 números por muestra del rostro (nunca fotografías), dentro de `employees.identifications`.
- El reconocimiento se hace en el navegador del reloj, por lo que **la sesión que abre el reloj debe poder leer las plantillas de todos los empleados** (propietario, administrador o RRHH). Usa una cuenta dedicada para el equipo del reloj, con contraseña propia, y no la de una persona.
- Un supervisor o un empleado puede leer las plantillas de las personas que ya puede ver, porque viven en la misma fila. Si esto es un problema para tu cliente, mantén el rol de supervisor solo donde sea necesario.
- Pide el consentimiento por escrito de cada empleado (hay una plantilla en `docs/legal/`).

## Respaldos

Activa los respaldos automáticos de Supabase (Project Settings → Database → Backups; el plan Pro incluye respaldos diarios) antes de tener clientes reales.

## Integraciones: respaldo diario a Google Drive

Cada empresa puede conectar su propio Google Drive desde **Configuración → Integraciones** para
recibir ahí, una vez al día, un CSV con la asistencia del día anterior. Son 4 pasos de puesta en
marcha, uno solo por proyecto (no por cliente):

### 1. Crea la credencial OAuth en Google Cloud Console

1. Entra a [console.cloud.google.com](https://console.cloud.google.com), crea un proyecto (o usa uno existente).
2. **APIs y servicios → Biblioteca**: activa la **Google Drive API**.
3. **APIs y servicios → Pantalla de consentimiento OAuth**: tipo "Externo", agrega tu correo como
   contacto, y en "Público objetivo" agrega los correos de las empresas que vayan a probarlo mientras
   la app esté en modo prueba (o pide verificación a Google cuando tengas clientes reales — los
   scopes que se piden, `drive.file` y `userinfo.email`, no la requieren para un número pequeño de
   usuarios).
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo
   "Aplicación web". En "URIs de redirección autorizados" agrega:
   - `http://localhost:5173/integraciones/google/callback` (para probar en tu máquina)
   - `https://<tu-dominio-en-vercel>/integraciones/google/callback` (el real, una vez desplegado)
5. Copia el **Client ID** y el **Client secret** que te da Google.

### 2. Configura las variables de entorno

- **Vercel / `.env.local`** (público, va al navegador): `VITE_GOOGLE_CLIENT_ID` = el Client ID.
- **Supabase → Edge Functions → Manage secrets** (privado, nunca al navegador):
  - `GOOGLE_CLIENT_ID` = el mismo Client ID.
  - `GOOGLE_CLIENT_SECRET` = el Client secret.

### 3. Despliega las dos Edge Functions

No hace falta la CLI de Supabase: en el dashboard, **Edge Functions → Deploy a new function**,
dale el nombre exacto de la carpeta y pega el contenido de su `index.ts`:

- `google-drive-oauth-exchange` ← `supabase/functions/google-drive-oauth-exchange/index.ts`
- `daily-google-drive-export` ← `supabase/functions/daily-google-drive-export/index.ts`

### 4. Programa el respaldo diario

En el **SQL Editor**, una sola vez (ajusta `TU-PROYECTO` a la referencia de tu proyecto, visible en
la URL del dashboard, y pon tu `service_role key` donde dice `TU-SERVICE-ROLE-KEY` — Project
Settings → API):

```sql
select cron.schedule(
  'nexotime-daily-google-drive-export',
  '0 10 * * *', -- 10:00 UTC = 4:00 am Ciudad de México
  $$
  select net.http_post(
    url := 'https://TU-PROYECTO.supabase.co/functions/v1/daily-google-drive-export',
    headers := jsonb_build_object('Authorization', 'Bearer TU-SERVICE-ROLE-KEY')
  );
  $$
);
```

(Si `cron` o `net` no existen todavía: **Database → Extensions**, activa `pg_cron` y `pg_net` antes
de correr lo anterior.)

Con eso, cualquier empresa puede ir a Configuración → Integraciones → "Conectar con Google Drive" y
quedar recibiendo su respaldo diario sin que tú hagas nada más por esa empresa.
