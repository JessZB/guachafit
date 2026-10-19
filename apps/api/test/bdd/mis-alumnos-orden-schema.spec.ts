import { describe, expect, it } from 'vitest';
import * as moduloAlumnos from '@guachafit/shared';

const { FiltroDirectorioAlumnosSchema } = moduloAlumnos;
const OrdenDirectorioAlumnos = (
  moduloAlumnos as unknown as {
    OrdenDirectorioAlumnos?: Record<string, string>;
  }
).OrdenDirectorioAlumnos;

/**
 * Lote 02 · Contratos B1-B2 (reubicados desde
 * `packages/shared/src/schemas/alumnos-directorio-orden.spec.ts`).
 * `packages/shared` no tiene ejecutor de tests (`pnpm --filter @guachafit/shared test`
 * sale 0 sin ejecutar nada), así que el spec vive donde sí se ejecuta.
 * Fase roja: `OrdenDirectorioAlumnos` y `orden` aún no existen en `@guachafit/shared`.
 */
describe('B. Shared alumnos-directorio-orden (vía @guachafit/api)', () => {
  describe('B1 OrdenDirectorioAlumnos', () => {
    it('expone exactamente los cuatro valores del contrato', () => {
      expect(
        OrdenDirectorioAlumnos,
        'falta el export OrdenDirectorioAlumnos en schemas/alumnos',
      ).toBeDefined();
      expect(OrdenDirectorioAlumnos).toEqual({
        ALTA_RECIENTE: 'alta_reciente',
        NOMBRE: 'nombre',
        SIN_ENTRENAR: 'sin_entrenar',
        MAYOR_RACHA: 'mayor_racha',
      });
    });

    it('no expone valores fuera del contrato', () => {
      expect(
        OrdenDirectorioAlumnos,
        'falta el export OrdenDirectorioAlumnos en schemas/alumnos',
      ).toBeDefined();
      expect(Object.keys(OrdenDirectorioAlumnos ?? {}).sort()).toEqual(
        ['ALTA_RECIENTE', 'MAYOR_RACHA', 'NOMBRE', 'SIN_ENTRENAR'].sort(),
      );
    });
  });

  describe('B2 FiltroDirectorioAlumnosSchema orden', () => {
    it("parse({}) da orden === 'alta_reciente'", () => {
      expect(FiltroDirectorioAlumnosSchema.parse({}).orden).toBe('alta_reciente');
    });

    it.each(['alta_reciente', 'nombre', 'sin_entrenar', 'mayor_racha'] as const)(
      'acepta orden=%s',
      (orden) => {
        expect(FiltroDirectorioAlumnosSchema.parse({ orden }).orden).toBe(orden);
      },
    );

    it("rechaza orden='foo'", () => {
      expect(() => FiltroDirectorioAlumnosSchema.parse({ orden: 'foo' })).toThrow();
    });
  });
});
