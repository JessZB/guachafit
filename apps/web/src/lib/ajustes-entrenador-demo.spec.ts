/**
 * Specs de `lib/ajustes-entrenador-demo.ts` (datos demo extraídos de AjustesPage).
 */
import { describe, expect, it } from 'vitest';
import { planesDemo, tasaDemo } from './ajustes-entrenador-demo';

describe('ajustes-entrenador-demo', () => {
  it('devuelve el catálogo de ejemplo con los dos planes conocidos', () => {
    const planes = planesDemo();
    expect(planes).toHaveLength(2);
    expect(planes.map((p) => p.nombre)).toEqual([
      'Presencial Completo Sala',
      'Asesoría Online & Nutrición',
    ]);
    expect(planes.map((p) => p.precioBaseUsd)).toEqual(['40.00', '30.00']);
    expect(planes.every((p) => p.activo)).toBe(true);
  });

  it('devuelve la tasa de ejemplo con fuente oficial_bcv', () => {
    const tasa = tasaDemo();
    expect(tasa.tasaOficialBcv).toBe('66.5000');
    expect(tasa.tasaParalelo).toBe('74.2000');
    expect(tasa.tasaActivaEntrenador).toBe('66.5000');
    expect(tasa.fuente).toBe('oficial_bcv');
  });
});
