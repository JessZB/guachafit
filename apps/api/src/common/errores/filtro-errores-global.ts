/**
 * LOTE API-2: filtro global de errores.
 *
 * - `HttpException`: se responde igual que NestJS por defecto (`{ statusCode, message, error }` o el
 *   cuerpo propio de la excepción, p. ej. con `code`), que es lo que lee `apps/web/src/lib/api-client.ts`.
 * - ZodError no capturado: 400 con el primer problema traducido a español claro.
 * - Errores del lector del cuerpo (JSON mal formado, demasiado grande, tipo no soportado…): su
 *   estado 4xx real con un mensaje claro, sin el detalle del parser.
 * - Cualquier otro error: 500 con un mensaje genérico y una referencia corta; el detalle (y el
 *   stack) solo va al log junto con esa referencia, el método y la ruta (sin query ni cuerpo).
 * - Si la respuesta ya empezó a enviarse, no se intenta escribir otra: solo se registra el error.
 */
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  INestApplication,
  Logger,
} from '@nestjs/common';
import {
  esErrorDeValidacion,
  traducirErrorValidacion,
  MENSAJE_VALIDACION_GENERICO,
} from './traducir-error-validacion';

export const MENSAJE_ERROR_INTERNO = 'Tuvimos un problema. Inténtalo de nuevo en unos minutos.';
export const MENSAJE_CUERPO_DEMASIADO_GRANDE =
  'El archivo o los datos son demasiado grandes. Prueba con uno más liviano.';
export const MENSAJE_TIPO_NO_SOPORTADO = 'Ese tipo de archivo no es compatible.';

/** Mensaje claro por estado 4xx del lector del cuerpo; el resto usa el genérico de validación. */
const MENSAJE_POR_ESTADO_CLIENTE: Record<number, string> = {
  [HttpStatus.PAYLOAD_TOO_LARGE]: MENSAJE_CUERPO_DEMASIADO_GRANDE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: MENSAJE_TIPO_NO_SOPORTADO,
};

/**
 * NestJS convierte el `SyntaxError` del lector de JSON (y el `URIError` de una ruta mal codificada)
 * en un 400 cuyo mensaje es el texto crudo en inglés del parser: se reemplaza por uno claro.
 */
const PATRON_ERROR_DEL_PARSER = /JSON|^Unexpected |^Expected |^Bad (control|escaped)|URI malformed/;

interface RespuestaHttp {
  headersSent?: boolean;
  status(codigo: number): { json(cuerpo: unknown): unknown };
  destroy?(): unknown;
}

interface PeticionHttp {
  method?: string;
  originalUrl?: string;
  url?: string;
}

/** Nombre estándar del estado HTTP (`http.STATUS_CODES`), nunca otro distinto al real. */
function nombreEstado(estado: number): string {
  return STATUS_CODES[estado] ?? 'Error';
}

/** Método y ruta de la petición, sin query string (puede llevar datos personales). */
function describirPeticion(peticion: PeticionHttp | undefined): string {
  const ruta = (peticion?.originalUrl ?? peticion?.url ?? '').split('?')[0];
  return `${peticion?.method ?? '?'} ${ruta || '/'}`;
}

/** Errores 4xx de `body-parser`/`http-errors` (p. ej. JSON mal formado): `expose` y `status`. */
function estadoErrorDelCliente(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const { status, statusCode, expose } = error as {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
  };
  const estado = typeof status === 'number' ? status : statusCode;
  return expose === true && typeof estado === 'number' && estado >= 400 && estado < 500
    ? estado
    : null;
}

@Catch()
export class FiltroErroresGlobal implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const http = host.switchToHttp();
    const respuesta = http.getResponse<RespuestaHttp>();
    const peticion = http.getRequest<PeticionHttp>();

    if (respuesta.headersSent) {
      // Ya no se puede responder otra cosa: se registra y se corta la conexión (como Express) para
      // que el cliente no tome la respuesta a medias como completa.
      this.registrar(exception, `${describirPeticion(peticion)} (respuesta ya iniciada)`);
      respuesta.destroy?.();
      return;
    }

    if (exception instanceof HttpException) {
      const estado = exception.getStatus();
      const cuerpo = exception.getResponse();
      if (
        estado === HttpStatus.BAD_REQUEST &&
        typeof exception.message === 'string' &&
        PATRON_ERROR_DEL_PARSER.test(exception.message)
      ) {
        respuesta.status(estado).json({
          statusCode: estado,
          message: MENSAJE_VALIDACION_GENERICO,
          error: nombreEstado(estado),
        });
        return;
      }
      respuesta
        .status(estado)
        .json(typeof cuerpo === 'string' ? { statusCode: estado, message: cuerpo } : cuerpo);
      return;
    }

    if (esErrorDeValidacion(exception)) {
      respuesta.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: traducirErrorValidacion(exception),
        error: nombreEstado(HttpStatus.BAD_REQUEST),
      });
      return;
    }

    const estadoCliente = estadoErrorDelCliente(exception);
    if (estadoCliente !== null) {
      respuesta.status(estadoCliente).json({
        statusCode: estadoCliente,
        message: MENSAJE_POR_ESTADO_CLIENTE[estadoCliente] ?? MENSAJE_VALIDACION_GENERICO,
        error: nombreEstado(estadoCliente),
      });
      return;
    }

    // Referencia corta para cruzar lo que ve el usuario con el log (sin datos personales).
    const referencia = randomUUID().slice(0, 8);
    this.registrar(exception, `[ref ${referencia}] ${describirPeticion(peticion)}`);
    respuesta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: `${MENSAJE_ERROR_INTERNO} (Ref. ${referencia})`,
      error: nombreEstado(HttpStatus.INTERNAL_SERVER_ERROR),
      referencia,
    });
  }

  private registrar(exception: unknown, contexto: string): void {
    const detalle = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `${contexto}: ${detalle}`,
      exception instanceof Error ? exception.stack : undefined
    );
  }
}

/** Registra el filtro global (usado por `main.ts` y por los tests que montan la app HTTP). */
export function configurarErroresGlobales(app: INestApplication): void {
  app.useGlobalFilters(new FiltroErroresGlobal());
}
