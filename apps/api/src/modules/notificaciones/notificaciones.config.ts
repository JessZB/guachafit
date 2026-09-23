/**
 * RNF-004 (Ola 3): configuración del pipeline de notificaciones.
 *
 * Centraliza:
 * 1. Nombres de cola y de sus Dead-Letter Queues.
 * 2. El esquema del `jobId` determinista (idempotencia de entregas).
 * 3. Reintentos/backoff (§4), retención y rate limiting por worker (§5).
 */
import { EventoNotificacionPayload } from '@guachafit/shared';

// =============================================================================
// COLAS
// =============================================================================

/** Colas BullMQ del pipeline (ADR-010 §3). */
export const COLA_PUSH = 'notificaciones-push';
export const COLA_EMAIL = 'notificaciones-email';
export const COLA_RESUMEN_SEMANAL = 'notificaciones-resumen-semanal';
/** RF-003 RN-01 (WU RF-003a): barrido horario de recordatorios de check-in antropométrico. */
export const COLA_ANTROPOMETRIA_RECORDATORIO = 'notificaciones-antropometria-recordatorio';

/** Sufijo de la Dead-Letter Queue de cada cola de origen (RNF-004 §4). */
export const SUFIJO_COLA_DLQ = '-dead-letter';

/** `notificaciones-push` → `notificaciones-push-dead-letter`. */
export function nombreColaDlq(colaOrigen: string): string {
  return `${colaOrigen}${SUFIJO_COLA_DLQ}`;
}

// =============================================================================
// IDEMPOTENCIA (jobId determinista)
// =============================================================================

/**
 * Referencia de origen del evento: `referenciaId` explícito o la primera clave conocida de
 * `datosAdicionales`. `sin-ref` es honesto: el día UTC sigue acotando la deduplicación.
 */
export function resolverReferenciaEvento(payload: EventoNotificacionPayload): string {
  const explicita = payload.referenciaId?.trim();
  if (explicita) return explicita;

  const datos = payload.datosAdicionales ?? {};
  // Prioridad: transacción (pago) > sesión > cuota > alumno. Es un fallback defensivo: los
  // emisores actuales pasan `referenciaId` explícito.
  const candidatas = [datos.transaccionId, datos.sesionId, datos.cuotaId, datos.alumnoId];
  const primera = candidatas.find(
    (valor) => typeof valor === 'string' && valor.trim().length > 0
  );
  return primera ?? 'sin-ref';
}

/**
 * `jobId` determinista (RNF-004 §3 / ADR-010 §3.2):
 *
 * ```
 * notif_{categoria}_{tipoEvento}_{destinatarioId}_{referenciaId}_{YYYYMMDD}
 * ```
 *
 * - Separador `_` (nunca `:`): BullMQ 5.x rechaza `:` en ids personalizados (ver ADR-008 §3.1).
 * - `YYYYMMDD` es el día UTC de emisión: la fórmula del RNF-004 incluye `fecha_dia`, así que
 *   re-emisiones/reintentos dentro de la MISMA jornada UTC comparten id y BullMQ las descarta;
 *   un recordatorio legítimo de otro día (T-5 vs T-1) obtiene un id nuevo.
 * - Los jobs completados se retienen ≥24h (`removeOnComplete.age`) para cubrir la ventana de
 *   deduplicación de 24 horas que exige el RNF-004 §3.
 */
export function construirJobIdNotificacion(
  payload: EventoNotificacionPayload,
  ahora: Date = new Date()
): string {
  const diaUtc = ahora.toISOString().slice(0, 10).replace(/-/g, '');
  return [
    'notif',
    payload.categoria,
    payload.tipoEvento,
    payload.destinatarioUserId,
    resolverReferenciaEvento(payload),
    diaUtc,
  ].join('_');
}

// =============================================================================
// REINTENTOS, RETENCIÓN Y RATE LIMIT (RNF-004 §4 y §5)
// =============================================================================

/**
 * Backoff exacto del RNF-004 §4 (intento 1 inmediato; reintentos a los 15s, 2min y 10min).
 * Se usa como `settings.backoffStrategy` del worker de email junto con `backoff: { type: 'custom' }`.
 */
export function retrocesoRnf004(intentosRealizados: number): number {
  switch (intentosRealizados) {
    case 1:
      return 15_000;
    case 2:
      return 120_000;
    default:
      return 600_000;
  }
}

/**
 * Retención de jobs:
 * - `removeOnComplete.age = 24h`: ventana de deduplicación por `jobId` del RNF-004 §3.
 * - `removeOnFail.age = 7 días`: triaje de fallos y auditoría del DLQ sin crecer sin límite.
 */
const RETENCION_COMPLETADOS = { age: 24 * 60 * 60, count: 5000 };
const RETENCION_FALLIDOS = { age: 7 * 24 * 60 * 60, count: 5000 };

/** Push: 4 intentos (1 + 3 reintentos) con backoff exponencial corto (latencia p95 < 3s). */
export const OPCIONES_JOB_PUSH = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: RETENCION_COMPLETADOS,
  removeOnFail: RETENCION_FALLIDOS,
};

/** Email: 4 intentos con el backoff exacto del RNF-004 §4 (custom `retrocesoRnf004`). */
export const OPCIONES_JOB_EMAIL = {
  attempts: 4,
  backoff: { type: 'custom' as const },
  removeOnComplete: RETENCION_COMPLETADOS,
  removeOnFail: RETENCION_FALLIDOS,
};

/** Digest semanal: mismo esquema de reintentos que email (una re-ejecución semanal es inocua). */
export const OPCIONES_JOB_RESUMEN_SEMANAL = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 30 * 24 * 60 * 60, count: 500 },
  removeOnFail: RETENCION_FALLIDOS,
};

/**
 * RF-003 RN-01 (WU RF-003a): barrido horario del recordatorio antropométrico.
 *
 * Es un job repetible (no un envío diferido): retiene los completados una semana para observarlo en
 * Bull-Board sin que la cola crezca sin límite. La idempotencia real del aviso vive en la BD
 * (persistencia In-App por día local + `jobId` determinista de push/email en el despachador).
 */
export const OPCIONES_JOB_ANTROPOMETRIA_RECORDATORIO = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
  removeOnFail: RETENCION_FALLIDOS,
};

/**
 * Rate limiting por worker (RNF-004 §5):
 * - Email: máximo 50/s (límite de la capa gratuita de Resend citado en el requisito).
 * - Push: 100/s conservador (las cuotas de FCM/APNs son mucho mayores; ajustable por env futuro).
 */
export const LIMITADOR_WORKER_EMAIL = { max: 50, duration: 1000 };
export const LIMITADOR_WORKER_PUSH = { max: 100, duration: 1000 };
export const CONCURRENCIA_WORKER_EMAIL = 5;
export const CONCURRENCIA_WORKER_PUSH = 10;
