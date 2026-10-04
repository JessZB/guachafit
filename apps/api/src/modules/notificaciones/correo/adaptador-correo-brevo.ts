/**
 * Adaptador de correo con la API HTTP transaccional de Brevo (sin SDK, con `fetch`).
 *
 * Contrato verificado en la documentación oficial (developers.brevo.com, "Send a transactional
 * email"):
 * - `POST https://api.brevo.com/v3/smtp/email`, cabecera `api-key`.
 * - Cuerpo: `sender { name, email }`, `to [{ email, name? }]`, `subject`, `htmlContent`,
 *   `textContent`.
 * - Respuestas: 201 `{ messageId }` (202 si es programado); 400 `{ code, message }`.
 * - Límite de la ruta: 1000 peticiones/s en los planes generales (más en Advanced/Enterprise);
 *   al superarlo responde 429.
 *
 * Clasificación de errores: red/tiempo de espera, 408, 429 y 5xx son transitorios (reintento de
 * BullMQ); el resto de 4xx (400 correo inválido, 401 clave, 403 IP/cuenta no autorizada, 402 sin
 * créditos) son permanentes: reintentar con el mismo contenido no los arregla.
 */
import {
  AdaptadorCorreo,
  ErrorEntregaCorreoPermanente,
  ErrorEntregaCorreoTransitorio,
  MensajeCorreo,
  ResultadoEnvioCorreo,
} from './adaptador-correo';

export const URL_API_BREVO_CORREO = 'https://api.brevo.com/v3/smtp/email';
/** Tiempo máximo de espera de la petición a Brevo antes de tratarla como fallo transitorio. */
export const TIEMPO_ESPERA_BREVO_MS = 10_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpcionesAdaptadorBrevo {
  apiKey: string;
  remitente: { email: string; nombre: string };
  /** Inyectable para pruebas; por defecto el `fetch` global de Node 18+. */
  fetch?: FetchLike;
  tiempoEsperaMs?: number;
}

const PISTA_CREDENCIALES_BREVO = ' Revisa BREVO_API_KEY y las IP autorizadas de la cuenta de Brevo.';

/** Códigos HTTP que justifican reintentar más tarde. */
function esEstadoTransitorio(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Largo máximo del `message` de Brevo que se registra (llega a los logs y a la DLQ). */
export const LARGO_MAXIMO_DETALLE_BREVO = 120;

/**
 * Detalle del rechazo para el operador: `code` y el inicio del `message`, acotado y sin correos
 * (Brevo suele citar el destinatario en el texto, p. ej. "email x@y is not valid").
 */
async function leerDetalle(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { code?: unknown; message?: unknown };
    const codigo = typeof cuerpo?.code === 'string' ? cuerpo.code : '';
    const mensaje =
      typeof cuerpo?.message === 'string'
        ? cuerpo.message.replace(/[^\s@]+@[^\s@]+/g, '[correo]').slice(0, LARGO_MAXIMO_DETALLE_BREVO)
        : '';
    return [codigo, mensaje].filter((parte) => parte.length > 0).join(': ');
  } catch {
    return '';
  }
}

export class AdaptadorCorreoBrevo implements AdaptadorCorreo {
  readonly entregaReal = true;
  private readonly fetchImpl: FetchLike;
  private readonly tiempoEsperaMs: number;

  constructor(private readonly opciones: OpcionesAdaptadorBrevo) {
    this.fetchImpl = opciones.fetch ?? ((url, init) => fetch(url, init));
    this.tiempoEsperaMs = opciones.tiempoEsperaMs ?? TIEMPO_ESPERA_BREVO_MS;
  }

  async enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvioCorreo> {
    const destinatario: { email: string; name?: string } = { email: mensaje.para.email };
    if (mensaje.para.nombre?.trim()) destinatario.name = mensaje.para.nombre.trim();

    const cuerpo = {
      sender: { name: this.opciones.remitente.nombre, email: this.opciones.remitente.email },
      to: [destinatario],
      subject: mensaje.asunto,
      htmlContent: mensaje.html,
      textContent: mensaje.texto,
    };

    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(URL_API_BREVO_CORREO, {
        method: 'POST',
        headers: {
          'api-key': this.opciones.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.tiempoEsperaMs),
      });
    } catch (error) {
      // Red caída, DNS o tiempo de espera agotado: transitorio.
      const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new ErrorEntregaCorreoTransitorio(`No se pudo contactar a Brevo (${detalle})`);
    }

    if (respuesta.ok) {
      let idMensaje: string | null = null;
      try {
        const datos = (await respuesta.json()) as { messageId?: unknown };
        idMensaje = typeof datos?.messageId === 'string' ? datos.messageId : null;
      } catch {
        idMensaje = null;
      }
      return { idMensaje };
    }

    const detalle = await leerDetalle(respuesta);
    const descripcion = `Brevo respondió ${respuesta.status}${detalle ? ` (${detalle})` : ''}`;
    if (esEstadoTransitorio(respuesta.status)) {
      throw new ErrorEntregaCorreoTransitorio(descripcion);
    }
    // Pista para el operador (solo log/DLQ): la clave o las IP autorizadas están mal configuradas.
    const problemaDeCredenciales = respuesta.status === 401 || respuesta.status === 403;
    const pista = problemaDeCredenciales ? PISTA_CREDENCIALES_BREVO : '';
    throw new ErrorEntregaCorreoPermanente(`${descripcion}.${pista}`);
  }
}
