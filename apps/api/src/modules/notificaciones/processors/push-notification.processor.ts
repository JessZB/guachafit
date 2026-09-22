/**
 * RF-014 RN-03 / RF-016 RN-04 / RNF-004 (Ola 3): worker de la cola `notificaciones-push`.
 *
 * - La ENTREGA sigue SIMULADA (log): la integración real con FCM/APNs/WebPush es una
 *   integración pendiente de proveedor (no hay SDK ni credenciales en este entregable).
 * - Errores REINTENTABLES (caída/5xx del proveedor) se RELANZAN para que BullMQ reintente de
 *   verdad con backoff; los tokens muertos (`registration-token-not-registered`, etc.) NO se
 *   reintentan: se desactivan reactivamente (RF-016 RN-04) y el job no se cae por ellos.
 * - Los jobs que agotan intentos se copian a la DLQ (`notificaciones-push-dead-letter`).
 *
 * Limitación documentada (MVP): el job agrupa los N tokens activos del usuario; si UN token
 * falla de forma reintentable, el reintento re-procesa el lote completo (re-log simulado). La
 * integración real debería trocear por token o registrar entregas por token.
 */
import { Logger } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DispositivosService } from '../dispositivos.service';
import { moverJobADeadLetter } from '../dead-letter';
import {
  COLA_PUSH,
  CONCURRENCIA_WORKER_PUSH,
  LIMITADOR_WORKER_PUSH,
  nombreColaDlq,
} from '../notificaciones.config';

export interface PushJobPayload {
  usuarioId: string;
  tokens: string[];
  titulo: string;
  cuerpo: string;
  tipoEvento: string;
  linkAccion?: string | null;
  datosAdicionales?: Record<string, any>;
}

/** Marcadores de token muerto del proveedor (RF-016 RN-04). */
function esTokenMuerto(errorMessage: string): boolean {
  return (
    errorMessage.includes('registration-token-not-registered') ||
    errorMessage.includes('invalid-registration-token') ||
    errorMessage.includes('BadDeviceToken') ||
    errorMessage.includes('Unregistered')
  );
}

@Processor(COLA_PUSH, {
  concurrency: CONCURRENCIA_WORKER_PUSH,
  // RNF-004 §5: rate limit simple por cola (los límites de FCM/APNs son mucho mayores).
  limiter: LIMITADOR_WORKER_PUSH,
})
export class PushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  constructor(
    private readonly dispositivosService: DispositivosService,
    @InjectQueue(nombreColaDlq(COLA_PUSH)) private readonly dlq: Queue
  ) {
    super();
  }

  async process(job: Job<PushJobPayload, any, string>): Promise<{ delivered: number; failed: number }> {
    const { usuarioId, tokens, titulo, cuerpo, tipoEvento } = job.data;
    this.logger.log(`[Worker Push] Procesando job #${job.id} para usuario ${usuarioId} (${tokens.length} tokens)`);

    let delivered = 0;
    let tokensMuertos = 0;
    let fallosReintentables = 0;

    for (const token of tokens) {
      try {
        // Simulación / Integración de envío WebPush / FCM / APNs (pendiente de proveedor).
        // Tokens de prueba marcados como inválidos/caducados simulan un token muerto.
        if (token.includes('invalid') || token.includes('unregistered') || token.includes('dead')) {
          throw new Error('messaging/registration-token-not-registered');
        }
        // Tokens marcados como transitorios simulan una caída 5xx del proveedor.
        if (token.includes('error-500-simulado') || token.includes('transient')) {
          throw new Error('503 Service Unavailable: push provider downstream timeout');
        }

        // Envío exitoso simulado
        this.logger.debug(`[Worker Push] Notificación enviada a token ${token.slice(0, 10)}...: "${titulo}"`);
        delivered++;
      } catch (error: any) {
        const errorMessage = error?.message || '';

        // Detección reactiva de tokens obsoletos (RF-016 RN-04): NO son reintentables.
        if (esTokenMuerto(errorMessage)) {
          tokensMuertos++;
          this.logger.warn(`[Worker Push] Token obsoleto detectado (${errorMessage}). Desactivando...`);
          await this.dispositivosService.marcarTokenInvalido(token);
        } else {
          fallosReintentables++;
          this.logger.error(`[Worker Push] Error transitorio al despachar a token ${token.slice(0, 10)}...:`, error);
        }
      }
    }

    // RNF-004 §4: relanzar para que BullMQ reintente con backoff ante fallos del proveedor.
    if (fallosReintentables > 0) {
      throw new Error(
        `Push provider con ${fallosReintentables} token(s) en fallo transitorio (evento ${tipoEvento})`
      );
    }

    return { delivered, failed: tokensMuertos };
  }

  /** RNF-004 §4: al agotar intentos, el job se copia a la DLQ (visible en Bull-Board). */
  @OnWorkerEvent('failed')
  async alAgotarIntentos(job: Job, error: Error): Promise<void> {
    await moverJobADeadLetter(this.dlq, COLA_PUSH, job, error);
  }
}
