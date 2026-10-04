/**
 * Arranque del API con migraciones pendientes.
 *
 * Si el API nuevo arranca antes de aplicar la última migración (paso manual `pnpm db:migrate`),
 * las consultas a columnas nuevas fallan y pantallas como el entrenamiento del alumno se rompen.
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
  mensajeMigracionesPendientes,
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
  'Faltan migraciones de base de datos por aplicar (última esperada: 0014_ejercicios_sesion_indicaciones). Ejecuta pnpm db:migrate antes de iniciar el API.';

function loggerFalso() {
  return { warn: vi.fn(), log: vi.fn() };
}

describe('Arranque · comparación de la última migración (función pura)', () => {
  it('toma como última esperada la de `when` más reciente del journal', () => {
    expect(ultimaMigracionDelJournal(JOURNAL)).toEqual(ULTIMA);
    expect(ultimaMigracionDelJournal({ entries: [] })).toBeNull();
  });

  it('el journal real del repositorio termina en la migración 0014', () => {
    const ruta = path.resolve(__dirname, '../../../../packages/database/drizzle/meta/_journal.json');
    const journal = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    expect(ultimaMigracionDelJournal(journal)?.tag).toMatch(/^0014_/);
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

  it('si no se puede comprobar (sin permiso, sin conexión o sin journal) avisa sin bloquear', async () => {
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

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[0][0]).toMatch(/No se pudo comprobar/);
    expect(logger.warn.mock.calls[1][0]).toMatch(/No se pudo comprobar/);
  });
});
