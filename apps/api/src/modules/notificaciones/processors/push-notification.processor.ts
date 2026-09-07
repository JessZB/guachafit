import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DispositivosService } from '../dispositivos.service';

export interface PushJobPayload {
  usuarioId: string;
  tokens: string[];
  titulo: string;
  cuerpo: string;
  tipoEvento: string;
  linkAccion?: string | null;
  datosAdicionales?: Record<string, any>;
}

@Processor('notificaciones-push')
export class PushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  constructor(private readonly dispositivosService: DispositivosService) {
    super();
  }

  async process(job: Job<PushJobPayload, any, string>): Promise<{ delivered: number; failed: number }> {
    const { usuarioId, tokens, titulo, cuerpo, tipoEvento } = job.data;
    this.logger.log(`[Worker Push] Procesando job #${job.id} para usuario ${usuarioId} (${tokens.length} tokens)`);

    let delivered = 0;
    let failed = 0;

    for (const token of tokens) {
      try {
        // Simulación / Integración de envío WebPush / FCM / APNs
        // En caso de tokens de prueba marcados como inválidos o caducados:
        if (token.includes('invalid') || token.includes('unregistered') || token.includes('dead')) {
          throw new Error('messaging/registration-token-not-registered');
        }

        // Envío exitoso simulado
        this.logger.debug(`[Worker Push] Notificación enviada a token ${token.slice(0, 10)}...: "${titulo}"`);
        delivered++;
      } catch (error: any) {
        failed++;
        const errorMessage = error?.message || '';

        // Detección reactiva de tokens obsoletos (RF-016 RN-04)
        if (
          errorMessage.includes('registration-token-not-registered') ||
          errorMessage.includes('invalid-registration-token') ||
          errorMessage.includes('BadDeviceToken') ||
          errorMessage.includes('Unregistered')
        ) {
          this.logger.warn(`[Worker Push] Token obsoleto detectado (${errorMessage}). Desactivando...`);
          await this.dispositivosService.marcarTokenInvalido(token);
        } else {
          this.logger.error(`[Worker Push] Error al despachar a token ${token.slice(0, 10)}...:`, error);
        }
      }
    }

    return { delivered, failed };
  }
}
