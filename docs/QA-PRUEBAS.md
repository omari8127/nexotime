# Lista de pruebas antes de entregar a un cliente

Las pruebas automáticas (`npm test`, 90 hoy) cubren las reglas de asistencia, la cola sin conexión, la
hora de la empresa, la elección de sucursal y la coincidencia facial. **No pueden** probar una cámara,
una tablet ni un lugar con su luz y su gente: eso se hace con esta lista, en el equipo real del cliente.
Marca cada punto; si alguno falla, no se entrega.

## 1. El equipo (tablet / PC del reloj)
- [ ] Hora y zona horaria automáticas activadas. Debe coincidir con la zona de la empresa (Configuración → Empresa).
- [ ] Navegador actualizado (Chrome o Edge). Abierto en `https://…` (la cámara no funciona sin HTTPS).
- [ ] Permiso de cámara y de ubicación concedidos al sitio (Permitir, no "Preguntar siempre").
- [ ] Pantalla completa (botón del reloj) y que no se apague sola. Cargador conectado.
- [ ] Tablet fija en la sucursal: abrir el reloj, elegir **su sucursal** en el menú de arriba (se recuerda en ese equipo).

## 2. Registro de rostros (con la cámara del reloj, no con otra)
- [ ] Registrar a 3 personas distintas, una con barba o lentes. Cada una debe terminar los 5 pasos sin atorarse.
- [ ] Si alguien se atora más de 10 s, el modo asistido debe dejarlo continuar.
- [ ] La voz dice cada paso (y se puede apagar con el botón del altavoz).
- [ ] Al terminar, la prueba final dice "Te reconocí".
- [ ] Registrar con el reloj en **"Baja (2 MP)"** si la cámara es de 2 MP o menos (Configuración → Reloj checador).

## 3. Reconocimiento en el reloj
- [ ] Cada persona registrada checa de frente, a 40–60 cm, en menos de 2 s.
- [ ] Con gorra, con lentes, con el cabello distinto, con poca luz y con luz de ventana de espalda.
- [ ] Muy cerca de la cámara: debe decir "Aléjate un poco", nunca quedarse mudo.
- [ ] **Dos personas parecidas** (hermanos): ninguna debe ser aceptada como la otra. Si pasa, subir a "Normal" o "Alta".
- [ ] Una persona **no registrada** no debe ser aceptada. Probar con 3 desconocidos.
- [ ] Una foto en un celular frente a la cámara: **se acepta** (no hay prueba de vida). Decidir con el cliente si es aceptable.
- [ ] Cada método: rostro, QR, código de barras, número + PIN. Número + PIN debe servir a empleados de otra sucursal.
- [ ] Doble checada seguida: la segunda se rechaza con el mensaje de "Acabas de registrar".

## 4. Sin conexión
- [ ] Apagar el Wi‑Fi: checar a 3 personas. Debe decir que quedó guardado y mostrar "Sin conexión".
- [ ] Prender el Wi‑Fi: la cola se envía sola ("Sincronizado") y las checadas aparecen en el panel.
- [ ] Reiniciar la tablet sin Wi‑Fi: el reloj debe abrir y conservar lo ya checado.

## 5. Hora y datos
- [ ] La hora del reloj coincide con la del teléfono del dueño. Cambiar la hora de la tablet 10 min: el reloj debe corregirla solo y avisar.
- [ ] Una checada de la tarde aparece en el panel con la hora y el día correctos.
- [ ] Con dos sucursales, cada empleado aparece en la suya en reportes y en el panel.

## 6. Seguridad
- [ ] Cambiar el PIN de salida del reloj (por defecto es `1234`) en Configuración → Reloj checador.
- [ ] Contraseña del dueño de 8 caracteres o más, y no compartida.
- [ ] Iniciar sesión con otra cuenta en otra pestaña: la pantalla avisa que cambió la cuenta; no mezcla datos.
- [ ] Cerrar sesión: vuelve al inicio de sesión, no a la empresa de demostración.

## 7. Cliente nuevo
- [ ] Empresa propia (no la de demostración): no mezclar empleados de muestra con los reales.
- [ ] Datos legales completos en `src/data/legal.ts` y avisos revisados por un abogado.
- [ ] Aviso de privacidad entregado y consentimiento biométrico firmado por cada persona antes de registrar su rostro.
