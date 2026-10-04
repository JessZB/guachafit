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
 *    Los correos de cuenta NO se reencolan así: su copia no lleva el enlace (ver
 *    `datosParaDeadLetter`); el usuario pide un enlace nuevo.
 *    OJO: el `jobId` original sigue retenido en el set de fallidos (7 días; 24 h los correos
 *    de cuenta); para forzar un
 *    reintento inmediato hay que borrar primero ese registro (`job.remove()`) o usar
 *    `job.retry()` sobre el job fallido original, que es la vía recomendada.
 *
 * Verificado empíricamente contra el Redis del proyecto: el evento `failed` se emite en CADA
 * intento con `attemptsMade` ya incrementado, y al agotar `opts.attempts` el job queda en estado
 * `failed` (por eso la condición es `attemptsMade >= attempts`).
 */
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { enmascararCorreo } from '../../common/enmascarar-correo.util';
import { esTipoCorreoCuenta } from './events/eventos-correo-cuenta';
import { RETENCION_DLQ } from './notificaciones.config';

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
 * Datos del job que se copian a la DLQ.
 *
 * Los correos de cuenta llevan en `html`/`cuerpo` el enlace con el código de un solo uso: a la DLQ
 * solo va el tipo, el usuario y el destinatario enmascarado (suficiente para el triaje; el
 * reencolado de estos correos se hace pidiendo un enlace nuevo, no reenviando el viejo). El resto
 * de jobs se copia completo para poder reencolarlo a mano.
 */
export function datosParaDeadLetter(datos: unknown): unknown {
  const registro = datos as Record<string, unknown> | null;
  if (!registro || typeof registro !== 'object' || !esTipoCorreoCuenta(registro.tipoEvento)) {
    return datos;
  }
  return {
    tipoEvento: registro.tipoEvento,
    usuarioId: registro.usuarioId ?? null,
    email: enmascararCorreo(typeof registro.email === 'string' ? registro.email : ''),
  };
}

/**
 * Poda de la DLQ: sus jobs quedan en espera para siempre (no hay worker), así que se borran los
 * que superan la retención (`RETENCION_DLQ`). Si la poda falla no se interrumpe nada: solo avisa.
 */
async function podarDeadLetter(dlq: Queue, logger: Logger): Promise<void> {
  if (typeof (dlq as Partial<Queue>).clean !== 'function') return;
  try {
    await dlq.clean(RETENCION_DLQ.age * 1000, RETENCION_DLQ.count, 'wait');
  } catch (error) {
    logger.warn(
      `[DLQ] No se pudo podar '${dlq.name}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
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
  error: Error,
  // Un fallo permanente (`UnrecoverableError`) no agota intentos pero tampoco se reintentará:
  // también va a la DLQ para triaje.
  forzar = false
): Promise<boolean> {
  const logger = new Logger('DeadLetterQueue');

  if (!forzar && !agotoIntentos(job)) return false;

  const payload: JobDeadLetterPayload = {
    colaOrigen,
    jobIdOriginal: job.id ?? null,
    nombreJob: job.name,
    datos: datosParaDeadLetter(job.data),
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
    await podarDeadLetter(dlq, logger);
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
