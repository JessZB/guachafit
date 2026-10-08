---
id: RF-003
modulo: Antropometria
prioridad: alta
estado: implementado
version_implementada: v1.0.0
fecha_verificacion: 2026-10-08
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

### Pendiente
- **Fotos huérfanas:** una foto subida y luego quitada, o un check-in que no se llega a enviar, deja el objeto en la bóveda (no hay borrado ni barrido). Ver [[RNF-001-almacenamiento-seguridad-fotos-progreso]].
- **Modo demo del alumno:** enviar el check-in en demostración llama al API real con el token ficticio (el del coach sí simula en local).
