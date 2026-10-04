---
id: ADR-018
titulo: "ADR-018: Brevo como Proveedor de Correo Transaccional vía API HTTP en el Worker de Email"
fecha: 2026-10-04
estado: aceptado
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - notificaciones
  - email
  - infraestructura
---

# ADR-018: Brevo como Proveedor de Correo Transaccional vía API HTTP en el Worker de Email

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
El worker de email ya existe (`apps/api/src/modules/notificaciones/processors/email-notification.processor.ts`), pero la **entrega es simulada**: solo escribe en el log. Para salir a producción hacen falta correos reales:

- **Bienvenida** al alumno: [[RF-011-onboarding-alumnos-manual-deeplink]] RN-05.
- **Recuperación de contraseña.**
- **Recordatorios de cobro** ([[RF-008-maquina-estados-cuota-recordatorios]]), que pueden concentrarse en un mismo día.

[[ADR-010-arquitectura-event-driven-notificaciones-multicanal]] define el canal email como un worker **sustituible**: el proveedor se cambia sin tocar el despachador.

- **Problema a resolver:** elegir el proveedor que entrega los correos del worker, con costo cero en la etapa inicial y margen para picos diarios.
- **Restricciones y Fuerzas:**
  - **Costo vs. margen diario:** los planes gratuitos difieren sobre todo en el tope **por día**, que es lo que limita los recordatorios de cobro.
  - **Simplicidad vs. flexibilidad:** una API HTTP simple frente a servicios más potentes pero con más configuración.
  - **Entregabilidad:** el correo no debe caer en spam; enviarlo desde el propio VPS no es viable ([[ADR-017-despliegue-vps-coolify]]).
- **Opciones consideradas** (precios verificados el 2026-10-04):

| Opción | Plan gratuito | Plan de pago | Observación |
|---|---|---|---|
| *A — Resend* | 3.000/mes, **tope 100/día** | Pro USD 20/mes | API simple; el tope diario es bajo. |
| *B — Brevo* | **300/día** (~9.000/mes) | Starter desde USD 9/mes por 5.000, sin tope diario | **Seleccionada.** |
| *C — Amazon SES* | 3.000/mes gratis durante 12 meses | USD 0,10 por 1.000 | Más barata a escala, pero más compleja de configurar (IAM, salida del sandbox). |
| *D — SMTP propio en el VPS* | — | — | **Descartada:** puerto 25 bloqueado por los proveedores de VPS, reputación de IP nula y configuración SPF/DKIM/DMARC propia. |

---

## 3. Decisión
Elegimos **Brevo** como proveedor de correo transaccional, integrado **mediante su API HTTP** y **solo dentro del worker de email**. La razón principal es el **margen diario**: 300 correos/día gratis cubren los recordatorios de cobro sin costo, frente a los 100/día de Resend.

### Detalles de la Implementación
1. **Punto único de integración:** `email-notification.processor.ts`. El despachador, las colas y la matriz de preferencias no cambian ([[ADR-010-arquitectura-event-driven-notificaciones-multicanal]]).
2. **Sustituible:** cambiar de proveedor (p. ej. a SES) implica reescribir solo el envío dentro del worker.
3. **Configuración por entorno:** API key y remitente por variables de entorno (nombres a definir en el lote 4; propuesta: `BREVO_API_KEY` y remitente).
4. **Modo simulado por defecto:** sin API key configurada, el worker sigue simulando la entrega (log). Desarrollo y tests no envían correos reales.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Costo cero en la etapa inicial con ~9.000 correos/mes.
- **C2:** Margen diario (300/día) para picos de recordatorios de cobro.
- **C3:** El cambio queda aislado en un solo archivo; el resto del sistema de notificaciones no se toca.
- **C4:** Desarrollo seguro: sin API key no sale ningún correo real.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1 — Verificar el dominio remitente:** hay que publicar registros SPF, DKIM y DMARC en el DNS de Cloudflare antes de enviar; si no, los correos irán a spam o serán rechazados.
- **T2 — Revisar el límite del worker:** hoy el limitador es de **50/s**, justificado con la capa gratuita de Resend (RNF-004 §5, ver [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]]). Debe ajustarse al límite de la API de Brevo y actualizarse el RNF.
- **T3 — Vigilar el tope de 300/día:** al superarlo de forma sostenida hay que pasar al plan Starter (desde USD 9/mes, sin tope diario).
- **T4 — Dependencia de un tercero:** una caída de Brevo retrasa los correos; los reintentos y la DLQ de BullMQ ([[ADR-008-motor-colas-background-workers-bullmq]]) absorben fallas temporales.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** correos de bienvenida y recuperación sin entregar en producción; costo por correo en la etapa inicial; baja entregabilidad de un SMTP propio.
- **Riesgo Residual:** superar el tope diario en picos de cobranza sin notarlo; correos en spam si SPF/DKIM/DMARC no quedan bien configurados.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-011-onboarding-alumnos-manual-deeplink]] (RN-05), [[RF-008-maquina-estados-cuota-recordatorios]], [[RF-014-arquitectura-event-driven-despachador-notificaciones]], [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]] (§5).
- Decisiones relacionadas: [[ADR-010-arquitectura-event-driven-notificaciones-multicanal]], [[ADR-008-motor-colas-background-workers-bullmq]], [[ADR-017-despliegue-vps-coolify]].
- Implementación: `apps/api/src/modules/notificaciones/correo/` (adaptadores) y `apps/api/src/modules/notificaciones/processors/email-notification.processor.ts` (worker); ver §6.
- Guía operativa: [[04_Guia_Despliegue_VPS_Coolify]] (variables de correo y DNS).
- Documentación externa: precios de Resend, Brevo y Amazon SES consultados el 2026-10-04.

---

## 6. Implementación (2026-10-04, API-4 `79ba082`)
- **Dónde vive:** `apps/api/src/modules/notificaciones/correo/`:
  - `adaptador-correo.ts`: contrato `AdaptadorCorreo` (token `ADAPTADOR_CORREO`) y errores `ErrorEntregaCorreoTransitorio` / `ErrorEntregaCorreoPermanente`.
  - `adaptador-correo-brevo.ts`: API HTTP con `fetch` (**sin SDK**), tiempo de espera de 10 s.
  - `adaptador-correo-simulado.ts`: solo log (desarrollo y tests).
  - `crear-adaptador-correo.ts`: elige el adaptador al arrancar y registra los problemas de configuración (en producción como error, **sin bloquear** el arranque).
  - `plantillas-correo.ts`: plantillas puras (bienvenida de alumno, de entrenador, recuperación y aviso genérico).
  - Configuración en `apps/api/src/common/config/correo.ts`.
- **Variables reales** (sustituyen la propuesta del punto 3 de §3):
  - `BREVO_API_KEY`: clave de la API (cabecera `api-key`). Sin ella → modo simulado.
  - `EMAIL_REMITENTE`: remitente o dominio verificado en Brevo. Con clave pero sin remitente → también modo simulado (Brevo rechazaría todo con 400).
  - `EMAIL_REMITENTE_NOMBRE`: nombre visible (por defecto `GUACHAFIT`).
  - `APP_URL`: URL pública de la web para los enlaces (`/activar`, `/restablecer`, avisos). Si falta usa el primer origen de `CORS_ORIGINS` y luego `http://localhost:3000`; en producción su ausencia se registra como error.
- **Verificado en la documentación oficial de Brevo** (developers.brevo.com, "Send a transactional email"): `POST https://api.brevo.com/v3/smtp/email` con cabecera `api-key`; cuerpo `sender`, `to`, `subject`, `htmlContent`, `textContent`; respuestas **201** `{ messageId }` (**202** si es programado) y **400** `{ code, message }`; límite de la ruta **1000 peticiones/s** en los planes generales (429 al superarlo).
- **No verificado:** la semántica exacta de **401/402/403** (se asumen clave inválida / sin créditos / IP o cuenta no autorizada y se tratan como permanentes, con pista de revisar la clave y las IP autorizadas) y cómo expone la API el **tope diario del plan gratuito** (300/día): no hay control propio de ese tope.
- **Clasificación de errores:** red/tiempo de espera, 408, 429 y 5xx → transitorios (reintento con el backoff de RNF-004 §4); resto de 4xx → permanentes (`UnrecoverableError`, sin reintento, copia inmediata a la DLQ). El detalle del error se recorta a 120 caracteres y se le quitan los correos.
- **T2 resuelto:** `LIMITADOR_WORKER_EMAIL` se mantiene en **50/s**, muy por debajo de los 1000 RPS de Brevo; RNF-004 actualizado.
- **Desviación del punto 1 de §3:** el adaptador sí está aislado en el worker, pero el **despachador sí cambió**: escucha los nuevos eventos `correo-cuenta.**` (bienvenidas y recuperación), arma esos correos y los encola sin pasar por In-App ni preferencias (ver [[RF-014-arquitectura-event-driven-despachador-notificaciones]] §7).
- Evidencia: API 986 → **1087** tests (1 skipped; `apps/api/test/bdd/api4-correo-real.spec.ts`, `api4-correo-garantias.spec.ts`); web 785 → **797**. Sin envío real contra Brevo registrado en el commit (pruebas con `fetch` simulado).
