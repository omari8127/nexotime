# NX01 — Reconocimiento facial mejorado y foto de evidencia de entrada

**Incremental acumulativo de NexoTime. 7 de octubre de 2026.**

Se aplica directamente sobre el `nexotime.zip` original que proporcionaste. También puede aplicarse sobre el proyecto completo con las mejoras faciales de la entrega anterior. No necesitas instalar aquella entrega primero.

El ZIP contiene únicamente archivos nuevos/modificados y esta guía. No incluye `.env`, credenciales, `node_modules`, modelos duplicados ni el resto del programa.

## Cambios

### 1. Reconocimiento facial mejorado — incluido

- La cámara solicita HD como preferencia y reintenta restricciones compatibles si el navegador las rechaza. Intenta controles continuos de enfoque, exposición y balance de blancos cuando están disponibles.
- No da por lista una cámara que todavía no entrega video. Permite reintentar y alternar preferencia frontal/trasera.
- Cada análisis usa una imagen fija, para que detección, puntos, descriptor y evaluación de calidad correspondan al mismo instante.
- El reloj exige tres imágenes coincidentes para equilibrado/estricto y cuatro para cámara básica. No cuenta un cuadro congelado como otra confirmación. No promedia identidades diferentes para fabricar una coincidencia.
- Orientación por luz, encuadre, desenfoque y píxeles reales del rostro. El zoom no aumenta el detalle real.
- Registro con cinco poses y tres cuadros por muestra, comprobación contra los demás candidatos y guardado solo después de pasar la prueba. Un intento fallido conserva el registro anterior.
- Compatibilidad de inicio con CPU cuando WebGL falla; puede ser más lenta.
- Se preservan los umbrales de distancia existentes: no se aumentaron para forzar reconocimientos. El perfil básico heredado es más permisivo y requiere validación con personas no registradas.
- Se retira el porcentaje ficticio de certeza de las pantallas modificadas.

### 2. Foto de entrada por número de empleado/PIN

Flujo: elegir entrada → número/PIN según configuración existente → confirmación → cámara → cuenta regresiva con un solo rostro visible y calidad utilizable → guardado de entrada y evidencia.

- Se toma la foto **justo antes de guardar la entrada**, después de identificar el número y validar el PIN cuando está habilitado.
- La fotografía debe provenir de la cámara. No se ofrece adjuntar un archivo. Se requiere una cara detectada, suficiente detalle y luz; esto NO compara su identidad con el número escrito.
- No se permite continuar sin foto cuando la cámara falla, está bloqueada o no entrega una imagen utilizable. Se puede reintentar, cambiar cámara o cancelar.
- Si falla la escritura local de la foto o de la cola pendiente, no se confirma la entrada.
- La evidencia queda ligada al empleado, día y hora de captura. Se usa JPEG con lado máximo de 640 píxeles y límite de 180000 caracteres del archivo codificado.
- La foto se consulta en **Asistencia → detalle del registro → Ver foto de evidencia**. Solo se carga al solicitarla, con el alcance de asistencia del usuario. En servidor se controla por empresa y empleado mediante RLS; no se usa una URL pública.
- La corrección manual del horario conserva la referencia a la fotografía original y su fecha de captura.
- Se informa en pantalla que la fotografía se guarda. Se actualizan los textos que afirmaban que todas las fotos desaparecían.
- Solo se exige esta evidencia en **entradas por número/PIN**. Salidas y movimientos de comida conservan su flujo; QR, barras y reconocimiento facial conservan su tratamiento de vista previa temporal.
- Si varios números de empleado tienen la misma parte numérica, el teclado ya no elige arbitrariamente al primero: solicita revisar la numeración o usar la credencial.

**Alcance real:** la fotografía es evidencia para revisión y disuasión. No demuestra por sí sola que la persona sea dueña del número y no bloquea automáticamente a alguien que conozca el PIN ajeno. Tampoco es una prueba de vida certificada. La detección de cara de este flujo no crea una plantilla biométrica nueva.

### 3. Guardado y sincronización

- Las fotografías pendientes se guardan en IndexedDB del navegador, por separado de los registros y de `localStorage`.
- Antes de mostrar éxito, se conserva la fotografía y una cola durable con la referencia de la entrada.
- Sin red, entrada/foto quedan **pendientes en ese dispositivo**. No están aún disponibles desde otra computadora.
- Al volver la conexión, una función SQL guarda evidencia y asistencia en la misma transacción. Si falla, no deja media operación confirmada en el servidor. La fotografía local se elimina únicamente después de recibir confirmación del servidor.
- Las fotos no se cargan dentro de la consulta general de 5000 registros del programa; se consultan bajo demanda. Se almacenan en una tabla separada de Postgres, no en un bucket público.
- Se evita que reintentos simultáneos borren la revisión más nueva de la cola. Un rechazo de servidor de un registro con foto permanece pendiente y visible para revisión, en lugar de desaparecer después de varios intentos.
- Las checadas normales también pasan primero por la cola de asistencia para que una salida posterior no quede detrás de una entrada pendiente vieja.
- Las evidencias recibidas son inmutables para el cliente: no se conceden permisos de actualizar/borrar fotos a `authenticated`.

## Aplicación

1. **Respalda el código y los datos.** Antes de cambiar de versión, deja sincronizar las checadas pendientes de todos los equipos con el sistema anterior. Las entradas antiguas todavía en cola, sin foto, no deben quedar esperando mientras se activa la nueva regla de servidor.
2. Copia el contenido del ZIP dentro de la raíz del proyecto, donde está `package.json`. Acepta reemplazar los archivos coincidentes. No borres carpetas ni sustituyas tu `.env`.
3. **Modo real/Supabase:** con `schema.sql` y la migración `002_roles_correcciones.sql` ya instalados, ejecuta en SQL Editor:
   - `supabase/patches/NX01_fotos_entrada.sql`
   - `supabase/patches/NX01_verificar_instalacion.sql`
4. El segundo script debe mostrar: tabla con RLS activo; `false` en los tres permisos de anónimo/edición/borrado; dos funciones `security_invoker=true`; políticas SELECT/INSERT; trigger `attendance_photo_required` habilitado. No muestra fotografías ni datos personales.
5. Desde la raíz del proyecto:

```sh
npm ci
node scripts/verify-face.mjs
node --experimental-vm-modules scripts/verify-NX01.mjs
npm run build
```

6. Publica el frontend compilado con tu procedimiento habitual. Conserva todos los modelos en `public/models` / `dist/models`. **Recarga todos los relojes**, incluida la tablet; no dejes una versión antigua intentando checar después de activar la regla SQL.
7. Usa HTTPS y permite la cámara. Una IP remota abierta por HTTP puede no ofrecer acceso a cámara. Si faltan modelos por primera descarga o por caché vacía, el reconocimiento/captura guiada necesitará conexión para cargarlos.
8. En modo demo, las fotos quedan en ese navegador para la demostración; la asistencia demo sigue siendo temporal. El uso real compartido requiere Supabase y el parche SQL.

El parche SQL es idempotente para repetir su instalación. Se incluye como SQL de aplicación manual, siguiendo el modo de instalación que ya documenta este proyecto: el CLI no estaba disponible y su descarga devolvió HTTP 403. No se ha añadido un historial de migración de CLI.

## Prueba dirigida en la tablet

- Entrada por número con PIN habilitado: PIN incorrecto no debe abrir la captura; con PIN correcto, mostrar aviso y cuenta regresiva. Confirmar empleado/fecha/hora y abrir su fotografía en asistencia.
- Negar permiso de cámara: debe ofrecer reintento/cancelación y no crear entrada. Probar cámara ocupada y desconectada.
- Dos caras, cara fuera de encuadre o poca luz: no confirmar hasta obtener una imagen utilizable. La detección no garantiza localizar todas las caras de todas las escenas.
- Desconectar internet después de cargar el sistema y los modelos: checar, recargar y confirmar que el registro sigue pendiente; reconectar y consultar la foto desde otro equipo autorizado.
- Simular almacenamiento lleno/bloqueado: no debe informar éxito sin guardar la evidencia.
- Probar doble clic/reintento, salida posterior y corrección manual de horario: una entrada válida, foto conservada y cola con la última versión.
- Desde otra empresa o un supervisor sin alcance sobre ese empleado, no debe ser posible consultar la foto. Un empleado tiene acceso únicamente a su propia asistencia conforme a las políticas existentes.
- Verificar también rostros inscritos/no inscritos y personas parecidas en reconocimiento facial, tanto en la tablet como en la computadora.

## Validación ejecutada

- **29 comprobaciones faciales correctas**, `scripts/verify-face.mjs`.
- **24 comprobaciones NX01 correctas**, `scripts/verify-NX01.mjs`. Ejecutan el store, reglas de asistencia, cola y adaptador API reales con almacenamiento/red simulados: validación de fotos, exigencia de evidencia, almacenamiento lleno, cola dañada, duplicados, empleados inactivos/fuera de alcance, doble envío, cambio de sesión, salida/corrección, pérdida de red, rechazos y limpieza posterior a confirmación remota.
- **21 archivos TypeScript/TSX modificados o añadidos** revisados por transpilación/sintaxis: sin errores.
- Comparación del incremental contra el ZIP original: únicamente los archivos enumerados al final. Sin cambios a `package.json`, versiones ni `package-lock.json`.

**Pendiente antes de producción:** build completo/Vitest, ejecución del SQL y sus permisos en un entorno real, prueba visual y cámara física. Las descargas npm devolvieron HTTP 403; no se sustituyeron dependencias por otras versiones. No se dispuso de servidor PostgreSQL local ni conexión a tu base de datos para ejecutar el SQL. Las pruebas simuladas no acreditan la precisión biométrica, la compatibilidad de IndexedDB en tu tablet ni el resultado de las políticas en tu servidor.

## Notas operativas

- No borres los datos del navegador mientras haya checadas/fotos pendientes. IndexedDB y la cola local dependen del almacenamiento de ese equipo; limpiar el sitio o perder el dispositivo puede perder datos no sincronizados.
- El administrador debe vigilar pendientes/rechazos antes de dar por consolidada la asistencia. Si falta aplicar SQL o falla un permiso, las nuevas entradas con foto permanecerán pendientes hasta corregirlo.
- No se ha implantado un borrado automático de fotos. La empresa debe definir su plazo de conservación y gestionar el acceso al equipo; las fotos consumen almacenamiento de base de datos y requieren respaldo. Eliminar una empresa o empleado conserva el comportamiento de cascada configurado en el esquema y elimina sus fotos asociadas.
- Se conservan los PIN existentes y la configuración que decide si se exigen. Para reducir suplantaciones, conviene habilitar PIN individual y revisar la evidencia. Automatizar la comparación rostro contra número sería otro control distinto de esta fotografía.
- No se promete reconocimiento perfecto en cualquier cámara. Si no hay detalle suficiente, el software no puede reconstruir una identidad fiable. Los rechazos deben atenderse con supervisión y el procedimiento de corrección autorizado existente.

## Alcance

Cambios locales en captura, registro por número, reconocimiento facial, detalle de asistencia y avisos; cambio compartido de cámara y cola de asistencia. **Sí hay cambios de backend/SQL:** tabla de evidencias, políticas, función transaccional y trigger. No se ejecutaron sobre tu servidor. No se modifica la lógica de cálculo de nómina, horarios, reportes, licencias ni el catálogo de empleados.

Commit sugerido:

```text
feat(clock): evidencia fotográfica de entrada y reconocimiento facial robusto
```

## Archivos modificados y nuevos

### Modificados

- `docs/legal/aviso-de-privacidad.md`
- `src/components/attendance/AttendanceDetailDialog.tsx`
- `src/components/clock/FaceScanFlow.tsx`
- `src/components/clock/FaceViewport.tsx`
- `src/components/clock/NumberPinFlow.tsx`
- `src/components/employees/FaceEnrollDialog.tsx`
- `src/components/settings/KioskSettingsPanel.tsx`
- `src/hooks/useCameraStream.ts`
- `src/lib/camera.ts`
- `src/lib/face.test.ts`
- `src/lib/face.ts`
- `src/pages/clock/ClockPage.tsx`
- `src/pages/legal/LegalPages.tsx`
- `src/services/live/liveApi.ts`
- `src/services/live/syncQueue.ts`
- `src/store/dataStore.ts`
- `src/types/index.ts`

### Nuevos

- `scripts/verify-NX01.mjs`
- `scripts/verify-face.mjs`
- `src/components/attendance/AttendancePhotoPanel.tsx`
- `src/components/clock/EntryPhotoFlow.tsx`
- `src/lib/faceSession.ts`
- `src/lib/photoEvidence.ts`
- `src/services/evidence/localPhotos.ts`
- `supabase/patches/NX01_fotos_entrada.sql`
- `supabase/patches/NX01_verificar_instalacion.sql`

Esta guía (`NX01_CAMBIOS.md`) también se incluye en el ZIP.

Referencias técnicas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [RPC](https://supabase.com/docs/reference/javascript/rpc), [cámara y contexto seguro](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
