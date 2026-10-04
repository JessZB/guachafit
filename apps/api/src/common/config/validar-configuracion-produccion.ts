/**
 * Validación centralizada de la configuración crítica del API al arrancar.
 *
 * - Producción (`NODE_ENV=production`): se recolectan TODOS los problemas (secretos JWT incluidos)
 *   y se lanza UN único Error con una línea por problema, para corregirlos en una sola pasada.
 * - Desarrollo/test: devuelve los problemas y las advertencias para registrar un único resumen,
 *   sin lanzar, salvo una clave de cifrado mal formada, que nunca debe quedar silenciada.
 *
 * La clave de cifrado sigue estas reglas (idénticas a las de CryptoService, que reutiliza
 * `analizarClaveCifrado` y los mismos mensajes):
 * - Ausente: en producción es un error; en desarrollo/test se usa la clave de desarrollo.
 * - 64 caracteres hexadecimales: se usa tal cual.
 * - Más larga con primeros 64 hexadecimales: se usan los primeros 64 (compatibilidad) y se avisa.
 * - Cualquier otro caso: error en todos los entornos; jamás se cae a la clave de desarrollo.
 * - En producción además se rechazan la clave de ejemplo (sin distinguir mayúsculas) y las claves
 *   formadas por un único carácter repetido.
 */
import { obtenerSecretosJwt } from './secretos-jwt';
import {
  ENV_ACCESS_KEY_ID,
  ENV_BUCKET,
  ENV_ENDPOINT,
  ENV_SECRET_ACCESS_KEY,
} from './variables-almacenamiento';

/** Valor por defecto solo para desarrollo/test (también es el valor de ejemplo prohibido en producción). */
export const ENCRYPTION_KEY_DESARROLLO =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Credenciales y bucket locales de MinIO que documenta `.env.example`. */
export const STORAGE_ACCESS_KEY_EJEMPLO = 'minioadmin';
export const STORAGE_SECRET_KEY_EJEMPLO = 'minioadmin';
export const STORAGE_BUCKET_EJEMPLO = 'guachafit-r2-local';

/** Contraseña de ejemplo del panel Bull-Board. */
export const BULL_BOARD_PASS_EJEMPLO = 'cambia_esta_clave';

/** Longitud mínima de la contraseña de Bull-Board en producción. */
export const LONGITUD_MINIMA_BULL_BOARD_PASS = 12;

const REGEX_CLAVE_HEX = /^[0-9a-fA-F]{64}$/;

/** Nombres de las variables, interpolados en los mensajes para no incrustar identificadores. */
const NOMBRE_CORS_ORIGINS = 'CORS_ORIGINS';
const NOMBRE_BULL_BOARD_USER = 'BULL_BOARD_USER';
const NOMBRE_BULL_BOARD_PASS = 'BULL_BOARD_PASS';

type EntornoConfiguracion = Partial<Record<string, string | undefined>>;

/** Problema de configuración: la variable afectada y el texto que ve el operador. */
export interface ProblemaConfiguracion {
  variable: string;
  mensaje: string;
}

export interface ResultadoValidacionConfiguracion {
  problemas: ProblemaConfiguracion[];
  advertencias: string[];
}

/**
 * Clasificación de ENCRYPTION_KEY. `problemaProduccion` no es fatal por sí mismo: el llamador
 * decide (en producción es un error; fuera de producción solo alimenta el resumen local).
 */
export interface AnalisisClaveCifrado {
  claveEfectiva?: string;
  problemaFatal?: string;
  problemaProduccion?: string;
  advertencia?: string;
}

export type MotivoClaveCifrado = 'ausente' | 'malformada' | 'ejemplo' | 'debil';

const GUIA_CLAVE_CIFRADO =
  'En un primer despliegue, cuando todavía no hay fichas de salud cifradas, genera una clave ' +
  'nueva con "openssl rand -hex 32". Si ya existen fichas cifradas, configura la MISMA clave ' +
  'con la que se cifraron (si la original tenía más de 64 caracteres hexadecimales, usa sus ' +
  'primeros 64): generar otra deja los registros existentes ilegibles.';

/** Único constructor de los mensajes de ENCRYPTION_KEY; lo comparten el arranque y CryptoService. */
export function mensajeClaveCifrado(motivo: MotivoClaveCifrado): string {
  const detalle: Record<MotivoClaveCifrado, string> = {
    ausente: 'falta la clave de cifrado',
    malformada:
      'el valor configurado no es válido: debe ser hexadecimal y tener al menos 64 caracteres ' +
      '(se usan los primeros 64)',
    ejemplo: 'usa la clave de ejemplo, que está publicada en el repositorio',
    debil: 'está formada por un único carácter repetido y no es segura para producción',
  };
  return `ENCRYPTION_KEY: ${detalle[motivo]}. ${GUIA_CLAVE_CIFRADO}`;
}

function mensajeClaveLarga(): string {
  return (
    'ENCRYPTION_KEY: tiene más de 64 caracteres; se usarán sus primeros 64, que sí son ' +
    'hexadecimales. Acórtala a esos 64 caracteres para evitar ambigüedad.'
  );
}

function esCaracterRepetido(clave: string): boolean {
  return /^([0-9a-fA-F])\1{63}$/.test(clave);
}

/** Clasifica la clave de cifrado con las reglas compartidas por el arranque y CryptoService. */
export function analizarClaveCifrado(valor: string | undefined): AnalisisClaveCifrado {
  const clave = (valor ?? '').trim();
  if (!clave) {
    return { problemaProduccion: mensajeClaveCifrado('ausente') };
  }

  const efectiva = clave.slice(0, 64);
  if (!REGEX_CLAVE_HEX.test(efectiva)) {
    return { problemaFatal: mensajeClaveCifrado('malformada') };
  }

  const advertencia = clave.length > 64 ? mensajeClaveLarga() : undefined;
  if (efectiva.toLowerCase() === ENCRYPTION_KEY_DESARROLLO.toLowerCase()) {
    return { claveEfectiva: efectiva, advertencia, problemaProduccion: mensajeClaveCifrado('ejemplo') };
  }
  if (esCaracterRepetido(efectiva)) {
    return { claveEfectiva: efectiva, advertencia, problemaProduccion: mensajeClaveCifrado('debil') };
  }
  return { claveEfectiva: efectiva, advertencia };
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

/**
 * Recolecta los problemas de los secretos JWT reutilizando `obtenerSecretosJwt` (única fuente de
 * sus reglas). Cada secreto se sondea por separado, con el otro en un valor de relleno, para
 * reportarlos todos a la vez sin duplicar la lógica ni cambiar el comportamiento existente.
 */
function problemasSecretosJwt(entorno: EntornoConfiguracion): ProblemaConfiguracion[] {
  if (entorno.NODE_ENV !== 'production') return [];

  const problemas: ProblemaConfiguracion[] = [];
  const relleno = 'secreto-de-relleno-solo-para-diagnostico';
  for (const variable of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const otro = variable === 'JWT_SECRET' ? 'JWT_REFRESH_SECRET' : 'JWT_SECRET';
    try {
      obtenerSecretosJwt({ ...entorno, [otro]: relleno });
    } catch (error) {
      problemas.push({
        variable,
        mensaje: String((error as Error).message).replace(/^\[Configuración\]\s*/, ''),
      });
    }
  }
  return problemas;
}

function problemasBoveda(entorno: EntornoConfiguracion): ProblemaConfiguracion[] {
  const problemas: ProblemaConfiguracion[] = [];

  const endpoint = primerValor(entorno, ENV_ENDPOINT);
  if (!endpoint) {
    problemas.push({
      variable: ENV_ENDPOINT[0],
      mensaje:
        `${etiquetas(ENV_ENDPOINT)}: falta el endpoint de la bóveda de archivos. En producción es ` +
        'obligatorio: configura el endpoint real de Cloudflare R2 (p. ej. https://<cuenta>.r2.cloudflarestorage.com).',
    });
  }

  const bucket = primerValor(entorno, ENV_BUCKET);
  if (!bucket) {
    problemas.push({
      variable: ENV_BUCKET[0],
      mensaje:
        `${etiquetas(ENV_BUCKET)}: falta el bucket de la bóveda de archivos. En producción es ` +
        'obligatorio: configura el bucket real de Cloudflare R2.',
    });
  } else if (bucket === STORAGE_BUCKET_EJEMPLO) {
    problemas.push({
      variable: ENV_BUCKET[0],
      mensaje:
        `${etiquetas(ENV_BUCKET)}: tiene el valor de ejemplo "${STORAGE_BUCKET_EJEMPLO}" (bucket ` +
        'local de MinIO). En producción configura el bucket real de Cloudflare R2.',
    });
  }

  const claveAcceso = primerValor(entorno, ENV_ACCESS_KEY_ID);
  if (!claveAcceso) {
    problemas.push({
      variable: ENV_ACCESS_KEY_ID[0],
      mensaje:
        `${etiquetas(ENV_ACCESS_KEY_ID)}: falta la clave de acceso de la bóveda. En producción ` +
        'configura las credenciales reales de Cloudflare R2.',
    });
  } else if (claveAcceso === STORAGE_ACCESS_KEY_EJEMPLO) {
    problemas.push({
      variable: ENV_ACCESS_KEY_ID[0],
      mensaje:
        `${etiquetas(ENV_ACCESS_KEY_ID)}: tiene el valor de ejemplo "${STORAGE_ACCESS_KEY_EJEMPLO}" ` +
        '(credencial local de MinIO). En producción configura credenciales reales de Cloudflare R2.',
    });
  }

  const claveSecreta = primerValor(entorno, ENV_SECRET_ACCESS_KEY);
  if (!claveSecreta) {
    problemas.push({
      variable: ENV_SECRET_ACCESS_KEY[0],
      mensaje:
        `${etiquetas(ENV_SECRET_ACCESS_KEY)}: falta la clave secreta de la bóveda. En producción ` +
        'configura las credenciales reales de Cloudflare R2.',
    });
  } else if (claveSecreta === STORAGE_SECRET_KEY_EJEMPLO) {
    problemas.push({
      variable: ENV_SECRET_ACCESS_KEY[0],
      mensaje:
        `${etiquetas(ENV_SECRET_ACCESS_KEY)}: tiene el valor de ejemplo "${STORAGE_SECRET_KEY_EJEMPLO}" ` +
        '(credencial local de MinIO). En producción configura credenciales reales de Cloudflare R2.',
    });
  }

  return problemas;
}

function problemasCors(
  entorno: EntornoConfiguracion,
  esProduccion: boolean
): ProblemaConfiguracion[] {
  const crudo = (entorno[NOMBRE_CORS_ORIGINS] ?? '').trim();
  if (!crudo) {
    return esProduccion
      ? [
          {
            variable: NOMBRE_CORS_ORIGINS,
            mensaje:
              `${NOMBRE_CORS_ORIGINS}: falta. En producción es obligatoria: define los orígenes permitidos ` +
              'para el navegador, separados por coma (p. ej. https://app.tu-dominio.com).',
          },
        ]
      : [];
  }

  const problemas: ProblemaConfiguracion[] = [];
  const origenes = origenesCors(entorno);
  if (origenes.length === 0) {
    problemas.push({
      variable: NOMBRE_CORS_ORIGINS,
      mensaje:
        `${NOMBRE_CORS_ORIGINS}: no contiene ningún origen válido. Separa los orígenes con comas ` +
        '(p. ej. https://app.tu-dominio.com).',
    });
  }
  if (origenes.includes('*')) {
    problemas.push({
      variable: NOMBRE_CORS_ORIGINS,
      mensaje:
        `${NOMBRE_CORS_ORIGINS}: no admite "*" porque el API envía credenciales y el navegador ` +
        'rechaza ese comodín. Enumera cada origen permitido.',
    });
  }
  for (const origen of origenes) {
    if (origen !== '*' && !/^https?:\/\//i.test(origen)) {
      problemas.push({
        variable: NOMBRE_CORS_ORIGINS,
        mensaje: `${NOMBRE_CORS_ORIGINS}: "${origen}" no es una URL válida; cada origen debe empezar por http:// o https://.`,
      });
    }
  }
  return problemas;
}

function problemasBullBoard(entorno: EntornoConfiguracion): ProblemaConfiguracion[] {
  const usuario = (entorno[NOMBRE_BULL_BOARD_USER] ?? '').trim();
  if (!usuario) return [];

  const password = (entorno[NOMBRE_BULL_BOARD_PASS] ?? '').trim();
  if (!password) {
    return [
      {
        variable: NOMBRE_BULL_BOARD_PASS,
        mensaje:
          `${NOMBRE_BULL_BOARD_PASS}: falta. Con ${NOMBRE_BULL_BOARD_USER} configurado, en ` +
          'producción la contraseña del panel Bull-Board es obligatoria y debe tener al menos ' +
          `${LONGITUD_MINIMA_BULL_BOARD_PASS} caracteres.`,
      },
    ];
  }
  if (password === BULL_BOARD_PASS_EJEMPLO) {
    return [
      {
        variable: NOMBRE_BULL_BOARD_PASS,
        mensaje:
          `${NOMBRE_BULL_BOARD_PASS}: conserva el valor de ejemplo "${BULL_BOARD_PASS_EJEMPLO}". ` +
          'En producción usa una contraseña propia de al menos ' +
          `${LONGITUD_MINIMA_BULL_BOARD_PASS} caracteres.`,
      },
    ];
  }
  if (password.length < LONGITUD_MINIMA_BULL_BOARD_PASS) {
    return [
      {
        variable: NOMBRE_BULL_BOARD_PASS,
        mensaje:
          `${NOMBRE_BULL_BOARD_PASS}: tiene ${password.length} caracteres; en producción debe ` +
          `tener al menos ${LONGITUD_MINIMA_BULL_BOARD_PASS}.`,
      },
    ];
  }
  return [];
}

function armarErrorConfiguracion(problemas: readonly ProblemaConfiguracion[]): string {
  return (
    `[Configuración] El API no puede arrancar: se encontraron ${problemas.length} problemas de ` +
    'configuración. Corrige cada uno y vuelve a intentarlo:\n' +
    problemas.map((problema) => `- ${problema.mensaje}`).join('\n')
  );
}

/**
 * Valida la configuración crítica. En producción lanza un único Error con todos los problemas
 * (secretos JWT incluidos) y una línea por problema; fuera de producción devuelve el resultado
 * para registrar un único resumen, salvo una clave de cifrado mal formada, que lanza siempre.
 */
export function validarConfiguracionProduccion(
  entorno: EntornoConfiguracion = process.env
): ResultadoValidacionConfiguracion {
  const esProduccion = entorno.NODE_ENV === 'production';

  const analisisClave = analizarClaveCifrado(entorno.ENCRYPTION_KEY);
  const problemas: ProblemaConfiguracion[] = [];
  const advertencias: string[] = [];

  if (analisisClave.problemaFatal) {
    problemas.push({ variable: 'ENCRYPTION_KEY', mensaje: analisisClave.problemaFatal });
  }
  if (analisisClave.problemaProduccion) {
    problemas.push({ variable: 'ENCRYPTION_KEY', mensaje: analisisClave.problemaProduccion });
  }
  if (analisisClave.advertencia) {
    advertencias.push(analisisClave.advertencia);
  }

  problemas.push(
    ...problemasSecretosJwt(entorno),
    ...problemasBoveda(entorno),
    ...problemasCors(entorno, esProduccion),
    ...problemasBullBoard(entorno)
  );

  if (esProduccion && problemas.length > 0) {
    throw new Error(armarErrorConfiguracion(problemas));
  }
  if (!esProduccion && analisisClave.problemaFatal) {
    throw new Error(`[Configuración] ${analisisClave.problemaFatal}`);
  }

  return { problemas, advertencias };
}

/**
 * Única línea que resume, fuera de producción, los problemas detectados: evita un aviso por
 * variable cuando `.env.example` usa valores de ejemplo a propósito.
 */
export function resumenProblemasConfiguracion(
  problemas: readonly ProblemaConfiguracion[]
): string {
  const variables = [...new Set(problemas.map((problema) => problema.variable))];
  return (
    `La configuración local usa ${problemas.length} valores de ejemplo o incompletos; en ` +
    `producción el API no arrancaría con ellos: ${variables.join(', ')}.`
  );
}

/**
 * Orígenes permitidos para CORS. En producción solo `CORS_ORIGINS` (validado al arrancar); fuera
 * de producción se conserva el origen local por defecto.
 */
export function origenesCors(entorno: EntornoConfiguracion = process.env): string[] {
  const crudo = (entorno[NOMBRE_CORS_ORIGINS] ?? '').trim();
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
