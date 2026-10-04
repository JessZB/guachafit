/**
 * deploy-05a: validación centralizada de la configuración crítica de producción del API.
 *
 * - Producción (`NODE_ENV=production`): se recolectan TODOS los problemas y se lanza UN único
 *   Error con una línea por problema, para que el operador corrija todo en una sola pasada. El
 *   API se niega a arrancar con configuración ausente, mal formada o de ejemplo.
 * - Desarrollo/test: nunca lanza; devuelve la lista de advertencias para que `main.ts` las
 *   registre en el log.
 *
 * Los alias de las variables de la bóveda salen de `r2-storage.service.ts` para no duplicar
 * nombres, y los valores de ejemplo son los que documenta `.env.example`.
 */
import {
  ENV_ACCESS_KEY_ID,
  ENV_BUCKET,
  ENV_ENDPOINT,
  ENV_SECRET_ACCESS_KEY,
} from '../../modules/antropometria/r2-storage.service';

/** Valor por defecto SOLO para desarrollo/test (también es el valor de ejemplo prohibido en producción). */
export const ENCRYPTION_KEY_DESARROLLO =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Credenciales y bucket locales de MinIO que documenta `.env.example`; prohibidos en producción. */
export const STORAGE_ACCESS_KEY_EJEMPLO = 'minioadmin';
export const STORAGE_SECRET_KEY_EJEMPLO = 'minioadmin';
export const STORAGE_BUCKET_EJEMPLO = 'guachafit-r2-local';

/** Contraseña de ejemplo del panel Bull-Board; prohibida en producción. */
export const BULL_BOARD_PASS_EJEMPLO = 'cambia_esta_clave';

/** Longitud mínima de la contraseña de Bull-Board en producción. */
export const LONGITUD_MINIMA_BULL_BOARD_PASS = 12;

const REGEX_CLAVE_CIFRADO = /^[0-9a-fA-F]{64}$/;

type EntornoConfiguracion = Partial<Record<string, string | undefined>>;

/** `true` si el valor es una clave de 32 bytes en hexadecimal (64 caracteres). */
export function esClaveCifradoValida(valor: string | undefined): boolean {
  return REGEX_CLAVE_CIFRADO.test((valor ?? '').trim());
}

/** Primer valor no vacío del entorno entre los alias dados, ya recortado. */
function primerValor(entorno: EntornoConfiguracion, nombres: readonly string[]): string | undefined {
  for (const nombre of nombres) {
    const valor = (entorno[nombre] ?? '').trim();
    if (valor) return valor;
  }
  return undefined;
}

/** Todas las variantes aceptadas de una variable, para nombrarlas en el mensaje al operador. */
function etiquetas(nombres: readonly string[]): string {
  return nombres.join(' o ');
}

const PISTA_CLAVE_CIFRADO =
  'Genera una con "openssl rand -hex 32" (64 caracteres hexadecimales) y no la cambies cuando ya ' +
  'existan fichas cifradas: los registros cifrados quedarían ilegibles.';

function problemasClaveCifrado(entorno: EntornoConfiguracion): string[] {
  const clave = (entorno.ENCRYPTION_KEY ?? '').trim();
  if (!clave) {
    return [`ENCRYPTION_KEY: falta. En producción es obligatoria. ${PISTA_CLAVE_CIFRADO}`];
  }
  if (clave === ENCRYPTION_KEY_DESARROLLO) {
    return [
      `ENCRYPTION_KEY: conserva el valor de ejemplo de desarrollo. En producción debes reemplazarlo. ${PISTA_CLAVE_CIFRADO}`,
    ];
  }
  if (!esClaveCifradoValida(clave)) {
    return [
      `ENCRYPTION_KEY: debe tener exactamente 64 caracteres hexadecimales (0-9, a-f) y el valor ` +
        `configurado no cumple. ${PISTA_CLAVE_CIFRADO}`,
    ];
  }
  return [];
}

function problemasBoveda(entorno: EntornoConfiguracion): string[] {
  const problemas: string[] = [];

  const endpoint = primerValor(entorno, ENV_ENDPOINT);
  if (!endpoint) {
    problemas.push(
      `${etiquetas(ENV_ENDPOINT)}: falta el endpoint de la bóveda de archivos. En producción es ` +
        'obligatorio: configura el endpoint real de Cloudflare R2 (p. ej. https://<cuenta>.r2.cloudflarestorage.com).'
    );
  }

  const bucket = primerValor(entorno, ENV_BUCKET);
  if (!bucket) {
    problemas.push(
      `${etiquetas(ENV_BUCKET)}: falta el bucket de la bóveda de archivos. En producción es ` +
        'obligatorio: configura el bucket real de Cloudflare R2.'
    );
  } else if (bucket === STORAGE_BUCKET_EJEMPLO) {
    problemas.push(
      `${etiquetas(ENV_BUCKET)}: tiene el valor de ejemplo "${STORAGE_BUCKET_EJEMPLO}" (bucket local ` +
        'de MinIO). En producción configura el bucket real de Cloudflare R2.'
    );
  }

  const claveAcceso = primerValor(entorno, ENV_ACCESS_KEY_ID);
  if (!claveAcceso) {
    problemas.push(
      `${etiquetas(ENV_ACCESS_KEY_ID)}: falta la clave de acceso de la bóveda. En producción ` +
        'configura las credenciales reales de Cloudflare R2.'
    );
  } else if (claveAcceso === STORAGE_ACCESS_KEY_EJEMPLO) {
    problemas.push(
      `${etiquetas(ENV_ACCESS_KEY_ID)}: tiene el valor de ejemplo "${STORAGE_ACCESS_KEY_EJEMPLO}" ` +
        '(credencial local de MinIO). En producción configura credenciales reales de Cloudflare R2.'
    );
  }

  const claveSecreta = primerValor(entorno, ENV_SECRET_ACCESS_KEY);
  if (!claveSecreta) {
    problemas.push(
      `${etiquetas(ENV_SECRET_ACCESS_KEY)}: falta la clave secreta de la bóveda. En producción ` +
        'configura las credenciales reales de Cloudflare R2.'
    );
  } else if (claveSecreta === STORAGE_SECRET_KEY_EJEMPLO) {
    problemas.push(
      `${etiquetas(ENV_SECRET_ACCESS_KEY)}: tiene el valor de ejemplo "${STORAGE_SECRET_KEY_EJEMPLO}" ` +
        '(credencial local de MinIO). En producción configura credenciales reales de Cloudflare R2.'
    );
  }

  return problemas;
}

function problemasCors(entorno: EntornoConfiguracion): string[] {
  if (primerValor(entorno, ['CORS_ORIGINS'])) return [];
  return [
    'CORS_ORIGINS: falta. En producción es obligatoria: define los orígenes permitidos para el ' +
      'navegador, separados por coma (p. ej. https://app.tu-dominio.com).',
  ];
}

function problemasBullBoard(entorno: EntornoConfiguracion): string[] {
  const usuario = (entorno.BULL_BOARD_USER ?? '').trim();
  if (!usuario) return [];

  const password = (entorno.BULL_BOARD_PASS ?? '').trim();
  if (!password) {
    return [
      `BULL_BOARD_PASS: falta. Con BULL_BOARD_USER configurado, en producción la contraseña del ` +
        `panel Bull-Board es obligatoria y debe tener al menos ${LONGITUD_MINIMA_BULL_BOARD_PASS} caracteres.`,
    ];
  }
  if (password === BULL_BOARD_PASS_EJEMPLO) {
    return [
      `BULL_BOARD_PASS: conserva el valor de ejemplo "${BULL_BOARD_PASS_EJEMPLO}". En producción usa ` +
        `una contraseña propia de al menos ${LONGITUD_MINIMA_BULL_BOARD_PASS} caracteres.`,
    ];
  }
  if (password.length < LONGITUD_MINIMA_BULL_BOARD_PASS) {
    return [
      `BULL_BOARD_PASS: tiene ${password.length} caracteres; en producción debe tener al menos ` +
        `${LONGITUD_MINIMA_BULL_BOARD_PASS}.`,
    ];
  }
  return [];
}

/**
 * Valida la configuración crítica del API. En producción lanza UN único Error con todos los
 * problemas (uno por línea) y sin lanzar devuelve la lista de advertencias (vacía si todo está
 * bien). En desarrollo/test nunca lanza: la lista sirve para registrarlas en el log.
 */
export function validarConfiguracionProduccion(
  entorno: EntornoConfiguracion = process.env
): string[] {
  const problemas = [
    ...problemasClaveCifrado(entorno),
    ...problemasBoveda(entorno),
    ...problemasCors(entorno),
    ...problemasBullBoard(entorno),
  ];

  if (entorno.NODE_ENV === 'production' && problemas.length > 0) {
    throw new Error(
      `[Configuración] El API no puede arrancar en producción: se encontraron ${problemas.length} ` +
        'problemas de configuración. Corrige cada uno y vuelve a intentarlo:\n' +
        problemas.map((problema) => `- ${problema}`).join('\n')
    );
  }

  return problemas;
}

/**
 * Orígenes permitidos para CORS. En producción SOLO `CORS_ORIGINS` (ya validado al arrancar);
 * fuera de producción se conserva el origen local por defecto.
 */
export function origenesCors(entorno: EntornoConfiguracion = process.env): string[] {
  const crudo = (entorno.CORS_ORIGINS ?? '').trim();
  if (crudo) {
    return crudo
      .split(',')
      .map((origen) => origen.trim())
      .filter((origen) => origen.length > 0);
  }
  return entorno.NODE_ENV === 'production' ? [] : ['http://localhost:3000'];
}

/**
 * `true` si debe montarse Swagger UI (`/api/docs`): fuera de producción siempre; en producción
 * solo cuando `SWAGGER_HABILITADO=true`.
 */
export function debeExponerSwagger(entorno: EntornoConfiguracion = process.env): boolean {
  if (entorno.NODE_ENV !== 'production') return true;
  return (entorno.SWAGGER_HABILITADO ?? '').trim() === 'true';
}
