# Estado del producto y pendientes antes de vender

Última revisión: 25/09/2026.

## Listo

- Reloj checador con rostro, QR, código de barras y número + PIN; registro automático con cancelación; anti-duplicados.
- Panel: roles y alcance, empleados, credenciales, horarios, incidencias, correcciones, auditoría, reportes CSV/Excel, cumplimiento LFT.
- Licencias: activación, vínculo al dispositivo, firma, tolerancia sin Internet, suspensión, planes, panel del propietario, respaldos (`npm run backup`), 18 pruebas automáticas.
- La app abre sin Internet (service worker) y conserva las checadas hasta poder enviarlas.
- Seguridad de datos biométricos: solo administración, también a nivel de base de datos (migración 003).
- Integración continua en GitHub (tipos, análisis, build y pruebas de licencias).

## Pendiente — depende de ti (no se puede hacer desde el código)

| # | Pendiente | Por qué importa |
|---|---|---|
| 1 | **Ejecutar en Supabase** `002` y `003` (ver `supabase/README.md`) y probar con usuarios de cada rol | Sin ellas la seguridad por rol solo existe en la interfaz |
| 2 | **Probar en la tablet real**: rostro, código de barras, QR, cámara y luz del lugar | Nunca se probó con cámara real; puede requerir ajustar la exigencia |
| 3 | **Revisión legal** de `docs/legal/` (aviso de privacidad, consentimiento biométrico, términos) | Los datos biométricos son sensibles (LFPDPPP) |
| 4 | **Desplegar el servidor de licencias** con HTTPS, volumen persistente y respaldo diario fuera del servidor | Hoy corre solo en tu equipo |
| 5 | **Publicar la app** en un hosting con HTTPS (`sw.js` sin caché) con las variables `VITE_*` de producción | Instalación y cámara exigen HTTPS |
| 6 | **Piloto de 2 a 4 semanas** con una empresa de confianza | Detecta problemas reales antes de cobrar |
| 7 | Regenerar los QR de empleados creados antes de la versión actual ("Regenerar códigos") | Los QR viejos son fáciles de adivinar |

## Pendiente — siguiente ronda de desarrollo

- Cobro y renovación automática (hoy se renueva a mano desde el panel de licencias).
- Monitoreo de errores en los equipos de los clientes.
- Pruebas automáticas del programa (hoy solo las tiene el servidor de licencias).
- Empaquetado como app: Windows (Electron) y Android (Capacitor); ver `license-server/README.md` sobre licencias en Android.
- Endurecimiento extra de licencias: exigir licencia vigente también en las reglas de Supabase.

## Límites conocidos

- Una app web puede ser alterada por una persona técnica; la licencia frena el uso normal no autorizado, no a un atacante decidido.
- El reconocimiento facial no es infalible ni detiene un video grabado del empleado; por eso hay prueba de vida, umbral ajustable y métodos alternos.
