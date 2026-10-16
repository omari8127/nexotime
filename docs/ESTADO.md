# Estado del producto y pendientes antes de vender

Última revisión: 28/09/2026.

## Listo

- Reloj checador con rostro, QR, código de barras y número + PIN; registro automático con cancelación; anti-duplicados.
- Panel: roles y alcance, empleados, credenciales, horarios, incidencias, correcciones, auditoría, reportes CSV/Excel, cumplimiento LFT.
- Licencias: activación, vínculo al dispositivo, firma, tolerancia sin Internet, suspensión, planes, panel del propietario, respaldos (`npm run backup`), 18 pruebas automáticas.
- La app abre sin Internet (service worker) y conserva las checadas hasta poder enviarlas.
- Seguridad de datos biométricos: solo administración, también a nivel de base de datos (migración 003).
- Integración continua en GitHub (análisis, pruebas, build y pruebas de licencias).
- 41 pruebas automáticas del programa (reglas de asistencia, permisos por rol, credenciales, coincidencia facial, exportación) y 18 del servidor de licencias.
- Pantalla de error amable si algo falla (nunca queda en blanco) y configuración de publicación lista (`public/_headers`, `_redirects`, `vercel.json`).
- Monitoreo de errores en los equipos de los clientes, en tu propio servidor (panel de licencias → Errores), sin servicios de terceros.
- Registro de pagos en el panel de licencias: cada pago renueva la licencia, queda en auditoría y suma a los ingresos.
- Aviso en Empleados para regenerar los QR antiguos en un clic.
- Reporte completo en un solo Excel (8 hojas: resumen, asistencia diaria, resumen por empleado, faltas, retardos, horas extra, incidencias y evidencia LFT), con franjas y filtro automático.
- Importar empleados desde Excel o CSV, con plantilla descargable (usa las sucursales y horarios reales de la empresa) y vista previa fila por fila antes de crear a nadie.
- Importar correcciones de asistencia desde Excel o CSV: se descarga el periodo ya con las horas registradas, se corrige solo lo necesario y se vuelve a subir; una celda vacía nunca borra un dato.
- Lector propio de `.xlsx` en el navegador (sin dependencias): entiende archivos reales guardados por Excel, Google Sheets o LibreOffice.
- Integración con Google Drive (Configuración → Integraciones): cada empresa conecta su propia cuenta y recibe ahí, una vez al día, un CSV con la asistencia del día anterior. Falta la puesta en marcha única del proyecto (ver pendiente #8).
- Sitio público y SEO: páginas de Aviso legal, Privacidad, Términos y Cookies (`/aviso-legal`, `/privacidad`, `/terminos`, `/cookies`) con enlaces en bienvenida, login y registro; aviso de cookies informativo; casilla «acepto» en el registro (guarda la versión aceptada en el usuario); título, descripción, canonical y Open Graph por ruta; `robots.txt` y `sitemap.xml` reales (se generan en cada build); datos estructurados; imagen de vista previa al compartir; íconos PNG; contraste revisado (WCAG AA) y zoom del móvil habilitado.

- Tres accesos desde la página pública: **Administrador** (`/login`), **Empleado** y **Reloj checador** (ambos pasan por «Activar este equipo», `/activar`, donde se elige cómo se usará ese dispositivo).
- **Portal del empleado** (`/empleado`): entra con código de empresa + número de empleado + PIN; registra entrada, comida y salida con foto obligatoria (y comparación de rostro si lo tiene registrado) y ubicación; consulta sus días y pide vacaciones. Requiere la migración `008`.
- **Vacaciones** (`/vacaciones`): las solicitudes del portal llegan como pendientes; se aprueban o rechazan, y se ven los días por ley (Art. 76 LFT), tomados y disponibles de cada persona.
- **Asistencia** con dos vistas: resumen diario por periodo (horas en píldoras de colores) y **registro de checadas** (Entradas / Salidas / Comidas / Todos, con foto, ubicación y medio), ambas con búsqueda por nombre y rango de fechas.
- **Editar día completo**: un administrador agrega, cambia o quita cualquier movimiento de un día en un solo paso, con motivo obligatorio y registro en auditoría; también captura un día que no tenía checadas.
- Gafete vertical (QR grande arriba, RFC e ID debajo) y, en Empleados, cuántas muestras faciales tiene cada persona.
- **Reconocimiento facial con Human** (antes face-api, que su autor archivó en 2025): el reloj ya no se traba buscando la cara (el detector tarda unos milisegundos en vez de 100 ms o más en una tablet). Los límites de «misma persona» se calibraron con fotos reales: con el perfil equilibrado (0.42) ninguna otra persona pasó en la prueba. **Cada empleado debe volver a registrar su rostro una vez**: las muestras del motor anterior no se pueden comparar con las nuevas (Empleados y Configuración → Reloj checador lo marcan como «Registrar de nuevo»). Modelos: BlazeFace y FaceMesh (MediaPipe, Apache-2.0) y FaceRes (Apache-2.0), servidos desde `/models/human` y guardados para funcionar sin Internet.
- **Cierre de periodo** (`/cierre`, propietario, administrador y RH): elige semana, quincena o mes; el sistema revisa que no haya incidencias ni correcciones pendientes, que el periodo ya haya terminado y que no haya checadas sin enviar; muestra por empleado días trabajados, faltas, retardos, horas, extras dobles/triples (Art. 66-68 LFT), vacaciones, incapacidades y permisos; exporta a Excel (portada, resumen en números con horas decimales, detalle día por día e incidencias) o CSV; y **cierra**: guarda una copia de los números y bloquea las checadas de esas fechas, en la app y en la base de datos. Reabrir exige motivo y solo lo hace propietario o administrador; todo queda en auditoría y en el historial. Requiere la migración `016`. Límites conocidos: una quincena que corta una semana solo reparte las horas extra de la parte que cae dentro; aprobar una incidencia después del cierre no se bloquea (la pantalla avisa que los números de hoy ya no coinciden con lo cerrado).
- **Recuperar contraseña** (`/recuperar` y `/nueva-contrasena`): el login tiene «¿Olvidaste tu contraseña?»; se escribe el correo, Supabase manda el enlace y la persona elige una contraseña nueva (mínimo 8 caracteres) y entra directo. La respuesta es la misma exista o no la cuenta, para que nadie descubra quién está registrado. Los empleados no la usan: su PIN lo cambia el administrador. Necesita la configuración del pendiente #15.

## Pendiente — depende de ti (no se puede hacer desde el código)

| # | Pendiente | Por qué importa |
|---|---|---|
| 1 | **Ejecutar en Supabase** `002` y `003` (ver `supabase/README.md`) y probar con usuarios de cada rol | Sin ellas la seguridad por rol solo existe en la interfaz |
| 2 | **Probar en la tablet real**: rostro, código de barras, QR, cámara y luz del lugar | Nunca se probó con cámara real; puede requerir ajustar la exigencia |
| 3 | **Revisión legal** de `docs/legal/` (aviso de privacidad, consentimiento biométrico, términos) — ya actualizados a mano para mencionar la ubicación de cada checada y la foto de verificación momentánea del rostro (no se guarda), pero un abogado debe confirmarlos | Los datos biométricos y de ubicación son sensibles (LFPDPPP) |
| 4 | ~~Desplegar el servidor de licencias~~ — **pausado**: se está migrando a suscripción por cuenta de empresa (ver sección de abajo); no lo despliegues hasta terminar esa migración o quedaría trabajo duplicado | Evita desplegar algo que se va a reemplazar |
| 5 | **Publicar la app** en un hosting con HTTPS (`sw.js` sin caché) con las variables `VITE_*` de producción | Instalación y cámara exigen HTTPS |
| 6 | **Piloto de 2 a 4 semanas** con una empresa de confianza | Detecta problemas reales antes de cobrar |
| 7 | En Empleados, aceptar el aviso «Regenerar códigos» si hay QR antiguos, y reimprimir gafetes | Los QR viejos son fáciles de adivinar |
| 8 | **Puesta en marcha de la integración con Google Drive** (`supabase/README.md` § Integraciones): crear la credencial OAuth en Google Cloud Console, correr la migración `006`, desplegar las dos Edge Functions y programar el cron diario | Mientras no se haga, el botón "Conectar con Google Drive" existe pero no puede completarse |
| 9 | **Completar los datos legales** en `src/data/legal.ts` (`LEGAL_ENTITY`: RFC, domicilio y correo de contacto/ARCO). Mientras estén vacíos, las páginas legales muestran «pendiente de completar». Un abogado debe revisar los textos publicados (aviso legal, privacidad, términos, cookies) | El aviso legal y el de privacidad exigen titular, domicilio y medio para ejercer derechos ARCO |
| 10 | **Pendientes de la web que necesitan tu decisión o datos**: botón de WhatsApp (número y mensaje), analítica (si es Google Analytics, el aviso de cookies debe pasar a aceptar/rechazar), ficha de Google Business, dominio propio (poner `SITE_URL` en Vercel; el sitemap y las vistas previas lo toman solo) y captcha en el registro (Turnstile + Supabase Auth) | Completan la lista de revisión de un sitio profesional |
| 11 | **Ejecutar en Supabase** `migrations/008_portal_empleado.sql` y **probar el portal en un celular real** (cámara, foto, ubicación, PIN equivocado 5 veces) | La cámara no se puede probar en un entorno de desarrollo sin cámara; las reglas de la base sí se probaron (46 comprobaciones en un Postgres de prueba) |
| 12 | **Poner precios y forma de pago reales** en `src/data/pricing.ts` (hoy la página pública dice «Solicita tu cotización» y «transferencia o depósito») | La página pública no inventa precios |
| 13 | **Revisión legal** de que el aviso de privacidad cubre lo nuevo del portal: foto en cada movimiento y ubicación tomada desde el teléfono personal del empleado | Son datos personales sensibles (LFPDPPP) |
| 15 | **Configurar la recuperación de contraseña en Supabase** (Authentication): en *URL Configuration* poner el **Site URL** de la app (hoy `https://nexotime-gbzq.vercel.app`) y agregar en *Redirect URLs* `https://nexotime-gbzq.vercel.app/nueva-contrasena` (y `http://localhost:5173/nueva-contrasena` para pruebas); en *Email Templates → Reset Password* poner el asunto y el texto en español. Para clientes reales, conectar un **correo propio (SMTP)** en *Authentication → SMTP Settings*: el correo gratuito de Supabase solo manda unos pocos al día y puede caer en spam | Sin la URL permitida el enlace del correo no vuelve a la app; sin SMTP propio el correo puede no llegar |
| 14 | **Ejecutar en Supabase** `migrations/016_cierre_de_periodo.sql` y probar un cierre y una reapertura con datos de prueba (`docs/QA-PRUEBAS.md` § 3.6). Preguntar a cada cliente qué sistema de nómina usa (CONTPAQi, NOI, Aspel, Excel): hoy se exporta Excel/CSV genérico | Sin la migración el botón "Cerrar periodo" falla con un error del servidor |

## Migración en curso: de licencia por dispositivo a cuenta de empresa con suscripción

Decisión: en vez de instalar y activar por dispositivo (`license-server/`), cada empresa se
registra en línea y su acceso depende de su plan y su pago, no de un código. Se decidió
migrar ahora porque el servidor de licencias todavía no está desplegado ni ha corrido
ningún piloto — no hay nada que migrar todavía. Valores por defecto usados: 14 días de
prueba gratis, pago registrado a mano al inicio (Stripe/Mercado Pago después), mismos 3
planes (`basico`, `profesional`, `empresa`), sin rol de vendedor por ahora.

- [x] **Fase 1 — Modelo de datos** (`supabase/migrations/004_suscripciones.sql`): columnas
      `plan`, `subscription_status`, `trial_ends_at`, `current_period_end` en `companies`;
      tabla `payments`; protegidas para que solo la llave de servicio (no el cliente) pueda
      cambiarlas.
- [x] **Fase 2** — `PlanGate` (`src/components/subscription/PlanGate.tsx`) reemplazó a
      `LicenseGate` en `App.tsx`. Lee `company.subscription` ya cargada (en vivo o del
      respaldo sin conexión), sin token ni llamada aparte; `trialEndsAt`/`currentPeriodEnd`
      hacen de tolerancia sin Internet. Nota: `LICENSE_ENFORCED` quedó en `false` para no
      bloquear Reportes/Exportación/Rostro/Auditoría mientras no llega la Fase 3.
- [x] **Fase 3** — `useFeature`/`hasFeatureNow`/`FeatureGuard` (`src/lib/license/features.ts`)
      ya leen `company.subscription.plan` en vez del token de licencia; `LICENSE_ENFORCED`
      deja de ser necesario para esto. Probado con `src/lib/license/features.test.ts`
      (básico/profesional/empresa y que la demo siga sin restricciones).
- [x] **Fase 4** — Pestaña "Plan y pago" en Configuración (`src/components/settings/SubscriptionPanel.tsx`,
      solo lectura, reemplaza a "Licencia"), con historial de pagos. Para registrar un pago a
      mano: `npm run record-payment -- --email correo@cliente.com --amount 2400` (ver
      `scripts/record-payment.js`). Requiere `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`
      (nunca con prefijo `VITE_`).
- [x] **Fase 5** — Confirmado contra Supabase real (no solo en teoría): se creó una empresa
      de prueba por `/signup` y nació con `plan: basico`, `subscription_status: trialing`,
      `trial_ends_at` exactamente 14 días después de `created_at` — sin tocar
      `create_company_and_owner`, solo por los valores por defecto de la Fase 1. De paso se
      probó `PlanGate` de punta a punta contra la base real: bloquea con "Cuenta cancelada"
      al poner `subscription_status: canceled`, y "Ya pagué, reintentar" la desbloquea sin
      recargar la página en cuanto el estado vuelve a `trialing`/`active`. Empresa y usuario
      de prueba ya se borraron.
- [ ] **Fase 6** — Panel para ver todas las empresas y sus pagos (hoy vive en
      `license-server/admin/`).
- [ ] **Fase 7** — Apagar `license-server/`: quitar `LicenseGate`/`FeatureGuard` viejos,
      variables `VITE_LICENSE_*`, y archivar la carpeta.

Efecto secundario ya presente desde la Fase 2: el monitoreo de errores de los equipos de
los clientes (`src/lib/errorReport.ts` → panel de licencias → Errores) depende del mismo
token que ya no se emite, así que quedó inactivo. No se repara ahora porque vive en el
panel que se va a reemplazar en la Fase 6/7; si quieres monitoreo de errores antes de eso,
avisa para priorizarlo aparte.

## Pendiente — siguiente ronda de desarrollo

- Cobro automático con tarjeta (Stripe / Mercado Pago). Hoy los pagos se registran a mano en el panel de licencias, que ya renueva la licencia y suma ingresos; falta conectar un proveedor.
- Pruebas de interfaz de extremo a extremo (hoy las pruebas cubren la lógica, no las pantallas).
- Endurecimiento extra de licencias: exigir licencia vigente también en las reglas de Supabase.

## Límites conocidos

- Las muestras faciales de Human pesan unos 23 KB por empleado (5 muestras). La copia sin Internet del reloj vive en el almacenamiento del navegador (≈5 MB): hasta unos 100–150 empleados con rostro cabe junto con la asistencia reciente; para más, habría que guardar las muestras aparte (IndexedDB).
- Una app web puede ser alterada por una persona técnica; la licencia frena el uso normal no autorizado, no a un atacante decidido.
- El reconocimiento facial no es infalible ni detiene un video grabado del empleado; por eso hay umbral ajustable, margen contra personas parecidas, foto de verificación en pantalla y métodos alternos. Se quitó la prueba de vida por parpadeo porque estorbaba más de lo que protegía; si algún cliente la necesita, habría que volver a incorporarla.
- Los PIN de empleado se guardan tal cual y se comparan en el navegador del reloj (como en muchos relojes checadores); quien administra los puede ver. Para una versión posterior: guardarlos con hash y verificar en el servidor.
- Los vectores faciales viajan al navegador de quien tenga acceso a los empleados (el reconocimiento se hace ahí, sin enviar fotos). Escritura protegida a propietario/administrador en la base de datos (migración 003).
- Sin conexión, el reloj abre con una copia de los últimos 62 días (o menos si el navegador no le da espacio). Una checada hecha sin conexión se conserva hasta poder enviarse; si el servidor la rechaza varias veces se aparta en el equipo (`nexotime.syncRejected`) y se avisa, no se pierde en silencio.
- La hora se corrige con la del servidor mientras haya conexión. Si el equipo arranca sin conexión usa su propio reloj hasta reconectar.
- Portal del empleado: el PIN es de 4 dígitos; lo que impide adivinarlo es el bloqueo progresivo (5 intentos fallidos = 15 min; luego 1 h, 4 h, 16 h y 24 h; migración 010) y que cada movimiento deja una foto. Los retardos y horas que calcula el teléfono no se recalculan en el servidor (las reglas viven en la aplicación): la migración 010 solo les pone topes (horas ≤ tiempo entre primer y último movimiento, extra ≤ horas, retardo ≤ hora de entrada). Quien llame la función a mano podría declarar un retardo menor al real; la foto y la hora del servidor de cada movimiento siguen siendo la evidencia. La comparación de rostro en el teléfono corre en el navegador del empleado: disuade y deja evidencia, pero la revisión de las fotos es lo que realmente lo comprueba.
- Cada equipo guarda el día completo de un empleado al registrar un movimiento. Un reloj checador que lleve mucho tiempo sin refrescar sus datos y registre a alguien que ya checó desde su celular (o al revés) puede dejar el día con lo que ese equipo conocía; el reloj se refresca al volver a primer plano, y el portal siempre lee el día antes de guardar.
- Fotos de checada: cada movimiento (reloj y portal) guarda una foto de ~25–40 KB. Se borran solas a los 90 días (migración `009_borrado_fotos_90_dias.sql`, tarea diaria de pg_cron; plazo por empresa en Configuración → Reloj checador → "Conservar las fotos de checada", 30 a 365 días, guardado en `attendance_settings.photoRetentionDays`). Hasta que esa migración se ejecute y pg_cron esté activo, las fotos se acumulan sin límite. El registro de asistencia no se borra, solo la imagen.
- Tablet del reloj: usar una cuenta con el rol «Reloj checador (tablet)» (migración `011_cuenta_reloj_checador.sql`), no la de un administrador. Esa cuenta solo lee al personal y agrega checadas del reloj (rostro, QR, código de barras, número/PIN) de los últimos 7 días; la base de datos le impide editar empleados, horarios, configuración o corregir checadas. Sigue pudiendo checar por cualquier empleado de su alcance, que es lo que hace un reloj: la foto de cada checada es la evidencia. Si alguien se lleva la tablet con la sesión abierta, desactiva esa cuenta en Usuarios. Un equipo se vuelve reloj solo al entrar por «Reloj checador → Activar este equipo» (nadie elige nada): con una cuenta de administración queda bloqueado el panel detrás del código de salida (obliga a cambiar el 1234 antes de abrir, y 5 intentos fallidos frenan el teclado 1, 2, 4… 15 min). Ese bloqueo vive en el navegador de la tablet: quien borre los datos del sitio lo quita; por eso la protección real es la cuenta dedicada, cuyos límites pone la base de datos.
- Antes de cada entrega a un cliente: `docs/QA-PRUEBAS.md`, en el equipo real.
