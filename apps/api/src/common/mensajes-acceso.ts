/**
 * B2/B3/B4/B9 (LOTE API-1): textos de autenticación y acceso que llegan al usuario final.
 *
 * Español claro, con tuteo y sin jerga interna (nada de token, JWT, tenant, roles en mayúsculas):
 * la web (`apps/web/src/lib/mensajes-error.ts`, `PATRON_MENSAJE_TECNICO`) reemplaza cualquier
 * mensaje técnico, así que estos textos deben pasar su filtro para mostrarse tal cual. El detalle
 * técnico de cada rechazo va solo a los logs.
 */

export const MENSAJE_SESION_VENCIDA = 'Tu sesión venció. Inicia sesión de nuevo.';
export const MENSAJE_SIN_PERMISO = 'No tienes permiso para ver esta sección.';
/** A6: único mensaje de credenciales; no revela si el correo existe ni el estado de la cuenta. */
export const MENSAJE_CREDENCIALES_INCORRECTAS = 'Correo o contraseña incorrectos.';
/** Cuenta inactiva o bloqueada (en login solo se informa con la contraseña correcta). */
export const MENSAJE_CUENTA_DESACTIVADA = 'Tu cuenta está desactivada. Contacta a tu entrenador.';
/** RF-012 RN-02: alumno con baja lógica (archivado). */
export const MENSAJE_CUENTA_ARCHIVADA = 'Tu cuenta está archivada. Contacta a tu entrenador.';
/** B4: el alumno pertenece a otro entrenador (o es otro alumno). */
export const MENSAJE_SIN_ACCESO_ALUMNO = 'No tienes acceso a este alumno.';
/** A5: respuesta 429 del límite de intentos (pasa el filtro de mensajes técnicos de la web). */
export const MENSAJE_DEMASIADOS_INTENTOS =
  'Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo.';
