# NEXOTIME · Servidor de licencias

Servicio **independiente** que autoriza, vincula y controla cada instalación de NEXOTIME. No depende de Supabase, de la app ni de ningún servicio de IA: solo Node.js 22.5+ (sin paquetes externos) y un archivo SQLite.

```
 Windows (PWA) ─┐                                   ┌─ Panel del propietario  /admin/
                ├──►  API de licencias  (/v1/…)  ───┤
 Android (futuro)┘        │  firma ES256             └─ API administrativa  /admin/api/…
                          ▼
                    SQLite (licencias, empresas, dispositivos, auditoría)
```

## 1. Análisis del proyecto y cómo se integra

| | |
|---|---|
| Programa | App web (Vite + React 19 + TypeScript) instalable como PWA; datos en Supabase (Postgres/Auth/RLS) o modo demo en memoria. |
| Instalación actual | Se abre desde el navegador / PWA en la tablet o laptop. No hay servidor propio ni instalador. |
| Decisión | El licenciamiento vive en un servicio aparte (este), con su propia base y su propia llave. La app solo lleva la **llave pública** y un **token firmado**. |

**Dónde se guardan las licencias:** en la base SQLite de este servidor (`data/licenses.db`), nunca en la app ni en la base de datos de las empresas. Cada empresa/licencia/dispositivo son filas separadas, sin mezcla de datos entre clientes.

**Cómo se comunica el programa:** HTTPS/JSON contra `POST /v1/activate`, `/v1/validate`, `/v1/status`. Cada respuesta correcta trae un **token firmado** (ECDSA P-256) con: licencia, empresa, dispositivo, estado, plan, funciones, vencimiento, fecha de la última validación y hasta cuándo vale sin Internet.

**Sin Internet:** el programa decide con el último token firmado y el reloj. Sigue funcionando hasta `iat + días de tolerancia` (por defecto 30, configurable en el servidor, global o por licencia). Las checadas siguen guardándose en la cola local existente y se suben al volver la conexión. Al recuperar Internet valida de nuevo solo (al abrir, cada 6 h, y en cuanto el navegador reporta conexión).

**Protección de la licencia:** ver sección 4.

**Android más adelante:** la API y el token no dependen de Windows. Android solo debe (1) generar y guardar su Device ID, (2) llamar a `/v1/activate` y `/v1/validate` con `platform: "android"`, (3) verificar el token con la misma llave pública y aplicar las mismas reglas de `evaluateLicense` (`src/lib/license/token.ts` es el contrato de referencia). La licencia pertenece a la **empresa**; `max_devices` decide cuántos equipos (Windows y/o Android) puede tener.

## 2. Flujo de venta

1. Consigues un cliente → creas (o el vendedor crea) la **empresa** en el panel.
2. Creas la **licencia** (plan, dispositivos, vigencia). Si el vendedor la solicita, queda **PENDIENTE** y sin código.
3. Tú la **autorizas** → se genera el código `NXT-XXXX-XXXX-XXXX` (se muestra una sola vez; en la base solo queda su hash).
4. El cliente abre el programa → **Activar producto** → escribe código y nombre de la empresa.
5. El servidor liga la licencia a ese `Device ID`; el programa queda activo. La vigencia (por defecto 12 meses) empieza a contar en la primera activación.
6. Desde el panel ves y administras todo; puedes suspender, renovar o desvincular en cualquier momento.

## 3. Estados

| Estado | Efecto en el programa |
|---|---|
| PENDIENTE | No se puede activar (todavía no tiene código). |
| ACTIVA | Funciona normalmente. |
| SUSPENDIDA | Pantalla de bloqueo; se desbloquea sola al reactivarla (revisa cada minuto mientras está bloqueado). |
| VENCIDA | Pantalla "Licencia vencida"; se detecta con la fecha del token aunque no haya Internet. Al renovar se desbloquea sola. |
| CANCELADA | Bloqueada. Solo el propietario puede reactivarla. |

La suspensión se detecta **la próxima vez que el programa habla con el servidor** (máximo unos minutos con Internet; sin Internet, hasta que se agote la tolerancia). Es el compromiso deliberado para que un corte de red no detenga el reloj checador.

## 4. Seguridad

- **Firma:** el servidor firma con una llave privada ES256 (`data/private.pem`, o `LICENSE_PRIVATE_KEY`). El programa solo tiene la pública (`VITE_LICENSE_PUBLIC_KEY`): puede verificar, no firmar. Editar el token guardado (ACTIVA↔VENCIDA, fechas, plan, dispositivo) invalida la firma y el programa vuelve a pedir activación (probado).
- **Sin secretos en el cliente:** ninguna llave maestra, ni contraseña, ni forma de crear licencias dentro del programa. No existe "cuenta maestra" en la app.
- **Prueba de posesión:** `/v1/validate` exige el token que el servidor emitió a ese dispositivo.
- **Dispositivo:** ID aleatorio de 128 bits guardado en localStorage e IndexedDB. Además se envía una huella gruesa del entorno (plataforma, núcleos, memoria, GPU): si cambia mucho se **registra** y se marca "REVISAR ENTORNO" en el panel; solo bloquea si lo activas en Ajustes (para no romper equipos por un cambio menor).
- **Reloj:** si la fecha del equipo queda atrasada respecto de lo ya visto o del token, se pide validar en línea.
- **Códigos:** 60 bits de entropía, guardados como hash SHA-256, con límite de intentos (10 activaciones / 15 min por IP).
- **Panel:** contraseñas con scrypt, sesiones de 12 h con token aleatorio guardado como hash, límite de intentos de inicio de sesión, cabeceras de seguridad y CSP estricta; solo el propietario gestiona usuarios y ajustes.
- **Respuestas al cliente:** mensajes en lenguaje simple; el código desconocido y el nombre de empresa incorrecto dan el mismo error (no revela qué existe). Los errores internos nunca salen al cliente.
- **Roles:** `owner` (todo) · `admin` (opera licencias; no usuarios ni ajustes) · `vendedor` (solo sus empresas; **solicita** licencias con valores por defecto del plan que tú revisas, no las aprueba, no renueva, no cambia fechas ni dispositivos, no elimina).
- **Auditoría:** cada acción queda con usuario, acción, fecha/hora, licencia, empresa, dispositivo, IP y resultado (activaciones fallidas, dispositivos no autorizados, validaciones, cambios del panel…).

### Límites honestos
Una app web es código abierto para quien la ejecuta: una persona técnica podría modificar el JavaScript del navegador para saltarse la pantalla de activación. Lo que **sí** evita este diseño es que un cliente normal edite un archivo, copie el token a otro equipo o siga usando una licencia suspendida/vencida. Para el siguiente nivel de protección, mantén los datos reales en Supabase y, cuando quieras, haz que sus reglas (RLS) exijan una licencia vigente por empresa; y, si empaquetas la app como Electron/Android, el Device ID puede salir del identificador del sistema. Copiar el perfil completo del navegador a otro equipo no se puede impedir por completo en una PWA: lo detecta el cambio de entorno y el límite de dispositivos.

## 5. Puesta en marcha (local)

```bash
cd license-server
npm run keygen                      # crea data/private.pem y muestra VITE_LICENSE_PUBLIC_KEY
npm run create-owner -- tu@correo.com "Tu nombre"   # pide la contraseña (mín. 10 caracteres)
npm start                           # http://localhost:8787   ·   panel: /admin/
npm test                            # 18 pruebas del flujo completo
```

En el programa (`.env.local` de la raíz del proyecto):

```
VITE_LICENSE_API_URL=http://localhost:8787
VITE_LICENSE_PUBLIC_KEY=<la que imprimió keygen>
# Solo para desarrollo, para saltarte la activación:
# VITE_LICENSE_ENFORCE=false
```

Se exige licencia a toda instalación conectada (con Supabase configurado). El modo demostración no la necesita.

## 6. Despliegue en producción

Necesitas Node 22.5+ (o Docker) y **HTTPS** (la app en HTTPS no puede llamar a una API HTTP). Railway, Render, Fly.io o un VPS con Caddy/nginx sirven; todos dan TLS.

1. Sube la carpeta `license-server/` (hay `Dockerfile`).
2. Monta un **volumen persistente** en `/data` (ahí viven `licenses.db` y `private.pem`).
3. Variables: `TRUST_PROXY=true`, opcionalmente `ALLOWED_ORIGINS=https://tu-app.com`. La llave: ejecuta una vez `node src/cli.js keygen` dentro del contenedor (guarda `/data/private.pem`) **o** pega el PEM en `LICENSE_PRIVATE_KEY`.
4. Crea al propietario una vez: `node src/cli.js create-owner tu@correo.com "Tu nombre"`.
5. En la app de producción define `VITE_LICENSE_API_URL=https://licencias.tudominio.com` y `VITE_LICENSE_PUBLIC_KEY`, y vuelve a construirla (`npm run build`).
6. **Respaldos:** programa `npm run backup` una vez al día (`node src/backup.js` dentro del contenedor). Crea una copia consistente de la base y de la llave en `data/backups/` y conserva las 14 más recientes; cópialas también fuera del servidor.
   **Respalda `data/`** (base y llave). **Si pierdes o cambias la llave privada, todas las licencias emitidas dejan de ser válidas** y habría que reactivar cada equipo. Nunca la subas a git.
7. Entra a `https://licencias.tudominio.com/admin/`.

## 7. Uso del panel (`/admin/`)

- **Panel:** empresas con licencia activa, licencias por estado, por vencer (30 días), dispositivos activos, equipos con cambio de entorno, últimas validaciones.
- **Licencias:** crear, autorizar, suspender, reactivar, cancelar, renovar, modificar vencimiento/plan/límite de dispositivos/tolerancia/notas, ver y desvincular dispositivos, generar código nuevo.
- **Empresas:** nombre, contacto, teléfono, correo, dirección, notas, vendedor asignado y licencias.
- **Dispositivos:** empresa, licencia, Device ID, activación, última conexión y validación, versión, estado.
- **Auditoría** con búsqueda; **Usuarios** (owner/admin/vendedor) y **Ajustes** (días de tolerancia y bloqueo por entorno) solo para el propietario.

## 8. Planes

Definidos en `src/plans.js` (Básico, Profesional, Empresa). Las funciones viajan dentro de la licencia firmada, así que cambiar un plan aplica en la siguiente validación sin actualizar la app. En el programa se usan con `useFeature('reports' | 'export' | 'face' | 'audit')` y `hasFeatureNow(...)`; hoy gobiernan Reportes, Exportación, Auditoría y Reconocimiento facial. Para añadir un plan o función, edita `plans.js`.

## 9. API

Pública (la usa el programa):

| Método | Ruta | Cuerpo | Resultado |
|---|---|---|---|
| POST | `/v1/activate` | `code, companyName, deviceId, deviceName, platform, appVersion, envHash` | registra el dispositivo y devuelve `token` |
| POST | `/v1/validate` | `licenseId, deviceId, token, appVersion, envHash` | renueva la ventana offline; devuelve `token` (con el estado real, también si está suspendida) |
| POST | `/v1/status` | `licenseId, deviceId, token` | estado ligero, sin registrar |
| GET | `/v1/public-key` | | llave pública (informativa) |

Administrativa (`Authorization: Bearer …`, tras `POST /admin/api/login`): `companies`, `licenses`, `licenses/:id`, `licenses/:id/{approve|regenerate-code|suspend|reactivate|cancel|renew}`, `licenses/:id/devices/:deviceId/{unlink|clear-flag}`, `devices`, `audit`, `users`, `settings`, `dashboard`.

## 10. Archivos

**Servidor (nuevo):** `license-server/` — `src/{config,crypto,db,plans,service,server,index,cli}.js`, `public/{index.html,admin.js,admin.css}`, `test/{flow,client-flow}.test.js`, `Dockerfile`, `.env.example`.

**Programa (nuevos):** `src/lib/license/{config,token,device,api,store,features}.ts`, `src/components/license/{LicenseGate,FeatureGuard}.tsx`, `src/components/settings/LicensePanel.tsx`.

**Programa (modificados, cambios mínimos):** `src/App.tsx` (envuelve las rutas en `LicenseGate`; Reportes y Auditoría con `FeatureGuard`), `src/components/shared/{nav.ts,Sidebar.tsx}` (oculta secciones que el plan no incluye), `src/pages/clock/ClockPage.tsx` (oculta reconocimiento facial si el plan no lo incluye), `src/services/exportService.ts` (exportar exige el plan), `src/pages/SettingsPage.tsx` (pestaña "Licencia"), `src/components/settings/KioskSettingsPanel.tsx` (oculta la sección de rostros sin plan), `src/vite-env.d.ts`, `.env.local` (variables de licencia).
