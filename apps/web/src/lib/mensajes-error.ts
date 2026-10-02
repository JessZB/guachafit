/**
 * Acceso y roles (B1-B5, B9): traducción centralizada de errores de la API a mensajes humanos.
 *
 * La API responde con el cuerpo por defecto de NestJS (`{ statusCode, message, error }`) o con
 * un ProblemDetails (`detail`). Algunos mensajes de negocio ya son legibles y deben llegar tal cual
 * al usuario (cascada coach-alumnos, `alumno-habilitado.guard`); otros son técnicos (guards JWT,
 * roles, Zod, errores internos) y se reemplazan por un texto claro según el código HTTP.
 */

export const MENSAJE_SIN_CONEXION =
  'No hay conexión a internet. Revisa tu red e inténtalo de nuevo.';
export const MENSAJE_SESION_VENCIDA = 'Tu sesión venció. Inicia sesión de nuevo.';
export const MENSAJE_CREDENCIALES_INCORRECTAS = 'Correo o contraseña incorrectos.';
export const MENSAJE_SIN_PERMISO = 'No tienes permiso para ver esta sección.';
export const MENSAJE_ERROR_GENERICO =
  'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';

/**
 * Heurística explícita: un mensaje del servidor es "técnico" si menciona piezas internas
 * (tenant, bearer, jwt, token, refresh, lista de roles, Zod, null/undefined, stack de errores) o
 * si es solo la frase HTTP estándar en inglés ("Unauthorized", "Forbidden"...).
 * También cubre los rechazos internos de la API de entrenamiento (máquina de estados de la
 * sesión, identificadores, UTC, decimales en texto, nombres de campos del contrato).
 */
export const PATRON_MENSAJE_TECNICO =
  /tenant|bearer|jwt|token|refresh|roles \[|autorizaci[oó]n ausente|internal server error|zod|undefined|null|http error|exception|cannot read|stack|transici[oó]n inv[aá]lida|operaci[oó]n denegada|con id '|uuid|\butc\b|string decimal|bloqueid/i;

const FRASES_HTTP_ESTANDAR =
  /^\s*(unauthorized|forbidden|bad request|not found|conflict|unprocessable entity|service unavailable|bad gateway|gateway timeout|too many requests)\s*\.?\s*$/i;

/** Longitud máxima razonable de un mensaje pensado para mostrarse en pantalla. */
const LONGITUD_MAXIMA_AMIGABLE = 300;

export function esMensajeAmigable(mensaje: unknown): mensaje is string {
  if (typeof mensaje !== 'string') return false;
  const limpio = mensaje.trim();
  if (limpio.length === 0 || limpio.length > LONGITUD_MAXIMA_AMIGABLE) return false;
  if (FRASES_HTTP_ESTANDAR.test(limpio)) return false;
  return !PATRON_MENSAJE_TECNICO.test(limpio);
}

/** Mensaje suelto (p. ej. `resultados[].error` de una asignación masiva) listo para mostrarse. */
export function traducirMensajeSuelto(mensaje: unknown): string {
  return esMensajeAmigable(mensaje) ? mensaje.trim() : MENSAJE_ERROR_GENERICO;
}

/** Panel de cambios por enviar: explica un rechazo sin mostrar texto técnico. */
export function describirRechazoCola(lastError: string | null | undefined): string {
  const motivo = esMensajeAmigable(lastError) ? lastError.trim() : null;
  if (!motivo || motivo === MENSAJE_ERROR_GENERICO) {
    return 'No se pudo guardar este cambio. Puedes reintentar o descartarlo.';
  }
  return `No se pudo guardar este cambio: ${motivo} Puedes reintentar o descartarlo.`.replace(
    /([^.!?])\s+Puedes reintentar/,
    '$1. Puedes reintentar'
  );
}

/** Texto del servidor (`detail` RFC 7807 o `message` de NestJS); las listas de validación no cuentan. */
export function extraerMensajeServidor(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return null;
  const { detail, message } = cuerpo as { detail?: unknown; message?: unknown };
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof message === 'string' && message.trim()) return message;
  return null;
}

/**
 * - `login`: el 401 habla de credenciales, no de sesión.
 * - `publico`: endpoints sin sesión (registro, activación, coach público): el 401 no es "sesión vencida".
 * - `general`: peticiones autenticadas.
 */
export type ContextoErrorHttp = 'login' | 'publico' | 'general';

export function traducirErrorHttp(
  status: number,
  mensajeServidor: string | null,
  contexto: ContextoErrorHttp
): string {
  const amigable = esMensajeAmigable(mensajeServidor) ? mensajeServidor.trim() : null;

  if (status >= 500) return MENSAJE_ERROR_GENERICO;

  if (status === 401) {
    if (amigable) return amigable;
    if (contexto === 'login') return MENSAJE_CREDENCIALES_INCORRECTAS;
    if (contexto === 'publico') return MENSAJE_ERROR_GENERICO;
    return MENSAJE_SESION_VENCIDA;
  }

  if (status === 403) return amigable ?? MENSAJE_SIN_PERMISO;

  return amigable ?? MENSAJE_ERROR_GENERICO;
}
