/**
 * Spec de la lógica pura residual de `GraficoEvolucion` (SL-1 del prompt 82).
 */
import { describe, expect, it } from 'vitest';
import { formatearTickEvolucion, valoresDeSeriesEvolucion } from './grafico-evolucion-formato';
import type { SerieMetrica } from './evolucion-graficos';
import { metricaPorId } from './evolucion-graficos';

function serieFicticia(id: 'peso' | 'grasa', valores: number[]): SerieMetrica {
  const metrica = metricaPorId(id);
  return {
    metrica,
    color: metrica.colorPreferido,
    eje: 'izquierda',
    puntos: valores.map((valor, i) => ({ fecha: `2026-09-0${i + 1}`, valor })),
    segmentos: [],
  };
}

describe('grafico-evolucion-formato', () => {
  it('formatearTickEvolucion: 0 decimales desde 100, 1 decimal por debajo', () => {
    expect(formatearTickEvolucion(99.95)).toBe('100.0');
    expect(formatearTickEvolucion(74.5)).toBe('74.5');
    expect(formatearTickEvolucion(100)).toBe('100');
    expect(formatearTickEvolucion(-120.4)).toBe('-120');
  });

  it('valoresDeSeriesEvolucion: aplana los puntos de todas las series', () => {
    const series = [serieFicticia('peso', [77.7, 74.5]), serieFicticia('grasa', [17.2])];
    expect(valoresDeSeriesEvolucion(series)).toEqual([77.7, 74.5, 17.2]);
    expect(valoresDeSeriesEvolucion([])).toEqual([]);
  });
});
