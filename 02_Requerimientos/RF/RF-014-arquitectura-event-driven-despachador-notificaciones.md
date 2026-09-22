---
id: RF-014
modulo: Notificaciones
prioridad: alta
estado: aprobado
estado_implementacion: parcial
problema_origen: "[[PROB-004-orquestacion-preferencias-notificaciones]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - notificaciones
  - event-driven
  - arquitectura
---

# RF-014: Arquitectura Event-Driven y Despachador de Notificaciones Multicanal

## 1. Contexto y Justificación
Desacopla totalmente los módulos centrales del negocio (Finanzas, Entrenamiento, Antropometría) de la infraestructura de entrega física de mensajes (Push y Correo Electrónico). Implementa un patrón Publicador-Suscriptor donde los servicios emiten eventos de dominio inmutables y un servicio despachador central orquesta el filtrado y encolamiento.

- **Objetivo:** Garantizar que ninguna operación de negocio se bloquee por latencias de proveedores externos y permitir el intercambio transparente de pasarelas de mensajería.
- **Valor aportado:** Alta resiliencia, tolerancia a fallas de proveedores, velocidad de respuesta en la API y trazabilidad centralizada de comunicaciones.
- **Trazabilidad:** Resuelve el acoplamiento y las caídas en cascada identificadas en [[PROB-004-orquestacion-preferencias-notificaciones]].

---

## 2. Actores Involucrados
- **Módulos Publicadores de Negocio:** Servicios de Rutinas, Finanzas, Check-ins y Auth que emiten eventos.
- **Servicio Despachador (Notification Dispatcher):** Componente que intercepta eventos, consulta preferencias y encola trabajos.
- **Workers Especializados:**
  - `WorkerPush`: Consume tareas de la cola y despacha vía FCM / APNs / WebPush.
  - `WorkerEmail`: Consume tareas y despacha vía Resend / SendGrid / SMTP.
- **Bandeja In-App (Campana de Alertas):** Almacén persistente de notificaciones internas dentro de la aplicación.

---

## 3. Precondiciones
1. El motor de colas (Redis / BullMQ) debe estar operativo.
2. Cada evento emitido debe contener: `tipo_evento`, `destinatario_user_id`, `entrenador_id`, `payload` estructurado y `timestamp_utc`.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Prohibición de Envío Directo en Servicios de Negocio):** Queda terminantemente prohibido que los controladores o servicios de aplicación invoquen APIs de Push o Email de forma directa o sincrónica. Todo envío debe nacer de un evento de dominio (`emit('evento', payload)`).
- **RN-02 (Pipeline de Procesamiento del Despachador):**
  Al recibir un evento, el despachador ejecuta en milisegundos:
  1. Registra **siempre** la notificación en la entidad `NotificacionInApp` (campana interna del usuario).
  2. Consulta la tabla `notification_preferences` del destinatario.
  3. Si la categoría del evento está activa para Push $\rightarrow$ busca los dispositivos activos en `user_devices` y encola un trabajo en `cola-push`.
  4. Si la categoría está activa para Email $\rightarrow$ encola un trabajo en `cola-email`.
- **RN-03 (Aislamiento de Fallos de Proveedores):** Si el proveedor de correo electrónico está fuera de servicio o devuelve errores 5xx, el `WorkerEmail` reintenta en segundo plano mediante colas con backoff exponencial. El flujo de usuario, la base de datos y la entrega de Push continuarán operando sin afectación.
- **RN-04 (Fallback In-App Universal):** Si el usuario tiene desactivados ambos canales externos (Push y Email) para una alerta no crítica, el sistema asegura que la notificación exista en su bandeja In-App para consulta cuando abra la aplicación.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Despacho Asíncrono de Recordatorio de Pago sin Bloquear la API
```gherkin
Given que el cron de cobranza detecta que una cuota vence en T - 1 día
When el servicio emite el evento "CUOTA_POR_VENCER" con el ID del alumno
Then el servicio emisor debe retornar inmediatamente en < 10 ms sin esperar a la pasarela de correo
  And el Despachador debe leer las preferencias del alumno
  And si Push está activo, debe crear un trabajo en la cola BullMQ de Push
  And si Email está activo, debe crear un trabajo en la cola BullMQ de Email
  And persistir la alerta en la bandeja In-App del alumno
```

### Escenario 2: Resiliencia ante Caída del Proveedor de Email
```gherkin
Given que la pasarela de Email externa (Resend / SendGrid) sufre un corte de servicio (HTTP 503)
When el Worker de Email procesa una notificación de rutina nueva
Then el Worker debe capturar el error y reencolar la tarea con reintento exponencial
  And la notificación Push asociada debe haberse entregado exitosamente al alumno
  And la base de datos principal de la aplicación no debe presentar bloqueos de conexión
```

### Escenario 3: Usuario con Canales Externos Apagados
```gherkin
Given que el alumno configuró Push = false y Email = false para recordatorios de entrenamiento
When el entrenador le asigna una nueva rutina diaria
Then el Despachador NO debe enviar trabajos a las colas de Push ni Email
  And DEBE guardar la notificación en la bandeja In-App para mostrarla con un badge al ingresar
```

---

## 6. Casos Borde y Excepciones
- **Eventos a Múltiples Destinatarios:** En caso de anuncios globales del coach a todos sus alumnos, el despachador debe fragmentar el envío en lotes (*batch chunking*) de 50 usuarios para no saturar la memoria de Redis ni las cuotas por segundo del proveedor.

---

## 7. Estado real de implementación

### N1 (Ola 3, motor por dentro) — implementado
- **Bus de eventos (RN-01):** `@nestjs/event-emitter` con `EventEmitterModule.forRoot({ wildcard: true })`.
  Los emisores publican clases de dominio (`notificacion.pago-reportado`, `…pago-aprobado`,
  `…pago-rechazado`, `…sesion-alumno-finalizada`, `…alumno-registrado`, `…recordatorio-cuota`,
  `…recordatorio-manual-cobro`, `…resumen-semanal-coach`) y el `NotificationDispatcherService`
  escucha con `@OnEvent('notificacion.**')`. Ningún servicio de negocio llama al despachador ni a
  un proveedor externo.
- **Idempotencia y DLQ (RNF-004):** `jobId` determinista
  `notif_{categoria}_{tipoEvento}_{destinatarioId}_{referenciaId}_{YYYYMMDD}`; los jobs que agotan
  intentos se copian a `<cola>-dead-letter` (`notificaciones-push-dead-letter`,
  `notificaciones-email-dead-letter`, `notificaciones-resumen-semanal-dead-letter`,
  `cobranza-dead-letter`), visibles en Bull-Board. La DLQ del **resumen semanal** ya recibe jobs
  (fix D1: el processor del digest escucha `failed` y mueve el job agotado), cubierto por tests.
- **Push con reintentos reales:** el worker relanza errores transitorios (BullMQ reintenta) y solo
  desactiva tokens muertos sin retry; la entrega sigue simulada (log) — **integración pendiente de
  proveedor FCM/APNs**.
- **Bandeja In-App (API para la campana):** `GET /notificaciones/in-app` devuelve
  `{ items, total, limit, offset, totalNoLeidas }` con filtro `soloNoLeidas`; se mantienen marcar
  leída / todas leídas.
- **Resumen semanal:** job repetible `notificaciones:resumen-semanal` (lunes 08:00 UTC por defecto,
  env `RESUMEN_SEMANAL_CRON`) que genera el digest del coach (adherencia de 7 días + cobros/por
  vencer) y lo despacha por el pipeline; el digest siempre deja copia In-App.
- Colas, dispatcher y persistencia In-App operativos; suite de API en verde (**621 tests, 37 archivos**).

### N2 (Ola 3, superficie visible) — implementado
- **UI de la campana (N2b):** campana en la cabecera con badge de no leídas (`9+`), panel accesible
  (Escape, trampa de Tab, foco) con agrupado **Hoy / Ayer / Anteriores**, clic que marca leída y
  navega al destino, "Marcar todas como leídas", paginación "Ver más" y enlace "Configurar mis
  notificaciones"; consume la API In-App paginada de N1.
- **Preferencias por rol (N2b):** coach en Ajustes → pestaña Notificaciones
  (`?tab=notificaciones`); alumno en `/app/preferencias` ("Mis Notificaciones"). Matriz completa por
  rol, candados de Seguridad (RN-01) y modal de confirmación de Finanzas (RN-02); modo demo con
  fixtures.
- **Matriz RF-015 completa (N2a):** migración `0008` (16 booleanos), `GET/PUT
  /notificaciones/preferencias` por rol y despachador por `(rol, categoría)` con precedencia canal
  obligatorio → preferencia → default; detalle en [[RF-015-matriz-preferencias-usuario-canales]] §7.
- Suites en verde: API 621 · web 465.

### Pendiente (siguientes olas)
- **Integración real de proveedores** (FCM/APNs/WebPush y Resend/SendGrid/SMTP): los workers
  simulan la entrega por log.
- **Chunking de 50 en anuncios masivos (§6):** el despachador encola un job por destinatario, sin
  lotes por anuncio global.
- **Recordatorio antropométrico 06:00 por huso IANA:** explícitamente fuera de N1/N2 por complejidad
  (requiere ventana por zona horaria del alumno; anotado como pendiente).
- **Observabilidad externa** (Sentry/Datadog) para la alerta de DLQ y verificación de SLOs de
  latencia del [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]].
