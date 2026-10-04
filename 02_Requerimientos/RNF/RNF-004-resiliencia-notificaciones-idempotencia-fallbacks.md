---
id: RNF-004
modulo: Notificaciones
categoria: resiliencia-rendimiento # resiliencia-rendimiento | disponibilidad | seguridad
prioridad: alta
estado: aprobado
estado_implementacion: parcial
requisito_origen: "[[RF-014-arquitectura-event-driven-despachador-notificaciones]]"
metrica_objetivo: "Push p95 < 3s / Email p95 < 10s / 0% duplicados por reintentos"
fecha_creacion: 2026-09-06
fecha_verificacion: 2026-10-04
tags:
  - requerimiento
  - rnf
  - sdd
  - resiliencia
  - colas
  - rendimiento
---

# RNF-004: Resiliencia, Idempotencia de Envíos y Tolerancia a Fallos en Mensajería

## 1. Definición y Alcance
Define las garantías operativas y estándares no funcionales requeridos para el pipeline de entrega de notificaciones. Asegura que los mensajes se entreguen de forma oportuna, que las fallas temporales de red externa se recuperen automáticamente y que ningún usuario reciba alertas duplicadas.

- **Atributos de calidad:** Resiliencia, Idempotencia, Latencia y Tolerancia a Fallos.
- **Componentes afectados:** Redis, BullMQ Workers, Integraciones externas (FCM, APNs, Resend, SendGrid).

---

## 2. Métricas Cuantitativas y SLOs / SLAs

| Métrica | Valor Mínimo Aceptable | Valor Deseado (SLO) | Condición de Medición |
| :--- | :--- | :--- | :--- |
| **Latencia de Entrega Push (p95)** | < 10.0 s | < 3.0 s | Desde emisión de evento hasta ACK de FCM/APNs |
| **Latencia de Entrega Email (p95)**| < 30.0 s | < 10.0 s | Desde emisión hasta ACK del proveedor SMTP/API |
| **Tasa de Duplicidad de Alertas** | 0% absoluto | 0% | Verificación por clave de idempotencia |
| **Reintentos ante Caídas Externas**| 3 reintentos con backoff | 5 reintentos exponenciales | Errores de red o 5xx de pasarelas |

---

## 3. Idempotencia y Prevención de Envíos Duplicados
- **Clave de Idempotencia del Mensaje:** Toda tarea encolada en BullMQ debe incluir un `jobId` determinista generado a partir de:
  $$\text{jobId} = \text{hash}(\text{tipo\_evento}, \text{destinatario\_id}, \text{entidad\_origen\_id}, \text{fecha\_dia})$$
- Si un worker se reinicia o la red se interrumpe y la tarea se reintenta, el motor de colas detecta el `jobId` duplicado y omite un segundo envío al usuario dentro de una ventana de 24 horas.

---

## 4. Política de Reintentos y Dead-Letter Queue (DLQ)
- **Estrategia de Backoff Exponencial:**
  - Intento 1: Inmediato.
  - Intento 2: Espera de 15 segundos.
  - Intento 3: Espera de 2 minutos.
  - Intento 4: Espera de 10 minutos.
- **Dead-Letter Queue (DLQ):** Si tras el último reintento la entrega falla definitivamente (por ejemplo, cuota de API agotada o fallo mayor de infraestructura), el trabajo se mueve a la cola `notifications-dead-letter` y emite una alerta a los logs de observabilidad (Sentry/Datadog) para intervención técnica sin bloquear las colas activas.

---

## 5. Control de Sobrecarga y Rate Limiting
- **Throttling por Proveedor:** Los workers deben implementar limitación de tasa (*rate limiting*) compatible con los límites de la capa gratuita o contratada del proveedor (ej. máximo 50 emails por segundo en Resend) para evitar códigos `429 Too Many Requests`.

---

## 6. Estado real de implementación

### N1 (Ola 3) — implementado
- **Idempotencia por `jobId`:** esquema determinista
  `notif_{categoria}_{tipoEvento}_{destinatarioId}_{referenciaId}_{YYYYMMDD}` (separador `_`,
  compatible con BullMQ 5.x). Los jobs completados se retienen ≥24h (`removeOnComplete.age`) para
  cubrir la ventana de deduplicación de 24 horas. Dedupe verificado empíricamente contra el Redis
  del proyecto (re-emitir el mismo evento no crea un segundo job).
- **Dead-Letter Queue:** los jobs que agotan intentos se copian a `<cola>-dead-letter` desde el
  listener `failed` del worker, con payload de triaje (`colaOrigen`, `jobIdOriginal`, `error`,
  `intentosRealizados`, `fallidoEnUtc`) y `jobId` determinista en la DLQ. Aplica a las tres colas del
  pipeline (`notificaciones-push`, `notificaciones-email` y `notificaciones-resumen-semanal`,
  incluida su DLQ propia tras el fix D1) y a `cobranza-dead-letter`; todas visibles en Bull-Board y
  el reencolado manual documentado en `dead-letter.ts`.
- **Push con reintentos reales:** el worker relanza errores transitorios del proveedor (BullMQ
  reintenta con backoff) y solo desactiva tokens muertos sin reintento (RF-016 RN-04). La entrega
  sigue simulada (log): integración FCM/APNs pendiente de proveedor.
- **Backoff del §4:** el worker de email usa la política exacta 15s → 2min → 10min vía
  `settings.backoffStrategy` (verificado empíricamente contra el Redis del proyecto).
- **Rate limiting (§5):** `limiter` por worker — email 50/s (límite de Resend citado en el
  requisito; ver API-4 abajo, el proveedor real es Brevo), push 100/s conservador.
- Verificación empírica de jobId/DLQ/reintentos contra el Redis de docker (encola → falla → DLQ →
  limpieza) y tests de API en verde (621 casos, 37 archivos).

### API-4 (2026-10-04, `79ba082`) — email real con Brevo
- Implementado (2026-10-04, API-4 `79ba082`) — el worker de email **entrega de verdad** vía la API
  HTTP de Brevo ([[ADR-018-proveedor-correo-transaccional-brevo]]); antes la entrega era simulada.
  Sin `BREVO_API_KEY`/`EMAIL_REMITENTE` sigue en modo simulado (log), avisado al arrancar.
  - **Reintentos (§4):** errores transitorios (red o tiempo de espera de 10 s, 408, 429, 5xx) se
    relanzan y BullMQ aplica el backoff exacto 15 s → 2 min → 10 min. Los **permanentes** (resto de
    4xx) lanzan `UnrecoverableError`: no se reintentan y se copian **de inmediato** a la DLQ.
  - **DLQ sin datos sensibles:** para los correos de cuenta (bienvenidas y recuperación) la copia en
    `notificaciones-email-dead-letter` lleva solo tipo, usuario y destinatario enmascarado
    (`a***@dominio`), **sin el enlace ni el correo completo**; esos correos no se reencolan desde la
    DLQ (el usuario pide un enlace nuevo). El detalle del error de Brevo se recorta a 120 caracteres
    y se le quitan los correos.
  - **Retención:** fallidos de correos de cuenta **24 h** (`RETENCION_FALLIDOS_CORREO_CUENTA`) y
    completados eliminados al entregarse (`removeOnComplete: true`); DLQ **7 días / 1000** registros
    (`RETENCION_DLQ`), podada con `Queue.clean(..., 'wait')` al mover cada job (si la poda falla
    solo avisa).
  - **Rate limiting (§5):** `LIMITADOR_WORKER_EMAIL` se mantiene en **50/s**; la ruta de Brevo admite
    1000 RPS (429 al superarlo, tratado como transitorio). El **tope diario del plan gratuito
    (300/día, ADR-018)** no lo controla el limitador: al agotarlo los envíos fallan y terminan en la
    DLQ.
  - **Idempotencia:** los correos de cuenta usan `jobId` `cuenta_{tipo}_{usuarioId}_{huella}` (huella
    SHA-256 del código): el mismo enlace no se encola dos veces; uno nuevo sí.
  - **Redis caído:** el encolado de correos de cuenta se acota a 2,5 s y no llama a `add` si la
    conexión no está lista; el flujo de negocio nunca falla por ello.
  - Evidencia: API 986 → **1087** tests (1 skipped; `apps/api/test/bdd/api4-correo-real.spec.ts`,
    `api4-correo-garantias.spec.ts`); web 785 → **797**.

### Pendiente
- **Alerta de observabilidad (Sentry/Datadog):** la DLQ se registra en logs, sin integración
  externa todavía.
- **SLOs de latencia (p95) sin verificar:** requieren instrumentación (el email ya usa proveedor
  real desde API-4; push sigue simulado).
- **Reintento por token en Push:** el job agrupa los N tokens del usuario; un fallo transitorio
  reintenta el lote completo. La integración real debería trocear por token o registrar entregas
  por token.
