---
id: RF-003
modulo: Antropometria
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-23
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

> **Verificado el 2026-09-23.** Suites en verde: API **744/744** (41 archivos) · Web **612/612** (57 archivos); runtime 35/35 y smoke contra API/Postgres al cierre.

### Implementado y verificado

- **RN-02 — modelo completo (migración `0010`):** brazo relajado y contraído, muslo medio y los 4 pliegues cutáneos (tríceps, subescapular, suprailíaco y abdominal) con rangos de saneamiento; `brazoCm`/`musloCm` sobreviven como alias legados (brazo relajado y muslo medio) y el payload nuevo tiene precedencia. Fotos de control y validación de valores imposibles (§6) ya existentes.
- **RN-04/§6 — ventana de check-in:** la fecha programada `D` (día local del alumno según su timezone IANA) habilita la ventana `[D-1 00:00, D+1 00:00)` local con fin exclusivo (48 h exactas). Sin periodicidad configurada la ventana no aplica (se conserva el registro libre previo). El registro del coach nunca se filtra por ventana. El 400 describe el rango exacto (última ventana vencida y próxima).
- **RN-01 — periodicidad y ancla:** `periodicidadAntropometria` (semanal | quincenal | mensual) + `antropometriaInicio` por alumno, configurados por el coach vía `PATCH /alumnos/:id`; activar periodicidad sin ancla responde 400 (no se guarda un calendario inerte). El alumno ve ambos campos en `GET /auth/me`.
- **RN-01 — recordatorio 06:00:** scheduler horario (`upsertJobScheduler` con id estable `antropometria:recordatorio-checkin`; cron `0 * * * *` UTC configurable con `ANTROPOMETRIA_RECORDATORIO_CRON`) que evalúa la hora local de cada alumno y emite el aviso solo en su día programado a las 06:00 locales. JobId determinista (`antropometria_YYYY-MM-DD`) y pre-chequeo del aviso del día: no duplica. **Aproximación documentada:** exacto para offsets de hora entera; un offset de media hora (p. ej. Asia/Kolkata) recibe el aviso a las 06:30 locales.
- **RN-03 — presencial de solo lectura:** el alumno presencial ve sus medidas sin edición (UI) y cualquier mutación forzada responde 403 desde el servidor; el coach registra con `origen: presencial_verificado` y `estado: aprobado` de forma inmediata.
- **RN-04 — cola y conciliación del coach:** cola de pendientes con las fotos del control en visor accesible y rechazo con **motivo libre obligatorio** (sin motivos prefabricados); aprobar consolida el registro y el motivo rechazado queda registrado.
- **UI de apoyo:** banner de ventana (abierta / próxima / cerrada, con rango y motivo) en el check-in del alumno, y calendario del coach en el tab **Antropometría** de la ficha (próxima fecha programada + ventana vigente/próxima/vencida, leídas del calendario guardado).

### Pendiente (honesto)

- **Notificación al entrenador al recibir un check-in remoto** (Escenario 2): el pendiente aparece en la cola del coach, pero el evento de dominio no se publica desde antropometría (la categoría "Reportes de Progreso" de [[RF-015-matriz-preferencias-usuario-canales]] §7 ya lo registra como pendiente).
- **Notificación al entrenador al expirar la ventana** (§6): no implementada; el formulario sí se deshabilita solo al cerrarse la ventana.
- **Log de auditoría de intentos de mutación no autorizados** (Escenario 3): el 403 y el aislamiento se aplican, pero no se emite un evento dedicado en logs de auditoría.
- **Presigned uploads sin gateo de ventana:** la ventana se valida en el check-in (y el presencial sigue bloqueado al subir fotos de antropometría), pero `POST /antropometria/presigned-upload-url` no evalúa la ventana.

Por los puntos anteriores, el frontmatter conserva `estado: parcial` aunque el núcleo del flujo (modelo, ventana, periodicidad, recordatorio, RBAC y conciliación) está implementado y verificado.
