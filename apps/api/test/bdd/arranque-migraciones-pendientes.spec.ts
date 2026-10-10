/**
 * Arranque del API con migraciones pendientes.
 *
 * Si el API nuevo arranca antes de aplicar la última migración (paso manual; la instrucción al
 * operador vive en `INSTRUCCION_APLICAR_MIGRACIONES`), las consultas a columnas nuevas fallan y
 * pantallas como el entrenamiento del alumno se rompen.
 * Al arrancar se compara la última migración del journal de drizzle con la última aplicada en
 * `drizzle.__drizzle_migrations` (drizzle aplica una migración si `created_at` de la última
 * aplicada es menor que su `when` del journal):
 * - producción: no arranca y explica al operador qué ejecutar;
 * - desarrollo: avisa en el log sin bloquear;
 * - test: no se comprueba.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  decidirAccionMigraciones,
  faltanMigraciones,
  INSTRUCCION_APLICAR_MIGRACIONES,
  mensajeMigracionesPendientes,
  mensajeRolSinPermisoMigraciones,
  ultimaMigracionDelJournal,
  verificarMigracionesAlArrancar,
} from '../../src/common/config/verificar-migraciones';

const JOURNAL = {
  entries: [
    { idx: 12, when: 1790201141871, tag: '0012_rls_finanzas' },
    { idx: 14, when: 1790990234338, tag: '0014_ejercicios_sesion_indicaciones' },
    { idx: 13, when: 1790208366631, tag: '0013_rls_perfiles_alumno' },
  ],
};
const ULTIMA = { tag: '0014_ejercicios_sesion_indicaciones', when: 1790990234338 };
const MENSAJE =
  'Faltan migraciones de base de datos por aplicar (última esperada: 0014_ejercicios_sesion_indicaciones). ' +
  `Aplica las migraciones antes de iniciar el API: ${INSTRUCCION_APLICAR_MIGRACIONES}`;

function loggerFalso() {
  return { warn: vi.fn(), log: vi.fn() };
}

describe('Arranque · comparación de la última migración (función pura)', () => {
  it('toma como última esperada la de `when` más reciente del journal', () => {
    expect(ultimaMigracionDelJournal(JOURNAL)).toEqual(ULTIMA);
    expect(ultimaMigracionDelJournal({ entries: [] })).toBeNull();
  });

  // M5-L1: la 0018 (suscripción del alumno y referencias por entrenador) es la última: el arranque debe exigirla.
  it('el journal real del repositorio termina en la migración 0018', () => {
    const ruta = path.resolve(__dirname, '../../../../packages/database/drizzle/meta/_journal.json');
    const journal = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    expect(ultimaMigracionDelJournal(journal)?.tag).toMatch(/^0018_/);
  });

  it('faltan migraciones si no hay ninguna aplicada o la última aplicada es anterior', () => {
    expect(faltanMigraciones(ULTIMA, null)).toBe(true);
    expect(faltanMigraciones(ULTIMA, 1790208366631)).toBe(true);
    // postgres devuelve `bigint` como texto.
    expect(faltanMigraciones(ULTIMA, '1790208366631')).toBe(true);
  });

  it('está al día si la última aplicada es la esperada o una posterior', () => {
    expect(faltanMigraciones(ULTIMA, 1790990234338)).toBe(false);
    expect(faltanMigraciones(ULTIMA, '1790990234338')).toBe(false);
    expect(faltanMigraciones(ULTIMA, 1790990234339)).toBe(false);
  });

  it('el mensaje dice al operador cuál falta y qué ejecutar', () => {
    expect(mensajeMigracionesPendientes(ULTIMA.tag)).toBe(MENSAJE);
  });

  it('la instrucción de migración nombra las rutas de producción y deja `pnpm db:migrate` para desarrollo local', () => {
    expect(INSTRUCCION_APLICAR_MIGRACIONES).toContain('pnpm db:migrate:prod');
    expect(INSTRUCCION_APLICAR_MIGRACIONES).toContain(
      'node /app/node_modules/@guachafit/database/dist/migrate.js'
    );
    expect(INSTRUCCION_APLICAR_MIGRACIONES).toContain('DATABASE_URL_MIGRACIONES');
    // `pnpm db:migrate` aparece exactamente una vez y como comando local (no como prefijo de `:prod`).
    expect(INSTRUCCION_APLICAR_MIGRACIONES.match(/pnpm db:migrate(?!:)/g)).toEqual(['pnpm db:migrate']);
    expect(INSTRUCCION_APLICAR_MIGRACIONES).toMatch(/desarrollo local, pnpm db:migrate\.$/);
    // El mensaje al operador reutiliza la misma instrucción (sin copiarla).
    expect(mensajeMigracionesPendientes(ULTIMA.tag)).toContain(INSTRUCCION_APLICAR_MIGRACIONES);
  });

  it('decide según el entorno: producción detiene, desarrollo avisa, test omite', () => {
    expect(decidirAccionMigraciones('production', true)).toBe('detener');
    expect(decidirAccionMigraciones('development', true)).toBe('avisar');
    expect(decidirAccionMigraciones(undefined, true)).toBe('avisar');
    expect(decidirAccionMigraciones('test', true)).toBe('omitir');
    expect(decidirAccionMigraciones('production', false)).toBe('continuar');
    expect(decidirAccionMigraciones('development', false)).toBe('continuar');
  });
});

describe('Arranque · verificarMigracionesAlArrancar', () => {
  it('producción con la última migración sin aplicar → no arranca, con mensaje claro', async () => {
    const logger = loggerFalso();
    await expect(
      verificarMigracionesAlArrancar({
        nodeEnv: 'production',
        leerJournal: () => JOURNAL,
        consultarUltimaAplicada: async () => 1790208366631,
        logger,
      })
    ).rejects.toThrow(MENSAJE);
  });

  it('producción sin tabla de control (nunca se migró) → no arranca', async () => {
    const sinTabla = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    await expect(
      verificarMigracionesAlArrancar({
        nodeEnv: 'production',
        leerJournal: () => JOURNAL,
        consultarUltimaAplicada: async () => {
          throw sinTabla;
        },
        logger: loggerFalso(),
      })
    ).rejects.toThrow(MENSAJE);
  });

  it('producción al día → arranca sin avisos', async () => {
    const logger = loggerFalso();
    await expect(
      verificarMigracionesAlArrancar({
        nodeEnv: 'production',
        leerJournal: () => JOURNAL,
        consultarUltimaAplicada: async () => '1790990234338',
        logger,
      })
    ).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('desarrollo con migraciones pendientes → solo avisa en el log', async () => {
    const logger = loggerFalso();
    await expect(
      verificarMigracionesAlArrancar({
        nodeEnv: 'development',
        leerJournal: () => JOURNAL,
        consultarUltimaAplicada: async () => null,
        logger,
      })
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(MENSAJE);
  });

  it('test → no lee el journal ni consulta la base de datos', async () => {
    const leerJournal = vi.fn(() => JOURNAL);
    const consultarUltimaAplicada = vi.fn(async () => null);
    await verificarMigracionesAlArrancar({
      nodeEnv: 'test',
      leerJournal,
      consultarUltimaAplicada,
      logger: loggerFalso(),
    });
    expect(leerJournal).not.toHaveBeenCalled();
    expect(consultarUltimaAplicada).not.toHaveBeenCalled();
  });

  it('sin permiso de lectura (42501) → avisa que falta provisionar el rol, sin bloquear', async () => {
    const sinPermiso = Object.assign(new Error('permission denied for schema drizzle'), {
      code: '42501',
    });
    const logger = loggerFalso();

    await expect(
      verificarMigracionesAlArrancar({
        nodeEnv: 'production',
        leerJournal: () => JOURNAL,
        consultarUltimaAplicada: async () => {
          throw sinPermiso;
        },
        logger,
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      mensajeRolSinPermisoMigraciones('permission denied for schema drizzle')
    );
    const aviso = logger.warn.mock.calls[0][0];
    expect(aviso).toContain('no puede leer drizzle.__drizzle_migrations');
    expect(aviso).toContain('packages/database/scripts/crear-rol-app.sql');
  });

  it('si no se puede comprobar (sin conexión o sin journal) avisa sin bloquear', async () => {
    const logger = loggerFalso();

    await expect(
      verificarMigracionesAlArrancar({
        nodeEnv: 'production',
        leerJournal: () => {
          throw new Error('ENOENT');
        },
        consultarUltimaAplicada: async () => null,
        logger,
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const aviso = logger.warn.mock.calls[0][0];
    expect(aviso).toMatch(/No se pudo comprobar/);
    expect(aviso).toContain(INSTRUCCION_APLICAR_MIGRACIONES);
  });
});
