/**
 * A3 (LOTE API-1): ÚNICA fuente de los secretos JWT del API.
 *
 * - Producción (`NODE_ENV=production`): `JWT_SECRET` y `JWT_REFRESH_SECRET` son obligatorios y no
 *   pueden ser los valores de ejemplo. Si faltan, el API no arranca (fail-fast) con un mensaje
 *   que le dice al operador qué variable configurar.
 * - Desarrollo/test: si falta la variable se usa el valor por defecto de abajo. Ningún otro
 *   archivo debe declarar un secreto por defecto: todos leen de aquí.
 */

/** Valor por defecto SOLO para desarrollo/test (también es el valor de ejemplo prohibido en producción). */
export const JWT_SECRET_DESARROLLO = 'guachafit_jwt_super_secret_key_2026';
/** Valor por defecto SOLO para desarrollo/test (también es el valor de ejemplo prohibido en producción). */
export const JWT_REFRESH_SECRET_DESARROLLO = 'guachafit_jwt_refresh_super_secret_key_2026';

export interface SecretosJwt {
  jwtSecret: string;
  refreshSecret: string;
}

type EntornoSecretos = Partial<Record<'NODE_ENV' | 'JWT_SECRET' | 'JWT_REFRESH_SECRET', string | undefined>>;

function secretoDeProduccion(
  nombre: 'JWT_SECRET' | 'JWT_REFRESH_SECRET',
  valor: string | undefined,
  valorDeEjemplo: string
): string {
  const limpio = valor?.trim();
  if (!limpio) {
    throw new Error(
      `[Configuración] Falta la variable de entorno ${nombre}. En producción es obligatoria: ` +
        `define un secreto largo y aleatorio (p. ej. "openssl rand -base64 48") antes de arrancar el API.`
    );
  }
  if (limpio === valorDeEjemplo) {
    throw new Error(
      `[Configuración] ${nombre} tiene el valor de ejemplo. En producción debes reemplazarlo por un ` +
        `secreto propio, largo y aleatorio, antes de arrancar el API.`
    );
  }
  return limpio;
}

export function obtenerSecretosJwt(entorno: EntornoSecretos = process.env): SecretosJwt {
  if (entorno.NODE_ENV === 'production') {
    return {
      jwtSecret: secretoDeProduccion('JWT_SECRET', entorno.JWT_SECRET, JWT_SECRET_DESARROLLO),
      refreshSecret: secretoDeProduccion(
        'JWT_REFRESH_SECRET',
        entorno.JWT_REFRESH_SECRET,
        JWT_REFRESH_SECRET_DESARROLLO
      ),
    };
  }

  return {
    jwtSecret: entorno.JWT_SECRET || JWT_SECRET_DESARROLLO,
    refreshSecret: entorno.JWT_REFRESH_SECRET || JWT_REFRESH_SECRET_DESARROLLO,
  };
}
