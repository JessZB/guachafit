/**
 * Adaptador de correo SIMULADO (sin `BREVO_API_KEY`, en desarrollo y en test).
 *
 * Solo registra el envío en el log. Conserva el fallo simulado (`error-500-simulado` en el correo)
 * que usan las pruebas de resiliencia del RNF-004 para ejercitar reintentos y DLQ.
 */
import { Logger } from '@nestjs/common';
import {
  AdaptadorCorreo,
  ErrorEntregaCorreoTransitorio,
  MensajeCorreo,
  ResultadoEnvioCorreo,
} from './adaptador-correo';

export class AdaptadorCorreoSimulado implements AdaptadorCorreo {
  private readonly logger = new Logger(AdaptadorCorreoSimulado.name);
  readonly entregaReal = false;

  async enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvioCorreo> {
    if (mensaje.para.email.includes('error-500-simulado')) {
      throw new ErrorEntregaCorreoTransitorio('503 Service Unavailable: Provider downstream timeout');
    }
    this.logger.log(
      `[Correo simulado] Para ${mensaje.para.email}: "${mensaje.asunto}" (configura BREVO_API_KEY para enviarlo de verdad)`
    );
    return { idMensaje: null };
  }
}
