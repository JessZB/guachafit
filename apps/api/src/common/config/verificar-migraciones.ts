/**
 * Comprobación al arrancar: ¿la base de datos tiene aplicada la última migración?
 *
 * Aplicar migraciones es un paso manual (`packages/database/src/migrate.ts`); los mensajes al
 * operador reutilizan la instrucción única de `INSTRUCCION_APLICAR_MIGRACIONES` (producción y
 * desarrollo local).
 * Si el API nuevo arranca antes, las consultas a columnas nuevas fallan ("column does not
 * exist") y pantallas como el entrenamiento del alumno se rompen. Por eso, al arrancar:
 * - producción: si falta la última migración, el API no arranca y explica qué ejecutar;
 * - desarrollo: solo avisa en el log;
 * - test: no se comprueba.
 *
 * Se compara igual que drizzle (`pg-core/dialect.js` → `migrate`): una migración del journal
 * está pendiente si el `created_at` de la última fila de `drizzle.__drizzle_migrations` es menor
 * que su `when`. Si la comprobación no se puede hacer (rol del API sin permiso para leer
 * `drizzle.__drizzle_migrations`, sin conexión o sin journal) se avisa sin bloquear: no es lo
 * mismo que saber que falta, y el caso sin permiso explica cómo provisionar el rol.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface MigracionDelJournal {
  tag: string;
  when: number;
}

export interface JournalDrizzle {
  entries: MigracionDelJournal[];
}

export type AccionMigraciones = 'omitir' | 'continuar' | 'avisar' | 'detener';

/** Tabla de control que crea el migrador de drizzle (esquema y nombre por defecto). */
export const CONSULTA_ULTIMA_MIGRACION_APLICADA =
  'select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1';

/** Códigos de PostgreSQL: tabla (42P01) o esquema (3F000) inexistentes = nunca se migró. */
const CODIGOS_SIN_TABLA_DE_CONTROL = new Set(['42P01', '3F000']);

/** Código de PostgreSQL: permiso insuficiente (42501). */
const CODIGO_PERMISO_INSUFICIENTE = '42501';

/**
 * Instrucción única para aplicar migraciones, compartida por los mensajes al operador:
 * producción (pipeline o imagen del API, con el rol propietario) y desarrollo local.
 */
export const INSTRUCCION_APLICAR_MIGRACIONES =
  'en producción, pnpm db:migrate:prod o, dentro de la imagen del API, ' +
  'node /app/node_modules/@guachafit/database/dist/migrate.js con DATABASE_URL_MIGRACIONES ' +
  '(rol propietario de las tablas); en desarrollo local, pnpm db:migrate.';

/**
 * Aviso cuando el rol de base de datos del API no puede leer la tabla de control de migraciones:
 * el aislamiento exige un rol restringido, pero ese rol debe aprovisionarse (tras migrar) para que
 * la comprobación de arranque funcione.
 */
export function mensajeRolSinPermisoMigraciones(detalle: string): string {
  return (
    `No se pudo comprobar si la base de datos tiene todas las migraciones aplicadas (${detalle}). ` +
    'El rol de base de datos del API no puede leer drizzle.__drizzle_migrations: después de aplicar ' +
    'las migraciones, provisiona el rol de aplicación con packages/database/scripts/crear-rol-app.sql. ' +
    'El API continúa sin esta comprobación.'
  );
}

export function ultimaMigracionDelJournal(journal: JournalDrizzle): MigracionDelJournal | null {
  let ultima: MigracionDelJournal | null = null;
  for (const entrada of journal.entries ?? []) {
    if (!ultima || entrada.when > ultima.when) ultima = { tag: entrada.tag, when: entrada.when };
  }
  return ultima;
}

/** `created_at` llega como texto (bigint de postgres) o número; `null` si no hay ninguna. */
export function faltanMigraciones(
  ultimaEsperada: MigracionDelJournal,
  ultimoCreatedAtAplicado: number | string | null
): boolean {
  if (ultimoCreatedAtAplicado === null || ultimoCreatedAtAplicado === undefined) return true;
  return Number(ultimoCreatedAtAplicado) < ultimaEsperada.when;
}

export function mensajeMigracionesPendientes(tag: string): string {
  return (
    `Faltan migraciones de base de datos por aplicar (última esperada: ${tag}). ` +
    `Aplica las migraciones antes de iniciar el API: ${INSTRUCCION_APLICAR_MIGRACIONES}`
  );
}

export function decidirAccionMigraciones(
  nodeEnv: string | undefined,
  faltan: boolean
): AccionMigraciones {
  if (nodeEnv === 'test') return 'omitir';
  if (!faltan) return 'continuar';
  return nodeEnv === 'production' ? 'detener' : 'avisar';
}

/** Journal de `packages/database/drizzle/meta`, junto al paquete `@guachafit/database`. */
export function leerJournalDeDrizzle(): JournalDrizzle {
  const entradaPaquete = require.resolve('@guachafit/database');
  const ruta = path.resolve(path.dirname(entradaPaquete), '..', 'drizzle', 'meta', '_journal.json');
  return JSON.parse(fs.readFileSync(ruta, 'utf8')) as JournalDrizzle;
}

export interface OpcionesVerificacionMigraciones {
  nodeEnv: string | undefined;
  leerJournal: () => JournalDrizzle;
  /** `created_at` de la última migración aplicada, o `null` si no hay ninguna. */
  consultarUltimaAplicada: () => Promise<number | string | null>;
  logger: { warn: (mensaje: string) => void; log: (mensaje: string) => void };
}

export async function verificarMigracionesAlArrancar({
  nodeEnv,
  leerJournal,
  consultarUltimaAplicada,
  logger,
}: OpcionesVerificacionMigraciones): Promise<void> {
  if (decidirAccionMigraciones(nodeEnv, false) === 'omitir') return;

  let ultimaEsperada: MigracionDelJournal | null;
  let ultimaAplicada: number | string | null;
  try {
    ultimaEsperada = ultimaMigracionDelJournal(leerJournal());
    if (!ultimaEsperada) return;
    ultimaAplicada = await consultarUltimaAplicada().catch((error: unknown) => {
      if (CODIGOS_SIN_TABLA_DE_CONTROL.has((error as { code?: string })?.code ?? '')) return null;
      throw error;
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    const codigo = (error as { code?: string })?.code;
    if (codigo === CODIGO_PERMISO_INSUFICIENTE) {
      logger.warn(mensajeRolSinPermisoMigraciones(detalle));
      return;
    }
    logger.warn(
      `No se pudo comprobar si la base de datos tiene todas las migraciones aplicadas (${detalle}). ` +
        `Si actualizaste el API, aplica las migraciones: ${INSTRUCCION_APLICAR_MIGRACIONES}`
    );
    return;
  }

  const accion = decidirAccionMigraciones(nodeEnv, faltanMigraciones(ultimaEsperada, ultimaAplicada));
  const mensaje = mensajeMigracionesPendientes(ultimaEsperada.tag);
  if (accion === 'detener') throw new Error(mensaje);
  if (accion === 'avisar') logger.warn(mensaje);
}
