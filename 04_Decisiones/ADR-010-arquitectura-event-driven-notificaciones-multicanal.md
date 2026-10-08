---
id: ADR-010
titulo: "ADR-010: Arquitectura Event-Driven y Desacoplamiento de Notificaciones con BullMQ y Proveedores Especializados"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - notificaciones
  - colas
  - redis
  - event-driven
---

# ADR-010: Arquitectura Event-Driven y Desacoplamiento de Notificaciones con BullMQ y Proveedores Especializados

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
En una plataforma fitness con cobros bimonetarios y rutinas interactivas, la comunicación oportuna es vital (recordatorios de vencimiento de cuota, alertas matutinas de check-in en ayunas, confirmación de pagos).

### Fuerzas en Conflicto
1. **Rendimiento de la API vs. Fiabilidad de Entrega:** Si un alumno reporta un pago o completa una serie en el gimnasio, la API debe responder en $< 150$ ms. Si el backend intenta enviar simultáneamente un correo electrónico vía SMTP o API externa (que tarda entre 800 ms y 3 segundos), la experiencia del usuario se degrada gravemente.
2. **Resiliencia ante Caídas de Terceros:** Las pasarelas de correo (Resend, SendGrid) o servicios push (FCM, OneSignal) experimentan degradaciones periódicas de servicio o límites de cuota (*rate limits*). Estas fallas externas jamás deben abortar una transacción de base de datos ni bloquear al usuario.
3. **Mantenibilidad y Sustituibilidad de Proveedores:** Acoplar librerías de Firebase o SendGrid en múltiples servicios de negocio genera deuda técnica masiva cuando se requiere cambiar de proveedor.

### Opciones Evaluadas
- **Opción A (Llamadas Síncronas Directas):** El servicio de finanzas llama a `emailService.sendReceipt(...)` antes de retornar el HTTP 200.
  - *Descartada:* Hace lenta la API y un error de red del proveedor revierte o falla la operación de negocio.
- **Opción B (Llamadas Asíncronas "Fire and Forget" en Memoria):** Usar promesas sin await (`emailService.send().catch(...)`).
  - *Descartada:* Si el pod o servidor de Node.js se reinicia o crashea en ese instante, el mensaje se pierde para siempre sin posibilidad de reintento.
- **Opción C (Arquitectura Event-Driven con Bus de Eventos y Colas Redis / BullMQ):**
  - Los servicios de negocio únicamente emiten un evento de dominio (`emit('CUOTA_POR_VENCER')`).
  - El Despachador persiste la notificación en la bandeja in-app y encola trabajos en BullMQ (`notifications-push` y `notifications-email`).
  - Workers especializados procesan las colas en segundo plano con reintentos exponenciales y Dead-Letter Queue (DLQ).

---

## 3. Decisión
Adoptamos la **Opción C**.

```
[Servicio de Negocio (NestJS)]
       │
       ▼ (Emite evento de dominio síncrono en memoria)
[Notification Dispatcher] ──► (Guarda inmediatamente en `notificaciones_in_app`)
       │
       ├── Consulta `notification_preferences`
       │
       ▼ (Encola trabajos asíncronos en Redis)
[BullMQ Redis Queues]
       │
       ├──► [Cola: notifications-push]  ──► [Worker Push]  ──► Firebase (FCM) / APNs
       │
       └──► [Cola: notifications-email] ──► [Worker Email] ──► Resend / SendGrid API
```

### Reglas de Diseño Técnico
1. **Desacoplamiento Absoluto:** Ningún módulo deportivo o financiero importa SDKs de Firebase, Resend o OneSignal. Solo importan el bus de eventos de la aplicación (`EventEmitter2`).
2. **Idempotencia Forzada:** Cada trabajo encolado posee un `jobId` determinista para evitar dobles envíos si un worker se reintenta.
3. **Depuración Reactiva:** El `Worker Push` captura errores de tokens expirados (`NotRegistered`) y actualiza `user_devices.is_active = false` inmediatamente.
4. **Almacén de Respaldo In-App:** Toda notificación se guarda primero en la tabla `notificaciones_in_app` antes de intentar la entrega externa, garantizando que el usuario siempre tenga acceso a sus alertas en la campana de la app.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Latencia Mínima en Endpoints:** Las llamadas HTTP retornan en $< 100$ ms; el envío de mensajería ocurre en segundo plano.
- **Tolerancia a Fallos del 100%:** Si el proveedor de correo cae durante 30 minutos, las tareas quedan encoladas en Redis y se entregan automáticamente al restablecerse el servicio.
- **Flexibilidad de Proveedores:** Cambiar de Resend a SendGrid o de FCM a OneSignal requiere modificar únicamente el Worker respectivo sin alterar una sola línea de lógica de negocio.

### Consecuencias Negativas (Trade-offs)
- Requiere infraestructura de Redis activa y monitoreo de colas (BullMQ Board / Arena).

---

## 5. Trazabilidad y Referencias
- Resuelve la problemática: [[PROB-004-orquestacion-preferencias-notificaciones]]
- Requerimientos asociados:
  - [[RF-014-arquitectura-event-driven-despachador-notificaciones]]
  - [[RF-015-matriz-preferencias-usuario-canales]]
  - [[RF-016-gestion-dispositivos-tokens-push-ciclo-vida]]
  - [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]]
- Entidades vinculadas: [[Entidad-PreferenciaNotificacion]], [[Entidad-DispositivoUsuario]], [[Entidad-NotificacionInApp]]
- Complementa la decisión de workers: [[ADR-008-motor-colas-background-workers-bullmq]]

---

## 6. Notas de implementación (Ola 3, N1–N2)

- **Bus:** `@nestjs/event-emitter` (v12.x) con `EventEmitterModule.forRoot({ wildcard: true })`.
  El despachador escucha `@OnEvent('notificacion.**', { suppressErrors: false })`; los emisores
  publican con `emitAsync` para conservar la semántica previa (cobranza reintenta su job ante un
  fallo del pipeline; cartera usa el resultado para el copy de la respuesta; los flujos
  fire-and-forget consumen el rechazo con `.catch(...)` y jamás tumban su transacción).
- **Nombres de cola DLQ:** `<cola>-dead-letter` (p. ej. `notificaciones-email-dead-letter`),
  sin worker, visibles en Bull-Board. El ADR-008 usa `cobranza` como cola de recordatorios, así
  que su DLQ es `cobranza-dead-letter`. El digest semanal tiene la suya
  (`notificaciones-resumen-semanal-dead-letter`) y su processor ya mueve a ella los jobs agotados.
- **`jobId`:** `notif_{categoria}_{tipoEvento}_{destinatarioId}_{referenciaId}_{YYYYMMDD}` con
  separador `_` (BullMQ 5.x rechaza `:` en ids personalizados; misma nota que el ADR-008). Dedupe
  real verificado contra Redis.
- **Matriz por rol (N2a):** migración `0008` con los 16 booleanos del RF-015; el despachador enruta
  cada evento por `(rol, categoría)` con precedencia canal obligatorio (RN-01) → preferencia del
  usuario → default del doc, y exige confirmación explícita para apagar ambos canales de Finanzas
  (RN-02). El In-App sigue siendo universal.
- **UI (N2b):** campana In-App con panel accesible (badge, agrupado Hoy/Ayer, marcar leídas,
  navegación por clic) y preferencias por rol: coach en la pestaña Notificaciones de Ajustes
  (`?tab=notificaciones`), alumno en la pestaña Notificaciones de su Ajustes (`/app/ajustes?tab=notificaciones`; `/app/preferencias` redirige, RF-018).
- **Digest semanal:** job repetible `notificaciones:resumen-semanal` (lunes 08:00 UTC por defecto,
  env `RESUMEN_SEMANAL_CRON`) con DLQ propia y copia In-App garantizada.
- Suites en verde: API 621 · web 465.
