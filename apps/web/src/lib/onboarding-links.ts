/**
 * WU-E (RF-011): helpers de enlaces de onboarding y validación de credenciales.
 *
 * Centralizan la construcción de URLs públicas (deep link del coach y activación del alumno) para
 * que la UI nunca hardcodee un `coach_code` ni un origen distinto al real.
 */

export const MENSAJE_COACH_NO_DISPONIBLE =
  'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.';

export const MENSAJE_ACTIVACION_INVALIDA =
  'Este enlace ya no sirve: venció o ya se usó. Pídele uno nuevo a tu entrenador.';

export const MINIMO_CARACTERES_PASSWORD = 8;
export const MAXIMO_CARACTERES_PASSWORD = 100;

/** Formato compartido del `coach_code` (espejo de `COACH_CODE_REGEX` en @guachafit/shared). */
const COACH_CODE_REGEX = /^[A-Za-z0-9_-]{4,15}$/;

/** Normaliza un código de coach: sin espacios y en mayúsculas (como lo persiste la API). */
export function normalizarCoachCode(valor: string | null | undefined): string {
  return (valor ?? '').trim().toUpperCase();
}

/** `true` si el código tiene formato de coach_code; evita lanzar consultas con basura. */
export function esFormatoCoachCodeValido(valor: string | null | undefined): boolean {
  return COACH_CODE_REGEX.test(normalizarCoachCode(valor));
}

/** Deep link de captación del coach: `/onboarding?coach=CODE` con el código normalizado. */
export function construirLinkOnboarding(coachCode: string, origin: string): string {
  return `${origin}/onboarding?coach=${encodeURIComponent(normalizarCoachCode(coachCode))}`;
}

/** Enlace de activación de un alumno recién creado a mano: `/activar?token=...`. */
export function construirLinkActivacion(token: string, origin: string): string {
  return `${origin}/activar?token=${encodeURIComponent(token)}`;
}

/**
 * A10: `/registro` es un alias público de `/onboarding`. Conserva toda la query y traduce el
 * parámetro legado `coach_code` al canónico `coach` (sin pisar un `coach` explícito).
 */
export function construirDestinoRegistro(search: string): string {
  const parametros = new URLSearchParams(search);
  const coachLegado = parametros.get('coach_code');
  parametros.delete('coach_code');
  if (coachLegado && !parametros.has('coach')) {
    parametros.set('coach', coachLegado);
  }
  const query = parametros.toString();
  return query ? `/onboarding?${query}` : '/onboarding';
}

/** C8: el alta respondió 409 (correo ya registrado): la UI ofrece ir a iniciar sesión. */
export function esErrorCorreoYaRegistrado(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 409;
}

/**
 * Valida la contraseña del flujo de activación (misma regla que `EstablecerPasswordConTokenSchema`).
 * Devuelve el mensaje de error o `null` si es válida.
 */
export function validarPasswordActivacion(
  password: string,
  confirmacion: string
): string | null {
  if (password.length < MINIMO_CARACTERES_PASSWORD) {
    return `La contraseña debe tener al menos ${MINIMO_CARACTERES_PASSWORD} caracteres.`;
  }
  if (password.length > MAXIMO_CARACTERES_PASSWORD) {
    return `La contraseña no puede superar los ${MAXIMO_CARACTERES_PASSWORD} caracteres.`;
  }
  if (password !== confirmacion) {
    return 'Las contraseñas no coinciden.';
  }
  return null;
}
