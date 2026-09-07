import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

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

@Processor('notificaciones-email')
export class EmailNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailNotificationProcessor.name);

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
}
