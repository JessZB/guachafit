/**
 * Puerto de salida del correo transaccional (ADR-008/ADR-010, RNF-004).
 *
 * Solo el worker de la cola `notificaciones-email` lo usa; los módulos de negocio nunca envían
 * correo directamente (emiten un evento de dominio).
 *
 * Contrato de errores (lo traduce el worker a la política de reintentos de BullMQ):
 * - `ErrorEntregaCorreoTransitorio`: red, tiempo de espera, 429 o 5xx → se relanza y BullMQ
 *   reintenta con el backoff del RNF-004 §4.
 * - `ErrorEntregaCorreoPermanente`: 4xx definitivos (correo inválido, clave o remitente mal
 *   configurados) → no se reintenta (`UnrecoverableError`) y el job va a la DLQ.
 */

export interface MensajeCorreo {
  para: { email: string; nombre?: string | null };
  asunto: string;
  html: string;
  texto: string;
}

export interface ResultadoEnvioCorreo {
  /** Id del proveedor (`messageId` de Brevo); `null` en modo simulado. */
  idMensaje: string | null;
}

export interface AdaptadorCorreo {
  /**
   * `true` si el adaptador entrega el correo de verdad (Brevo). El simulado solo lo escribe en el
   * log: con él la API no debe decirle al usuario que le enviamos un correo.
   */
  readonly entregaReal: boolean;
  enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvioCorreo>;
}

/** Token de inyección del adaptador (ver `NotificacionesModule`). */
export const ADAPTADOR_CORREO = 'ADAPTADOR_CORREO';

export class ErrorEntregaCorreoTransitorio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorEntregaCorreoTransitorio';
  }
}

export class ErrorEntregaCorreoPermanente extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorEntregaCorreoPermanente';
  }
}
