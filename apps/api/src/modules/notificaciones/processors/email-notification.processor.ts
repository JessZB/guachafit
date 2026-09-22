/**
 * RF-014 RN-03 / RNF-004 (Ola 3): worker de la cola `notificaciones-email`.
 *
 * - La ENTREGA sigue SIMULADA (log): la integración real con Resend/SendGrid/SMTP es una
 *   integración pendiente de proveedor.
 * - Ante error del proveedor RELANZA el error para que BullMQ reintente con el backoff del
 *   RNF-004 §4 (15s → 2min → 10min) sin bloquear la API.
 * - Los jobs que agotan intentos se copian a la DLQ (`notificaciones-email-dead-letter`).
 * - Rate limit: 50/s por worker (límite de la capa gratuita de Resend citado en el RNF-004 §5).
 */
import { Logger } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { moverJobADeadLetter } from '../dead-letter';
import {
  COLA_EMAIL,
  CONCURRENCIA_WORKER_EMAIL,
  LIMITADOR_WORKER_EMAIL,
  nombreColaDlq,
  retrocesoRnf004,
} from '../notificaciones.config';

export interface EmailJobPayload {
  usuarioId: string;
  email: string;
  asunto: string;
  cuerpo: string;
  tipoEvento: string;
  linkAccion?: string | null;
  datosAdicionales?: Record<string, any>;
  esCriticoSeguridad?: boolean;
}

@Processor(COLA_EMAIL, {
  concurrency: CONCURRENCIA_WORKER_EMAIL,
  limiter: LIMITADOR_WORKER_EMAIL,
  // RNF-004 §4: política exacta de backoff (el job trae `backoff: { type: 'custom' }`).
  settings: { backoffStrategy: retrocesoRnf004 },
})
export class EmailNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailNotificationProcessor.name);

  constructor(@InjectQueue(nombreColaDlq(COLA_EMAIL)) private readonly dlq: Queue) {
    super();
  }

  async process(job: Job<EmailJobPayload, any, string>): Promise<{ status: 'sent' | 'retrying' }> {
    const { usuarioId, email, asunto, tipoEvento, esCriticoSeguridad } = job.data;
    this.logger.log(
      `[Worker Email] Procesando job #${job.id} para ${email} (Evento: ${tipoEvento}, Intento: ${job.attemptsMade + 1})`
    );

    try {
      // Simulación de despacho vía Resend / SendGrid / SMTP
      if (email.includes('error-500-simulado')) {
        throw new Error('503 Service Unavailable: Provider downstream timeout');
      }

      this.logger.log(`[Worker Email] Correo electrónico entregado exitosamente a ${email}: "${asunto}"`);
      return { status: 'sent' };
    } catch (error: any) {
      this.logger.error(`[Worker Email] Fallo en intento ${job.attemptsMade + 1} para ${email}: ${error.message}`);
      // BullMQ reintentará automáticamente con backoff exponencial sin bloquear la API (RF-014 RN-03)
      throw error;
    }
  }

  /** RNF-004 §4: al agotar intentos, el job se copia a la DLQ (visible en Bull-Board). */
  @OnWorkerEvent('failed')
  async alAgotarIntentos(job: Job, error: Error): Promise<void> {
    await moverJobADeadLetter(this.dlq, COLA_EMAIL, job, error);
  }
}
