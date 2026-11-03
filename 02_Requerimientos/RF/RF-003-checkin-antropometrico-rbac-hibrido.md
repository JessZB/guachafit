---
id: RF-003
modulo: Antropometria
prioridad: alta
estado: implementado
version_implementada: v1.0.0
fecha_verificacion: 2026-10-09
problema_origen: "[[PROB-001-adherencia-trazabilidad]]"
fecha_creacion: 2026-09-05
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - antropometria
  - rbac
---

# RF-003: Check-in Antropométrico y Auditoría RBAC Híbrida (Presencial vs. Remoto)

## 1. Contexto y Justificación
Estructura un calendario predecible de control antropométrico y composición corporal. Resuelve la inconsistencia y riesgo de alteración de métricas estableciendo permisos basados en roles (RBAC) y un flujo de auditoría diferenciado según la modalidad del cliente.

- **Objetivo:** Capturar mediciones corporales fiables con trazabilidad total sobre el autor del registro y su nivel de verificación técnica.
- **Valor aportado:** Datos fisiológicos válidos para la toma de decisiones clínicas y deportivas sin perder la flexibilidad de clientes a distancia.
- **Trazabilidad:** Resuelve la falta de estructura y confiabilidad documentada en [[PROB-001-adherencia-trazabilidad]].

---

## 2. Actores Involucrados
- **Entrenador:** Configura calendarios, toma y valida medidas en modalidad presencial, audita y aprueba medidas remotas.
- **Alumno Presencial:** Acceso de solo lectura a sus mediciones y evolución.
- **Alumno Online/Remoto:** Acceso de escritura condicionado a la ventana activa de check-in.

---

## 3. Precondiciones
1. El cliente debe tener asignada una modalidad de atención en su perfil: `Presencial` u `Online/Remoto`.
2. El entrenador debe haber configurado la periodicidad del check-in (`Semanal`, `Quincenal` o `Mensual`).

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Calendario y Disparo de Alertas):** En la fecha programada a las 06:00 AM (hora local), el sistema envía una notificación push y correo: *"Hoy es día de check-in: registra tus métricas en ayunas"*.
- **RN-02 (Modelo de Datos Antropométrico):**
  - **Generales:** Peso (kg), Altura (cm).
  - **Perímetros corporales:** Pecho, cintura, cadera, brazo relajado/contraído, muslo medio, cuello.
  - **Composición:** % Grasa corporal (estimado por bioimpedancia o fórmula) y/o pliegues cutáneos (tríceps, subescapular, suprailíaco, abdominal).
  - **Fotos obligatorias/opcionales de control:** Frontal, lateral y posterior (privadas y protegidas).
- **RN-03 (RBAC Presencial - Solo Lectura para el Cliente):**
  - Si `modalidad == "Presencial"`, el cliente tiene permisos `Read-only` sobre el formulario de métricas.
  - Solo el Entrenador puede digitar las medidas físicas tomadas en consulta.
  - El registro se crea con: `origen: "Presencial (Verificado)"` y `estado: "Aprobado"`.
- **RN-04 (RBAC Online/Remoto - Escritura Condicional y Aprobación):**
  - Si `modalidad == "Online"`, el cliente tiene permisos `Read-write` **únicamente** durante la ventana activa de check-in (ej. día programado $\pm 24$ horas).
  - Los datos enviados por el cliente se guardan con: `origen: "Remoto (Autoreporte)"` y `estado: "Pendiente de Aprobación"`.
  - El entrenador recibe una alerta para revisar las fotos y valores; al presionar *"Aprobar y Consolidar"*, el registro transiciona a `estado: "Aprobado"`. Si detecta anomalías, puede solicitar corrección mediante notas de retroalimentación.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Registro Presencial Realizado por el Entrenador
```gherkin
Given que el cliente "Juan Perez" tiene modalidad "Presencial"
  And el entrenador se encuentra en la ficha del cliente en el gimnasio
When el entrenador completa el formulario de medidas físicas y presiona "Guardar Registro"
Then el sistema debe guardar el registro con:
  | Campo          | Valor                    |
  | registrado_por | ID_DEL_ENTRENADOR        |
  | origen         | "Presencial (Verificado)"|
  | estado         | "Aprobado"               |
  And el cliente solo debe poder visualizar las métricas resultantes sin opción a edición
```

### Escenario 2: Autoreporte Remoto del Alumno en Ventana de Check-in
```gherkin
Given que el cliente "Maria Lopez" tiene modalidad "Online/Remoto"
  And hoy es su fecha configurada de check-in quincenal
When accede a la app, llena su peso, perímetros corporales y adjunta sus 3 fotos de progreso
  And presiona "Enviar Check-in"
Then el sistema debe persistir el registro con:
  | Campo          | Valor                    |
  | registrado_por | ID_DEL_CLIENTE           |
  | origen         | "Remoto (Autoreporte)"   |
  | estado         | "Pendiente de Aprobación"|
  And enviar una notificación al entrenador: "Nuevo check-in pendiente de validación para Maria Lopez"
  And bloquear nuevas ediciones por parte de Maria hasta que el coach emita feedback
```

### Escenario 3: Cliente Presencial Intentando Modificar Medidas
```gherkin
Given que un cliente con modalidad "Presencial" intenta enviar un payload HTTP de mutación sobre sus medidas
When el backend procesa la petición
Then debe interceptar la solicitud mediante la política RBAC
  And rechazar la operación con código HTTP 403 Forbidden
  And registrar un evento de intento de modificación no autorizado en logs de auditoría
```

---

## 6. Casos Borde y Excepciones
- **Expiración de la ventana de check-in:** Si el alumno remoto no completa el check-in en la ventana de 48h, el formulario se deshabilita automáticamente y se notifica al entrenador para reprogramación.
- **Valores biológicamente imposibles:** Validación de rango (ej. peso $< 30$ kg o $> 300$ kg; % grasa $< 2\%$ o $> 70\%$) para evitar errores de tipeo accidentales antes de persistir.

---

## 7. Estado real de implementación

> **Verificado el 2026-09-23.** Suites en verde: API **772/772** (42 archivos) · Web **612/612** (57 archivos); smoke real contra API/Postgres/Redis al cierre (check-in remoto → aviso al coach, barrido de expiración sin duplicar, 403 → fila de auditoría).

### Implementado y verificado

- **RN-02 — modelo completo (migración `0010`):** brazo relajado y contraído, muslo medio y los 4 pliegues cutáneos (tríceps, subescapular, suprailíaco y abdominal) con rangos de saneamiento; `brazoCm`/`musloCm` sobreviven como alias legados (brazo relajado y muslo medio) y el payload nuevo tiene precedencia. Fotos de control y validación de valores imposibles (§6) ya existentes.
- **RN-04/§6 — ventana de check-in:** la fecha programada `D` (día local del alumno según su timezone IANA) habilita la ventana `[D-1 00:00, D+1 00:00)` local con fin exclusivo (48 h exactas). Sin periodicidad configurada la ventana no aplica (se conserva el registro libre previo). El registro del coach nunca se filtra por ventana. El 400 describe el rango exacto (última ventana vencida y próxima).
- **RN-01 — periodicidad y ancla:** `periodicidadAntropometria` (semanal | quincenal | mensual) + `antropometriaInicio` por alumno, configurados por el coach vía `PATCH /alumnos/:id`; activar periodicidad sin ancla responde 400 (no se guarda un calendario inerte). El alumno ve ambos campos en `GET /auth/me`.
- **RN-01 — recordatorio 06:00:** scheduler cada 15 min (`upsertJobScheduler` con id estable `antropometria:recordatorio-checkin`; cron `*/15 * * * *` UTC configurable con `ANTROPOMETRIA_RECORDATORIO_CRON`) que evalúa la hora local de cada alumno y emite el aviso solo en su día programado, dentro de su hora local 6. JobId determinista (`antropometria_YYYY-MM-DD`) y pre-chequeo del aviso del día: no duplica. **Aproximación documentada:** la cadencia de 15 min cubre offsets de hora entera, media hora (p. ej. Asia/Kolkata) y 45 min (p. ej. Asia/Kathmandu) dentro de su hora local 6; **límite:** si el worker está caído durante toda la hora local 6, ese día no hay reemisión (no hay catch-up).
- **RN-03 — presencial de solo lectura:** el alumno presencial ve sus medidas sin edición (UI) y cualquier mutación forzada responde 403 desde el servidor; el coach registra con `origen: presencial_verificado` y `estado: aprobado` de forma inmediata.
- **RN-04 — cola y conciliación del coach:** cola de pendientes con las fotos del control en visor accesible y rechazo con **motivo libre obligatorio** (sin motivos prefabricados); aprobar consolida el registro y el motivo rechazado queda registrado.
- **Escenario 2 — aviso al entrenador al recibir un check-in remoto:** al persistir el autoreporte (`pendiente_aprobacion`) el servicio publica `CheckinAntropometricoRecibidoEvent` en el bus (fire-and-forget, un fallo del bus no revierte el registro). Tipo `CHECKIN_ANTROPOMETRICO_RECIBIDO`, categoría `ANTROPOMETRIA` (fila "Reportes de Progreso" del coach en [[RF-015-matriz-preferencias-usuario-canales]] §B), copy "{alumno} envió su check-in antropométrico; revísalo." y enlace real a la cola `/coach/antropometria`; `referenciaId` determinista por control para el `jobId` de push/email. El registro presencial del coach NO emite (no hay nada que aprobar).
- **§6 — aviso al entrenador al expirar la ventana:** el barrido periódico (cada 15 min) existente detecta la fecha programada más reciente ya vencida de cada alumno **remoto** con periodicidad sin medición desde la apertura de su ventana y emite `CheckinAntropometricoExpiradoEvent` al coach (`CHECKIN_ANTROPOMETRICO_EXPIRADO`, "…no completó su medición del {fecha}; considera reprogramar.") con enlace a `/coach/antropometria`. La referencia es determinista (`antropometria_expirado_<alumno>_<fecha>`) y se pre-chequea en la bandeja In-App del coach (migración `0011`: `notificaciones_in_app.referencia_id`), así que se avisa **una vez por fecha programada** sin duplicar entre corridas; una medición posterior al inicio de la ventana silencia el aviso.
- **Escenario 3 — log de auditoría de mutaciones no autorizadas:** migración `0011` con la tabla `auditoria_accesos_denegados` (`usuario_id` nullable, `rol`, `ruta`, `metodo`, `motivo`, `fecha_utc`; sin payloads ni PII extra). `RolesGuard` (rol no autorizado / sin autenticación) y `AlumnoHabilitadoGuard` (estado de activación / cuenta archivada) escriben de forma **best-effort**: un fallo de auditoría nunca cambia la respuesta 403. Una petición anónima deja fila con `usuario_id` nulo.
- **UI de apoyo:** banner de ventana (abierta / próxima / cerrada, con rango y motivo) en el check-in del alumno, y calendario del coach en el tab **Antropometría** de la ficha (próxima fecha programada + ventana vigente/próxima/vencida, leídas del calendario guardado).

### Decisión documentada (no bloquea el cierre)

- **Presigned uploads sin gateo de ventana:** la ventana se valida al registrar el check-in (y el presencial sigue bloqueado al subir fotos de antropometría), pero `POST /antropometria/presigned-upload-url` no evalúa la ventana. Es una decisión de UX: la subida de fotos ocurre antes de completar el formulario y el check-in fuera de ventana sigue rechazándose con 400.

Con los tres criterios pendientes cerrados (Escenario 2, §6 y Escenario 3), el frontmatter pasa a `estado: implementado`; el núcleo del flujo (modelo, ventana, periodicidad, recordatorio, RBAC, conciliación y avisos al coach) queda implementado y verificado.

### Fotos del check-in (2026-10-08, `affec1f`)

- **Hueco corregido:** hasta este lote la web no permitía subir fotos de control (el contrato las admitía, pero no había pantalla), así que el Escenario 2 ("adjunta sus 3 fotos") y la auditoría de fotos del coach solo funcionaban con datos de demostración.
- **Decisión del dueño (2026-10-08) — RN-02:** las fotos (frontal, lateral, posterior) son **opcionales**. El check-in se basa en las medidas; las fotos sirven para que alumno y entrenador vean el progreso. Se puede enviar con 0 a 3 fotos y como máximo una por ángulo (`MENSAJE_FOTOS_ANGULO_REPETIDO`).
- **Web:** casillas Frontal / Lateral / Posterior en el check-in del alumno online (`/app/progreso`) y en "Registrar Control en Sala" del entrenador. Cada foto se comprime (WebP 1920 px, 85 %) y se sube al elegirla, con su estado visible (subiendo, lista con miniatura y "Quitar", o error con "Reintentar"); quitarla durante la subida la cancela. Un aviso nombra las que faltan y recuerda que son opcionales. El botón de enviar espera a que terminen las subidas. En modo demo el selector queda deshabilitado y lo dice.
- **Seguridad (RNF-001):** el API rechaza con 400 (`MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA`) toda foto cuya clave no sea `antropometria/{alumnoId}/…` con la estructura del presign, antes de guardar nada. Antes se aceptaba cualquier texto, lo que permitía registrar la clave de una foto ajena y leerla con la URL firmada. Además, el detalle, la evolución y el comparador ya no firman fotos con clave ajena (defensa ante filas antiguas).
- Evidencia: `apps/web/src/lib/antropometria-fotos.spec.ts`, `components/antropometria/SelectorFotosCheckin.spec.tsx`, `pages/atleta/ProgresoPage.fotos.interaccion.spec.tsx`, `pages/entrenador/AlumnoDetallePage.control-sala.interaccion.spec.tsx`, `apps/api/test/bdd/antropometria-service.spec.ts`; web **1115** aprobados, API **1334** (1 omitida); typecheck y build en verde. Revisado con los 4 enfoques y validado tras las correcciones (19 resueltos, 7 en seguimiento).

### Peso corporal filtrado al teclear (2026-10-12, `63369d7`)
- El peso del check-in del alumno y el de la medición del entrenador solo dejan escribir números de hasta 300 kg con 2 decimales (`filtrarEntradaPesoCorporal`); el mínimo de 30 kg sigue validándose al enviar, como exige `CheckinAntropometricoSchema`. Evidencia: spec `ProgresoPage.peso.interaccion.spec.tsx`; web 1575/1575.

### Cola del entrenador en el móvil (2026-10-30, `8cfb73f`, lote UX-15)
- Las pestañas usan `BarraTabsSegmentada` (tablist "Secciones de evaluaciones"): "Por revisar" con el número visible (nombre accesible "Por revisar: N pendientes") y "Comparar". Tienen teclado APG y paneles `tabpanel`.
- Tarjeta del control pendiente:
  - el nombre del alumno es el título (`h3`), y la fecha y el badge `BadgeEstado` van en una fila que se parte;
  - el peso ausente se muestra como "—";
  - "Rechazar" y "Aprobar y Consolidar" son `BotonTactil` de 44px, apilados en el móvil;
  - el aviso de fotos protegidas va en su propia línea.
- El aviso de éxito tiene `role="status"` y botón "Cerrar aviso", sin temporizador.
- El error de carga (`EstadoError` "No pudimos cargar las evaluaciones") solo afecta a "Por revisar": el comparador sigue disponible.
- Primera carga con `EstadoCarga`. Sin conexión: con datos, "Sin conexión · datos guardados"; sin datos, "Sin conexión y sin datos guardados". Una recarga fallida con datos muestra `AvisoErrorRecarga` sin tapar la cola.
- Cola: vacíos con `EstadoVacio` ("Sin evaluaciones pendientes", "Sin resultados" + "Limpiar búsqueda"). Buscador de 44px con texto de 16px en el móvil y placeholder "Buscar en esta página…": la búsqueda sigue siendo local a la página cargada.
- Evidencia: web **2811 tests en 303 archivos**; typecheck y build en verde. Revisión de fiabilidad sin BLOCKER ni WARNING.

### Check-in sin conexión: aviso honesto y bloqueo del envío (2026-11-02, `9c8c039`, lote UX-28)
- **Decisión D9 del dueño (2026-11-02):** avisar y bloquear el envío sin tocar datos. No se encolan fotos ni mediciones offline por riesgo de pérdida de archivos binarios, expiración de firmas de subida y sesiones.
- **Formulario de check-in (`FormularioCheckinAntropometrico.tsx`):** ante la falta de conexión (`!isOnline`), se muestra en la cabecera el banner `AvisoDatosOffline` con `variante="sin-datos"` ("Sin conexión y sin datos guardados"), se deshabilita el botón de envío y se despliega la aclaración "Conéctate a internet para enviar tu evaluación".
- **Guarda síncrona (`use-checkin-antropometrico.ts`):** si el usuario intenta enviar sin conexión (`!navigator.onLine && !isDemoMode`), la guarda detiene el flujo de envío y reporta el error sin lanzar llamadas al API ni intentar subir archivos a R2.
- **Modo demo:** el entorno de demostración omite la restricción de conectividad y permite simular el registro en local.
- **Evidencia:** `apps/web/src/components/atleta/progreso/FormularioCheckinAntropometrico.ux28.offline.spec.tsx` (4 tests); web **3044 tests en 342 archivos (1118 suites)**; typecheck y build en verde. Revisión de resiliencia (`review-resilience`) APROBADA (0 blockers, 0 warnings).

### Revisión UX del check-in: descarte honesto y fotos sin conexión (`af33433`, 2026-11-03, revisión de UX-19 a UX-29)
- **La medición precargada no es un cambio:** `useMedidasCheckin` guarda la base (`baseRef`) con la que se abrió el formulario; «Volver» sin editar nada vuelve al hub sin el diálogo «¿Descartar cambios sin guardar?». El diálogo sale solo si el alumno cambió una medida o adjuntó fotos (`hayCambiosSinGuardar`).
- **Descartar descarta:** `descartarCheckin()` vacía medidas y fotos y remonta el selector; al reabrir, el formulario muestra la última medición real y no lo escrito.
- **Nombre accesible = texto visible:** el botón de enviar ya no lleva un `aria-label` distinto del texto que se ve.
- **Fotos sin conexión (D9):** el selector de fotos se deshabilita sin conexión, igual que el envío.
- **Evidencia:** 6 tests nuevos en `ProgresoPage.revux.interaccion.spec.tsx`; web **3074/3074** en 351 archivos.

### Check-in con el día de la zona del perfil y textos unificados (`6da5794`, 2026-11-03, lotes ZH-2 y D12, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]])
- **Zona del perfil:** la ventana del check-in y la fecha que se envía al guardar se calculan con la zona del perfil del alumno (`use-contexto-antropometrico.ts`). Usa la zona fresca de `/auth/me` si existe y, si no, la del login. En el modo demo el «hoy» sigue siendo el reloj del dispositivo.
- **Textos (D12):** «Mi progreso», «Tus medidas», «Ver evolución», «Enviar a mi entrenador», «Historial de medidas» y «¡Medidas guardadas!», con mayúscula solo en la primera palabra y un único nombre para la evolución.
- **Evidencia:** web **3152/3152** en 376 archivos; typecheck y build con código 0.

### Pendiente
- (UX-15) El aviso de éxito sigue visible al pasar a "Comparar" hasta que se cierra. Faltan tests de la recarga fallida con datos y de grasa o cintura ausentes. La búsqueda en servidor necesitaría que el endpoint de pendientes aceptara `q`.
- **Fotos huérfanas:** una foto subida y luego quitada, o un check-in que no se llega a enviar, deja el objeto en la bóveda (no hay borrado ni barrido). Ver [[RNF-001-almacenamiento-seguridad-fotos-progreso]].
- **Modo demo:** resuelto el 2026-10-09 (`84643ef`) para el check-in, que ahora se simula en local y lo dice; en la demostración, el título "¡Mediciones Guardadas!" convive con el aviso "En la demostración no se envía nada a tu entrenador." (podría ser más claro). Las pantallas de Nutrición y Pagos del alumno en demo siguen llamando al API.
