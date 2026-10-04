/**
 * Comprobación al arrancar: ¿la base de datos tiene aplicada la última migración?
 *
 * Aplicar migraciones es un paso manual (`pnpm db:migrate`, `packages/database/src/migrate.ts`).
 * Si el API nuevo arranca antes, las consultas a columnas nuevas fallan ("column does not
 * exist") y pantallas como el entrenamiento del alumno se rompen. Por eso, al arrancar:
 * - producción: si falta la última migración, el API no arranca y explica qué ejecutar;
 * - desarrollo: solo avisa en el log;
 * - test: no se comprueba.
 *
 * Se compara igual que drizzle (`pg-core/dialect.js` → `migrate`): una migración del journal
 * está pendiente si el `created_at` de la última fila de `drizzle.__drizzle_migrations` es menor
 * que su `when`. Si la comprobación no se puede hacer (sin permiso sobre el esquema `drizzle`,
 * sin conexión o sin journal) se avisa sin bloquear: no es lo mismo que saber que falta.
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
  return `Faltan migraciones de base de datos por aplicar (última esperada: ${tag}). Ejecuta pnpm db:migrate antes de iniciar el API.`;
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
    logger.warn(
      `No se pudo comprobar si la base de datos tiene todas las migraciones aplicadas (${detalle}). ` +
        'Si actualizaste el API, ejecuta pnpm db:migrate.'
    );
    return;
  }

  const accion = decidirAccionMigraciones(nodeEnv, faltanMigraciones(ultimaEsperada, ultimaAplicada));
  const mensaje = mensajeMigracionesPendientes(ultimaEsperada.tag);
  if (accion === 'detener') throw new Error(mensaje);
  if (accion === 'avisar') logger.warn(mensaje);
}
