/**
 * WU-H (ADR-008 §4.4): protección del dashboard Bull-Board montado en `/admin/queues`.
 *
 * Reglas de seguridad (NUNCA público):
 * - Sin `BULL_BOARD_USER` / `BULL_BOARD_PASS` configurados la ruta responde 404 (no se revela
 *   siquiera que el dashboard existe).
 * - Con credenciales configuradas exige HTTP Basic Auth; sin cabecera válida responde 401 con
 *   `WWW-Authenticate`.
 * - La comparación de credenciales usa `timingSafeEqual` para no filtrar longitud/contenido por
 *   tiempo de respuesta.
 */
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

export const BULL_BOARD_USER_ENV = 'BULL_BOARD_USER';
export const BULL_BOARD_PASS_ENV = 'BULL_BOARD_PASS';

/** Comparación en tiempo constante; longitudes distintas nunca son iguales. */
export function compararCredencialSegura(recibida: string, esperada: string): boolean {
  const bufferRecibida = Buffer.from(recibida, 'utf8');
  const bufferEsperada = Buffer.from(esperada, 'utf8');

  if (bufferRecibida.length !== bufferEsperada.length) return false;
  return timingSafeEqual(bufferRecibida, bufferEsperada);
}

function responderNoAutorizado(res: Response): void {
  res.set('WWW-Authenticate', 'Basic realm="GUACHAFIT Queues"');
  res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
}

/**
 * Middleware Express puro (sin dependencias de Nest) para poder testearlo de forma aislada.
 * `env` es inyectable con default `process.env`.
 */
export function crearBullBoardAuthMiddleware(
  env: NodeJS.ProcessEnv = process.env
): (req: Request, res: Response, next: NextFunction) => void {
  const usuarioEsperado = (env[BULL_BOARD_USER_ENV] ?? '').trim();
  const passwordEsperada = (env[BULL_BOARD_PASS_ENV] ?? '').trim();

  return function bullBoardAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Sin credenciales configuradas la ruta queda DESHABILITADA (404, jamás pública).
    if (!usuarioEsperado || !passwordEsperada) {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }

    const [esquema, credencial] = (req.headers.authorization ?? '').split(' ');
    if (esquema?.toLowerCase() !== 'basic' || !credencial) {
      responderNoAutorizado(res);
      return;
    }

    const decodificado = Buffer.from(credencial, 'base64').toString('utf8');
    const separador = decodificado.indexOf(':');
    const usuario = separador >= 0 ? decodificado.slice(0, separador) : '';
    const password = separador >= 0 ? decodificado.slice(separador + 1) : '';

    if (
      compararCredencialSegura(usuario, usuarioEsperado) &&
      compararCredencialSegura(password, passwordEsperada)
    ) {
      next();
      return;
    }

    responderNoAutorizado(res);
  };
}
