/**
 * RNF-004 §4 (Ola 3): Dead-Letter Queue de las colas de notificaciones.
 *
 * BullMQ no trae DLQ nativa: el patrón canónico es escuchar el evento `failed` del worker y,
 * cuando el job AGOTÓ sus intentos, copiarlo a una cola `<origen>-dead-letter` que ningún worker
 * consume (queda visible y auditable en Bull-Board).
 *
 * Reencolado manual (documentado):
 * 1. Bull-Board (`/admin/queues`) → cola `<origen>-dead-letter` → abrir el job y usar "Retry"
 *    (lo mueve a `wait` de la MISMA cola dead-letter; para reinyectarlo al pipeline hay que
 *    re-encolarlo en la cola de origen).
 * 2. Programa/consola: `await colaOrigen.add(job.nombreJob, job.datos, { jobId: ... })`.
 *    OJO: el `jobId` original sigue retenido en el set de fallidos (7 días); para forzar un
 *    reintento inmediato hay que borrar primero ese registro (`job.remove()`) o usar
 *    `job.retry()` sobre el job fallido original, que es la vía recomendada.
 *
 * Verificado empíricamente contra el Redis del proyecto: el evento `failed` se emite en CADA
 * intento con `attemptsMade` ya incrementado, y al agotar `opts.attempts` el job queda en estado
 * `failed` (por eso la condición es `attemptsMade >= attempts`).
 */
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

/** Carga útil del job en la DLQ: todo lo necesario para triaje y reencolado manual. */
export interface JobDeadLetterPayload {
  colaOrigen: string;
  jobIdOriginal: string | null;
  nombreJob: string;
  datos: unknown;
  error: string;
  intentosRealizados: number;
  fallidoEnUtc: string;
}

/** `true` cuando el job ya consumió todos sus intentos (no habrá más reintentos de BullMQ). */
export function agotoIntentos(job: Job): boolean {
  const intentosMaximos = job.opts?.attempts ?? 1;
  return (job.attemptsMade ?? 0) >= intentosMaximos;
}

/**
 * `jobId` determinista del job en la DLQ: si el mismo job fallido se procesa dos veces (p. ej.
 * dos workers emiten `failed` por un stalled), BullMQ no duplica la entrada.
 */
export function construirJobIdDlq(colaOrigen: string, jobId?: string | null): string {
  return `dlq_${colaOrigen}_${jobId ?? 'sin-id'}`;
}

/**
 * Mueve el job a la DLQ si agotó intentos. Devuelve `false` si aún le quedan reintentos.
 *
 * La DLQ no tiene worker: el job permanece en `wait` como registro de intervención manual.
 */
export async function moverJobADeadLetter(
  dlq: Queue,
  colaOrigen: string,
  job: Job,
  error: Error
): Promise<boolean> {
  const logger = new Logger('DeadLetterQueue');

  if (!agotoIntentos(job)) return false;

  const payload: JobDeadLetterPayload = {
    colaOrigen,
    jobIdOriginal: job.id ?? null,
    nombreJob: job.name,
    datos: job.data,
    error: error?.message ?? 'Error desconocido',
    intentosRealizados: job.attemptsMade,
    fallidoEnUtc: new Date().toISOString(),
  };

  try {
    await dlq.add('job-fallido', payload, {
      jobId: construirJobIdDlq(colaOrigen, job.id),
    });
    logger.error(
      `[DLQ] Job '${job.id}' de '${colaOrigen}' agotó ${job.attemptsMade} intentos y fue movido a '${dlq.name}': ${payload.error}`
    );
    return true;
  } catch (dlqError) {
    // Un fallo del propio DLQ jamás debe tumbar al worker ni ocultar el fallo original.
    logger.error(
      `[DLQ] No se pudo mover el job '${job.id}' de '${colaOrigen}' a '${dlq.name}': ${
        dlqError instanceof Error ? dlqError.message : String(dlqError)
      }`
    );
    return false;
  }
}
