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

### 3.1 Número + PIN con verificación de rostro
- [ ] Empleado **con rostro registrado**: número → PIN → cámara ("Verificación de identidad"). Solo registra si el rostro coincide; la salida y la comida también.
- [ ] Alguien que escribe el número y PIN de **otra persona**: debe decir "Ese rostro es de otra persona" o "No coincide" y no registrar nada. Queda en Auditoría como "Identificación facial rechazada".
- [ ] Empleado **sin rostro registrado**: la entrada pide foto de evidencia; la salida no abre la cámara.
- [ ] Configuración → Reloj checador → "Verificar el rostro con número y PIN" en apagado: vuelve a ser solo número + PIN (la entrada sigue pidiendo foto).
- [ ] Con la luz de apoyo (pantalla blanca) y con el brillo de la tablet al máximo, en un lugar poco iluminado: debe reconocer. Probar también apagada ("Luz apagada").
- [ ] Al prender la cámara aparece "Prepárate" con cuenta de 4 s (o "Empezar ya"); no lee ni registra nada antes. Después muestra la foto, un aviso con cuenta regresiva y el botón "Registrar ahora".
- [ ] Tablet **vertical** y luego **horizontal**: la imagen de la cámara se ve derecha en las dos (vertical = ventana alta; horizontal = cámara a la izquierda y botones a la derecha). Si se ve de lado o de cabeza, debe corregirse sola en unos segundos al ponerse alguien enfrente; si no, usar "Girar imagen" (se recuerda para esa posición).
- [ ] Configuración → Reloj checador → "Distancia a la que se para la persona": probar Muy cerca / Normal / Lejos con la tablet en su lugar real. La cara debe caber en el óvalo sin decir "aléjate" ni "acércate" a la distancia habitual.
- [ ] En un cuarto con poca luz: pantalla blanca al máximo de brillo, la persona a ~40 cm. Debe leerla; si dice "poca luz", acercarse a la pantalla.
- [ ] La cámara del reloj (rostro, QR y verificación) no se entrecorta ni se congela cada segundo en la tablet real. Si pasa, anotar el modelo de la tablet.

### 3.5 Entrada al reloj (nadie elige nada)
- [ ] Welcome → «Reloj checador» → «Entrar con la cuenta del reloj» → entrar con una cuenta de administración: el equipo queda como reloj sin preguntar nada, y **antes de abrir** pide elegir un código de salida propio (rechaza 1234, 0000 y secuencias).
- [ ] En ese equipo, escribir `/empleados` o `/` en la dirección regresa al reloj. No hay ninguna pantalla que permita "desactivar" el bloqueo sin el código.
- [ ] 5 códigos de salida equivocados seguidos bloquean el teclado 1 minuto (luego 2, 4… hasta 15). Recargar la página no lo quita.
- [ ] Con el código correcto el panel abre 15 minutos y se vuelve a cerrar solo; «Reloj checador» del menú lo vuelve a bloquear.
- [ ] En Configuración → Reloj checador → «Este equipo» solo existe «Quitar el modo reloj» (no hay forma de activarlo desde ahí).

### 3.4 Cuenta dedicada del reloj
- [ ] Usuarios → Nuevo usuario con rol «Reloj checador (tablet)» (correo propio, sucursal asignada). Entrar con ella en la tablet: abre directo en el reloj y registra checadas con rostro, QR y número + PIN.
- [ ] Con esa cuenta, abrir `/`, `/empleados` o `/configuracion` en la tablet regresa al reloj.
- [ ] Tocar «Salir» (o el logo) pide el código de salida al momento; al escribirlo cierra la sesión (no abre ningún panel) y llega a la bienvenida. Probar en la tablet táctil, no solo con el mouse.
- [ ] Con esa cuenta no se puede editar nada: desde la consola del navegador, un `update` a empleados o a empresas es rechazado por la base.
- [ ] Una checada hecha con la cuenta del reloj aparece con su foto en Asistencia → Registro de checadas.

### 3.3 Portal del empleado: bloqueo
- [ ] Con el empleado de prueba, 5 PIN equivocados seguidos: bloquea 15 min y lo dice. Otros 5 al terminar ese plazo: bloquea 1 h ("Espera 1 h").
- [ ] Entrar bien reinicia el conteo (el siguiente error vuelve a contar desde 1).

### 3.2 Borrado de fotos
- [ ] Después de correr la migración 009: en el SQL Editor, `select jobname, schedule, active from cron.job;` muestra `nexotime-borrar-fotos-90-dias` activo.
- [ ] Prueba a mano con un plazo corto sobre datos de prueba: `select public.purge_old_attendance_photos(30);` devuelve cuántas borró; esas checadas siguen en Asistencia y su foto dice "eliminada".

### 3.6 Cierre de periodo
- [ ] Después de correr la migración 016: Cierre de periodo abre con la última quincena terminada y muestra a cada empleado con sus números.
- [ ] Con una vacación o corrección pendiente dentro del periodo, el botón "Cerrar periodo" está bloqueado y dice por qué; al resolverla se habilita.
- [ ] Un día con entrada y sin salida sale como aviso ("Sin salida") sin bloquear; corregirlo con "Editar día completo" lo quita.
- [ ] El Excel trae cuatro hojas (Cierre, Resumen, Detalle diario, Incidencias) y las horas son números que se pueden sumar.
- [ ] Cerrar el periodo: aparece "Cerrado", con quién y cuándo. En Asistencia, editar un día de ese periodo dice que el periodo está cerrado; un día fuera del periodo sí se edita.
- [ ] En el SQL Editor, con un usuario administrador, intentar actualizar una checada de esas fechas falla con "El periodo del … ya está cerrado".
- [ ] Una checada de hoy en el reloj sigue funcionando con periodos cerrados (no se ve afectada).
- [ ] RH no ve el botón "Reabrir"; el administrador sí, y exige motivo. Al reabrir se puede editar y volver a cerrar; el historial conserva ambos cierres.
- [ ] Sin Internet, "Cerrar periodo" dice que hace falta conexión.

### 3.7 Recuperar contraseña
- [ ] En el login, «¿Olvidaste tu contraseña?» lleva a la pantalla de recuperar; con el correo de una cuenta de prueba llega el correo (revisa spam) y dice lo mismo con un correo que no existe.
- [ ] El enlace del correo abre «Elige tu nueva contraseña»; con menos de 8 caracteres o contraseñas distintas lo dice; con una buena entra a la bienvenida con la sesión iniciada.
- [ ] Usar el mismo enlace otra vez, o uno viejo, muestra «El enlace venció» con el botón para pedir otro.
- [ ] Pedir el correo varias veces seguidas muestra «Espera un minuto», no un error en inglés.
- [ ] Entrar después con la contraseña vieja falla y con la nueva funciona.

### 3.8 Días festivos
- [ ] Configuración → Días festivos muestra los de la ley del año con el día de la semana correcto (2026: lunes 2 de febrero, lunes 16 de marzo, miércoles 16 de septiembre, lunes 16 de noviembre).
- [ ] Apagar un festivo oficial ("Se trabaja") y agregar uno propio (por ejemplo Viernes Santo): quedan guardados al recargar la página y salen en Auditoría.
- [ ] En un festivo, la Asistencia del día muestra «Festivo» y no «Falta» a quien no ha llegado; el Reporte de faltas no lo incluye.
- [ ] Una persona que checa en un festivo aparece normal, y en Cierre de periodo su tarjeta dice «1 trabajado (doble)»; quien descansó dice «1 descansado».
- [ ] El Excel del cierre trae las columnas «Festivos trabajados (pago doble)» y «Festivos descansados».

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
