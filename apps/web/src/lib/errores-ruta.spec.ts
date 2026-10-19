import { describe, expect, it } from 'vitest';
import { describirErrorRuta, esErrorCargaModulo } from './errores-ruta';

/**
 * Prompt 54, ER1 — lógica pura (fase verde: imports estáticos).
 *
 * Contratos bajo prueba (verbatim):
 * - L1 `esErrorCargaModulo`: `true` with `new TypeError('Failed to fetch
 *   dynamically imported module: http://x/a.tsx')`, with `new TypeError(
 *   'Importing a module script failed.')`, with `new Error(
 *   'error loading dynamically imported module')`, with an object
 *   `{ name: 'ChunkLoadError', message: 'Loading chunk 3 failed' }`, and with
 *   the text in uppercase. `false` with `new Error(
 *   'Cannot read properties of undefined')`, with `null`, with `undefined`,
 *   with `'otro texto'` and with `{}`.
 * - L2 `describirErrorRuta`: the three types with their exact texts, by error
 *   and `enLinea`:
 *   - `version-nueva` (module-load error and `enLinea` true): title
 *     `Hay una versión nueva de GUACHAFIT`, detail `Esta pantalla no se pudo
 *     abrir porque la app se actualizó. Recarga para continuar.`
 *   - `sin-conexion` (module-load error and `enLinea` false): title
 *     `No se pudo abrir esta pantalla sin conexión`, detail `Conéctate a
 *     internet y vuelve a intentarlo.`
 *   - `inesperado` (any other error, with or without connection): title
 *     `Algo salió mal al abrir esta pantalla`, detail `Vuelve a intentarlo. Si
 *     sigue pasando, ve al inicio.` A non-module-load error gives `inesperado`
 *     even offline.
 *   Return shape: `{ tipo: 'version-nueva' | 'sin-conexion' | 'inesperado';
 *   titulo: string; detalle: string }`.
 */

describe('esErrorCargaModulo (L1)', () => {
  it("es true with new TypeError('Failed to fetch dynamically imported module: http://x/a.tsx')", () => {
    expect(
      esErrorCargaModulo(
        new TypeError('Failed to fetch dynamically imported module: http://x/a.tsx'),
      ),
    ).toBe(true);
  });

  it("es true with new TypeError('Importing a module script failed.')", () => {
    expect(esErrorCargaModulo(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it("es true with new Error('error loading dynamically imported module')", () => {
    expect(esErrorCargaModulo(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it("es true with an object `{ name: 'ChunkLoadError', message: 'Loading chunk 3 failed' }`", () => {
    expect(
      esErrorCargaModulo({ name: 'ChunkLoadError', message: 'Loading chunk 3 failed' }),
    ).toBe(true);
  });

  it('es true with the text in uppercase', () => {
    expect(
      esErrorCargaModulo(
        new TypeError('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE: HTTP://X/A.TSX'),
      ),
    ).toBe(true);
  });

  it("es false with new Error('Cannot read properties of undefined')", () => {
    expect(esErrorCargaModulo(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('es false with null', () => {
    expect(esErrorCargaModulo(null)).toBe(false);
  });

  it('es false with undefined', () => {
    expect(esErrorCargaModulo(undefined)).toBe(false);
  });

  it("es false with 'otro texto'", () => {
    expect(esErrorCargaModulo('otro texto')).toBe(false);
  });

  it('es false with {}', () => {
    expect(esErrorCargaModulo({})).toBe(false);
  });
});

describe('describirErrorRuta (L2)', () => {
  it('version-nueva: module-load error y enLinea true', () => {
    expect(
      describirErrorRuta(
        new TypeError('Failed to fetch dynamically imported module: http://x/a.tsx'),
        true,
      ),
    ).toEqual({
      tipo: 'version-nueva',
      titulo: 'Hay una versión nueva de GUACHAFIT',
      detalle: 'Esta pantalla no se pudo abrir porque la app se actualizó. Recarga para continuar.',
    });
  });

  it('sin-conexion: module-load error y enLinea false', () => {
    expect(
      describirErrorRuta(
        new TypeError('Failed to fetch dynamically imported module: http://x/a.tsx'),
        false,
      ),
    ).toEqual({
      tipo: 'sin-conexion',
      titulo: 'No se pudo abrir esta pantalla sin conexión',
      detalle: 'Conéctate a internet y vuelve a intentarlo.',
    });
  });

  it('inesperado: any other error con conexión', () => {
    expect(
      describirErrorRuta(new Error('Cannot read properties of undefined'), true),
    ).toEqual({
      tipo: 'inesperado',
      titulo: 'Algo salió mal al abrir esta pantalla',
      detalle: 'Vuelve a intentarlo. Si sigue pasando, ve al inicio.',
    });
  });

  it('inesperado: any other error sin conexión (non-module-load error gives inesperado even offline)', () => {
    expect(
      describirErrorRuta(new Error('Cannot read properties of undefined'), false),
    ).toEqual({
      tipo: 'inesperado',
      titulo: 'Algo salió mal al abrir esta pantalla',
      detalle: 'Vuelve a intentarlo. Si sigue pasando, ve al inicio.',
    });
  });
});
