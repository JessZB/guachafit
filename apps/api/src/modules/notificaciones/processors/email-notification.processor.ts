/**
 * RF-014 RN-03 / RNF-004 (Ola 3): worker de la cola `notificaciones-email`.
 *
 * - La ENTREGA la hace el adaptador de correo inyectado (`ADAPTADOR_CORREO`): Brevo por su API
 *   HTTP si hay `BREVO_API_KEY`; si no, el adaptador simulado (solo log).
 * - Error transitorio (red, 429, 5xx) → RELANZA para que BullMQ reintente con el backoff del
 *   RNF-004 §4 (15s → 2min → 10min) sin bloquear la API.
 * - Error permanente (4xx: correo inválido, clave/remitente mal configurados) → `UnrecoverableError`:
 *   BullMQ no reintenta y el job se copia a la DLQ para triaje.
 * - Los jobs que agotan intentos se copian a la DLQ (`notificaciones-email-dead-letter`).
 * - Rate limit: 50/s por worker (ver `LIMITADOR_WORKER_EMAIL`).
 *
 * El job puede traer el correo ya armado (`html`, p. ej. bienvenidas y recuperación) o solo
 * `asunto` + `cuerpo` (avisos del despachador): en ese caso se arma la plantilla genérica.
 *
 * Los logs llevan el destinatario enmascarado (`a***@dominio`), nunca el correo completo.
 */
import { Inject, Logger, Optional } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { moverJobADeadLetter } from '../dead-letter';
import {
  COLA_EMAIL,
  CONCURRENCIA_WORKER_EMAIL,
  LIMITADOR_WORKER_EMAIL,
  nombreColaDlq,
  retrocesoRnf004,
} from '../notificaciones.config';
import {
  ADAPTADOR_CORREO,
  AdaptadorCorreo,
  ErrorEntregaCorreoPermanente,
  MensajeCorreo,
} from '../correo/adaptador-correo';
import { AdaptadorCorreoSimulado } from '../correo/adaptador-correo-simulado';
import { crearAdaptadorCorreo } from '../correo/crear-adaptador-correo';
import { plantillaNotificacionGenerica } from '../correo/plantillas-correo';
import { obtenerUrlWeb } from '../../../common/config/correo';
import { enmascararCorreo } from '../../../common/enmascarar-correo.util';

export interface EmailJobPayload {
  usuarioId: string;
  email: string;
  asunto: string;
  /** Texto plano del correo. */
  cuerpo: string;
  tipoEvento: string;
  linkAccion?: string | null;
  datosAdicionales?: Record<string, any>;
  esCriticoSeguridad?: boolean;
  /** HTML ya armado (correos de cuenta). Sin él se usa la plantilla genérica. */
  html?: string;
  nombreDestinatario?: string | null;
}

/** Sin adaptador inyectado (tests que instancian el worker a mano): simulado en test. */
function adaptadorPorDefecto(): AdaptadorCorreo {
  return process.env.NODE_ENV === 'test' ? new AdaptadorCorreoSimulado() : crearAdaptadorCorreo();
}

@Processor(COLA_EMAIL, {
  concurrency: CONCURRENCIA_WORKER_EMAIL,
  limiter: LIMITADOR_WORKER_EMAIL,
  // RNF-004 §4: política exacta de backoff (el job trae `backoff: { type: 'custom' }`).
  settings: { backoffStrategy: retrocesoRnf004 },
})
export class EmailNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailNotificationProcessor.name);
  private readonly adaptador: AdaptadorCorreo;

  constructor(
    @InjectQueue(nombreColaDlq(COLA_EMAIL)) private readonly dlq: Queue,
    @Optional() @Inject(ADAPTADOR_CORREO) adaptador?: AdaptadorCorreo
  ) {
    super();
    this.adaptador = adaptador ?? adaptadorPorDefecto();
  }

  private armarMensaje(datos: EmailJobPayload): MensajeCorreo {
    const para = { email: datos.email, nombre: datos.nombreDestinatario ?? null };
    if (datos.html) {
      return { para, asunto: datos.asunto, html: datos.html, texto: datos.cuerpo };
    }
    const generico = plantillaNotificacionGenerica({
      titulo: datos.asunto,
      cuerpo: datos.cuerpo,
      enlace: datos.linkAccion,
      // Única fuente de la URL pública (`APP_URL`), la misma que usa el despachador.
      urlWeb: obtenerUrlWeb(),
    });
    return { para, asunto: generico.asunto, html: generico.html, texto: generico.texto };
  }

  async process(job: Job<EmailJobPayload, any, string>): Promise<{ status: 'sent' | 'retrying' }> {
    const { asunto, tipoEvento } = job.data;
    const email = enmascararCorreo(job.data.email);
    this.logger.log(
      `[Worker Email] Procesando job #${job.id} para ${email} (Evento: ${tipoEvento}, Intento: ${job.attemptsMade + 1})`
    );

    try {
      const resultado = await this.adaptador.enviar(this.armarMensaje(job.data));
      this.logger.log(
        `[Worker Email] Correo entregado al proveedor para ${email}: "${asunto}"${
          resultado.idMensaje ? ` (id ${resultado.idMensaje})` : ''
        }`
      );
      return { status: 'sent' };
    } catch (error: any) {
      if (error instanceof ErrorEntregaCorreoPermanente) {
        this.logger.error(
          `[Worker Email] Fallo PERMANENTE para ${email} (sin reintentos): ${error.message}`
        );
        throw new UnrecoverableError(error.message);
      }
      this.logger.error(
        `[Worker Email] Fallo en intento ${job.attemptsMade + 1} para ${email}: ${error?.message}`
      );
      // BullMQ reintentará con el backoff del RNF-004 sin bloquear la API (RF-014 RN-03).
      throw error;
    }
  }

  /**
   * RNF-004 §4: al agotar intentos, el job se copia a la DLQ (visible en Bull-Board). Un fallo
   * permanente (`UnrecoverableError`) no se reintenta, así que también se copia de inmediato.
   */
  @OnWorkerEvent('failed')
  async alAgotarIntentos(job: Job, error: Error): Promise<void> {
    const permanente = error instanceof UnrecoverableError || error?.name === 'UnrecoverableError';
    await moverJobADeadLetter(this.dlq, COLA_EMAIL, job, error, permanente);
  }
}
