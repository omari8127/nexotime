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

- Una app web puede ser alterada por una persona técnica; la licencia frena el uso normal no autorizado, no a un atacante decidido.
- El reconocimiento facial no es infalible ni detiene un video grabado del empleado; por eso hay prueba de vida, umbral ajustable y métodos alternos.
