# NEXOTIME — Control de asistencia y reloj checador

Sistema para que las empresas de México registren la asistencia de su personal desde una tablet o laptop con cámara frontal, y la administren desde un panel web: horarios, incidencias, correcciones, reportes y auditoría.

> Producto independiente de asistencia. No es un POS ni un sistema de inventario.

## Qué incluye

**Reloj checador** (`/clock`, pantalla completa, funciona sin Internet)
- Identificación por **reconocimiento facial** (con prueba de vida por parpadeo), **código QR**, **código de barras** o **número de empleado + PIN**.
- Propone el siguiente movimiento (entrada, comida, salida) y lo registra solo tras una cuenta regresiva que el empleado puede cancelar.
- Evita registros dobles, valida la secuencia del día y guarda las checadas en el equipo si se cae la red.

**Panel de la empresa**
- Roles: propietario, administrador, RRHH, supervisor (por sucursal/departamento) y empleado ("Mi asistencia").
- Empleados y credenciales imprimibles, horarios, sucursales, incidencias con aprobación, solicitudes de corrección, auditoría, reportes con exportación a CSV y Excel, cumplimiento LFT.

**Licenciamiento** (`license-server/`)
- Activación por código, vinculación al dispositivo, licencias firmadas, validación periódica con tolerancia sin Internet, suspensión remota, planes y panel del propietario. Ver [license-server/README.md](license-server/README.md).

## Cómo está construido

| Capa | Tecnología |
|---|---|
| Interfaz | React 19 + TypeScript + Vite, Tailwind, Zustand, Framer Motion, Recharts |
| Datos | Supabase (Postgres, Auth, RLS) · modo demo en memoria sin conexión |
| Reconocimiento facial | `@vladmandic/face-api` (TensorFlow.js) en el navegador; solo se guardan vectores, nunca fotos |
| QR / barras | `qrcode`, `jsbarcode`, `@zxing` y `BarcodeDetector` |
| Sin Internet | Service worker (la app abre sin red) + cola de escrituras + licencia firmada |
| Licencias | Servicio Node independiente (SQLite, firma ECDSA P-256) |

Dos modos: **demo** (datos ficticios en memoria, sin licencia) y **live** (Supabase, exige licencia activa).

## Puesta en marcha para desarrollo

```bash
npm install
cp .env.example .env.local     # llena tus llaves de Supabase y de licencias
npm run dev                    # http://localhost:5173
```

Servidor de licencias (otra terminal):

```bash
cd license-server
npm run keygen                                   # imprime VITE_LICENSE_PUBLIC_KEY para .env.local
npm run create-owner -- tu@correo.com "Tu nombre"
npm start                                        # http://localhost:8787  ·  panel: /admin/
```

Para trabajar sin pedir activación pon `VITE_LICENSE_ENFORCE=false` en `.env.local`.

Base de datos: ver [supabase/README.md](supabase/README.md) (orden de las migraciones y verificación).

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprueba tipos y genera `dist/` con el service worker |
| `npm run preview` | Sirve `dist/` en el puerto 4173 (aquí sí actúa el service worker) |
| `npm test` | Pruebas del programa (Vitest) |
| `npm run lint` | Análisis estático |
| `cd license-server && npm test` | Pruebas del servidor de licencias y del flujo completo |

## Publicación

`npm run build` genera `dist/`. Súbelo a un hosting estático con **HTTPS** (Netlify, Cloudflare Pages o Vercel): `public/_headers`, `public/_redirects` y `vercel.json` ya traen las reglas (la app de una sola página, `sw.js` sin caché, archivos con hash en caché permanente y cabeceras de seguridad). Define las variables `VITE_*` de producción en el hosting antes de construir.

## Documentación

- [docs/GUIA-INSTALACION.md](docs/GUIA-INSTALACION.md) — instalación y puesta en marcha en el cliente.
- [docs/legal/](docs/legal/) — borradores de aviso de privacidad, consentimiento biométrico y términos (requieren revisión legal).
- [license-server/README.md](license-server/README.md) — licencias, despliegue y API.
- [supabase/README.md](supabase/README.md) — base de datos.

## Antes de vender

Estado y pendientes en [docs/ESTADO.md](docs/ESTADO.md).

## Licencia

Software propietario. Copyright © Omar Isaird Espinoza Guevara — ver [LICENSE](LICENSE). No es código abierto: el uso por parte de una empresa cliente se rige por el contrato de licencia y [docs/legal/terminos-y-condiciones.md](docs/legal/terminos-y-condiciones.md), no por este repositorio.
