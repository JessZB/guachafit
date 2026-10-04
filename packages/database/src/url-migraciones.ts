/**
 * Selección de la URL de conexión para las migraciones de drizzle (deploy-05b).
 *
 * Vive en un módulo aparte para poder probarla como función pura, sin base de datos:
 * `src/migrate.ts` la usa y `apps/api/test/bdd` la importa directamente.
 *
 * Reglas:
 * - `DATABASE_URL_MIGRACIONES` tiene prioridad: las migraciones deben ejecutarse con el
 *   rol propietario de las tablas, mientras que el API puede conectarse con un rol restringido.
 * - Respaldo: `DATABASE_URL`.
 * - En producción, sin ninguna de las dos, NO se usa el valor local por defecto: se devuelve
 *   un error para que el proceso termine con un mensaje claro (nunca se conecta a localhost).
 * - Fuera de producción se conserva el valor local por defecto de siempre.
 */

/** URL local de desarrollo: mismo valor que usa el resto del monorepo cuando no hay entorno. */
export const URL_MIGRACIONES_LOCAL = 'postgres://postgres:postgres@127.0.0.1:5432/guachafit';

/**
 * Marcador que sustituye a una cadena que no se puede interpretar como URL de conexión.
 * Se usa en el log para no imprimir jamás la entrada original.
 */
export const URL_CONEXION_OCULTA = '<URL no válida: oculta>';

/** Entorno mínimo que necesita la selección (estructura de `process.env`). */
export type EntornoMigraciones = Readonly<Record<string, string | undefined>>;

/** Variable de la que salió la URL elegida; se registra en el log para el operador. */
export type OrigenUrlMigraciones = 'DATABASE_URL_MIGRACIONES' | 'DATABASE_URL' | 'desarrollo';

export type ResultadoUrlMigraciones =
  | { ok: true; url: string; origen: OrigenUrlMigraciones }
  | { ok: false; mensaje: string };

/** Primer valor no vacío (recortado). `""` y los espacios cuentan como no definido. */
function primerValor(entorno: EntornoMigraciones, nombres: readonly string[]): string | undefined {
  for (const nombre of nombres) {
    const valor = (entorno[nombre] ?? '').trim();
    if (valor) return valor;
  }
  return undefined;
}

export function seleccionarUrlMigraciones(entorno: EntornoMigraciones): ResultadoUrlMigraciones {
  const deMigraciones = primerValor(entorno, ['DATABASE_URL_MIGRACIONES']);
  if (deMigraciones) {
    return { ok: true, url: deMigraciones, origen: 'DATABASE_URL_MIGRACIONES' };
  }

  const delApi = primerValor(entorno, ['DATABASE_URL']);
  if (delApi) {
    return { ok: true, url: delApi, origen: 'DATABASE_URL' };
  }

  if (entorno.NODE_ENV === 'production') {
    return {
      ok: false,
      mensaje:
        'las migraciones en producción necesitan DATABASE_URL_MIGRACIONES (rol propietario de ' +
        'las tablas) o, como respaldo, DATABASE_URL. No se usa la URL local por defecto.',
    };
  }

  return { ok: true, url: URL_MIGRACIONES_LOCAL, origen: 'desarrollo' };
}

/**
 * Enmascara la contraseña de una URL de conexión para poder registrarla sin filtrar el secreto.
 *
 * Se parsea con WHATWG `URL` (el mismo criterio que postgres.js: el userinfo termina en el
 * ÚLTIMO `@`), de modo que una contraseña con `@` o `:` se sustituye POR COMPLETO por `****`.
 * Si la cadena no se puede parsear —o no es una URL jerárquica con host, que es la forma que
 * usa postgres.js— se devuelve un marcador y NUNCA la entrada original.
 */
export function enmascararUrlConexion(url: string): string {
  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    return URL_CONEXION_OCULTA;
  }

  // Sin host no es una URL de conexión jerárquica: una cadena como `postgres:usuario:clave`
  // esconde la credencial en la ruta, así que se oculta entera.
  if (!analizada.host) return URL_CONEXION_OCULTA;

  if (analizada.password) {
    analizada.password = '****';
  }
  return analizada.toString();
}
