/**
 * Lógica pura del flujo "¿Olvidaste tu contraseña?".
 *
 * - `/recuperar`: pide el correo → `POST /auth/recuperar-password` → mensaje genérico (el servidor
 *   nunca revela si el correo está registrado).
 * - `/restablecer?token=…`: nueva contraseña (misma regla que la activación, ver
 *   `validarPasswordActivacion`) → `POST /auth/restablecer-password` → `/login` con aviso.
 *
 * Los textos que se comparan con lo que responde el API salen de `@guachafit/shared` (misma
 * fuente que el API): si cambian, cambian en los dos lados a la vez.
 */
import {
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
  MENSAJE_RECUPERACION_SOLICITADA,
  VIGENCIA_ENLACE_RECUPERACION_MS,
  textoVigencia,
} from '@guachafit/shared';

/** Respuesta única del servidor a `POST /auth/recuperar-password`. */
export const MENSAJE_RECUPERACION_ENVIADA = MENSAJE_RECUPERACION_SOLICITADA;

/** Enlace inexistente, vencido o ya usado (el 404 del API). */
export const MENSAJE_RECUPERACION_INVALIDA = MENSAJE_ENLACE_RECUPERACION_INVALIDO;

/** Aviso que ve el usuario en el inicio de sesión tras restablecer su contraseña. */
export const AVISO_PASSWORD_ACTUALIZADA = MENSAJE_PASSWORD_ACTUALIZADA;

/** Vigencia del enlace de recuperación para los textos ("1 hora"). */
export const VIGENCIA_RECUPERACION_TEXTO = textoVigencia(VIGENCIA_ENLACE_RECUPERACION_MS);

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarCorreoRecuperacion(email: string): string {
  return email.trim().toLowerCase();
}

/** Devuelve el mensaje de error del campo correo o `null` si es válido. */
export function validarCorreoRecuperacion(email: string): string | null {
  const limpio = email.trim();
  if (!limpio) return 'Escribe tu correo electrónico.';
  if (!FORMATO_CORREO.test(limpio)) return 'Revisa tu correo: no tiene un formato válido.';
  return null;
}

/** Código del enlace (`?token=…`) recortado; vacío si no viene. */
export function leerTokenDeBusqueda(search: string): string {
  return new URLSearchParams(search).get('token')?.trim() ?? '';
}

/** El servidor responde 404 cuando el enlace no existe, venció o ya se usó. */
export function esEnlaceRecuperacionInvalido(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 404;
}

interface EstadoLoginConAviso {
  aviso: string;
}

/** Estado de navegación hacia `/login` que muestra el aviso de contraseña actualizada. */
export function construirEstadoLoginConAviso(): EstadoLoginConAviso {
  return { aviso: AVISO_PASSWORD_ACTUALIZADA };
}

/**
 * Lee el aviso del estado de navegación de `/login`. Solo acepta avisos conocidos: el estado de
 * navegación nunca es una fuente de texto libre para la pantalla.
 */
export function leerAvisoLogin(estado: unknown): string | null {
  const aviso = (estado as { aviso?: unknown } | null | undefined)?.aviso;
  return aviso === AVISO_PASSWORD_ACTUALIZADA ? aviso : null;
}
