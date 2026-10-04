/**
 * Acceso a la cuenta: vigencias de los enlaces de un solo uso y textos que el API envía y la web
 * compara por igualdad. Viven aquí para que ambos lados usen la MISMA fuente: si un texto cambia
 * en un solo lado, la web dejaría de reconocerlo.
 */

const UNA_HORA_MS = 60 * 60 * 1000;

/** Enlace de activación (bienvenida de alumno o entrenador): 48 horas. */
export const VIGENCIA_ENLACE_ACTIVACION_MS = 48 * UNA_HORA_MS;

/** Enlace para restablecer la contraseña: 1 hora. */
export const VIGENCIA_ENLACE_RECUPERACION_MS = UNA_HORA_MS;

/** Vigencia legible para textos: `1 hora`, `48 horas`. */
export function textoVigencia(ms: number): string {
  const horas = Math.round(ms / UNA_HORA_MS);
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

/** Respuesta única de la recuperación (no revela si el correo está registrado). */
export const MENSAJE_RECUPERACION_SOLICITADA =
  'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.';

/** Enlace de recuperación inexistente, vencido o ya usado. */
export const MENSAJE_ENLACE_RECUPERACION_INVALIDO =
  'Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo.';

/** Contraseña restablecida (la web lo muestra como aviso en el inicio de sesión). */
export const MENSAJE_PASSWORD_ACTUALIZADA = 'Tu contraseña se actualizó. Ya puedes iniciar sesión.';
