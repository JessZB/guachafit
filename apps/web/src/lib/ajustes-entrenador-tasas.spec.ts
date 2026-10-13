/**
 * Specs de `lib/ajustes-entrenador-tasas.ts` (lógica pura extraída de AjustesPage).
 */
import { describe, expect, it } from 'vitest';
import {
  calcularUsdDesdeVes,
  calcularVesDesdeUsd,
  construirPayloadTasa,
  resolverTasaFinal,
} from './ajustes-entrenador-tasas';

describe('ajustes-entrenador-tasas', () => {
  it('oficial_bcv sincroniza la activa con el campo BCV', () => {
    expect(
      resolverTasaFinal('oficial_bcv', { tasaOficialBcv: '66.5', tasaParalelo: '74.2', tasaActiva: '10' })
    ).toEqual({ tasaFinal: '66.5', tasaActivaSincronizada: '66.5' });
  });

  it('paralelo sincroniza la activa con el campo paralelo', () => {
    expect(
      resolverTasaFinal('paralelo', { tasaOficialBcv: '66.5', tasaParalelo: '74.2', tasaActiva: '10' })
    ).toEqual({ tasaFinal: '74.2', tasaActivaSincronizada: '74.2' });
  });

  it('manual conserva la tasa activa', () => {
    expect(
      resolverTasaFinal('manual', { tasaOficialBcv: '66.5', tasaParalelo: '74.2', tasaActiva: '70' })
    ).toEqual({ tasaFinal: '70', tasaActivaSincronizada: '70' });
  });

  it('payload usa 4 decimales y omite el paralelo vacío (nunca "NaN")', () => {
    const payload = construirPayloadTasa(
      { tasaOficialBcv: '66.5', tasaParalelo: '', tasaActiva: '66.5' },
      '66.5',
      'oficial_bcv'
    );
    expect(payload).toEqual({
      tasaOficialBcv: '66.5000',
      tasaParalelo: undefined,
      tasaActivaEntrenador: '66.5000',
      fuente: 'oficial_bcv',
    });
    expect(JSON.stringify(payload)).not.toContain('NaN');
  });

  it('payload incluye el paralelo cuando es mayor que 0', () => {
    const payload = construirPayloadTasa(
      { tasaOficialBcv: '66.5', tasaParalelo: '74.2', tasaActiva: '74.2' },
      '74.2',
      'paralelo'
    );
    expect(payload.tasaParalelo).toBe('74.2000');
  });

  it('USD→VES redondea a 2 decimales y queda vacío sin tasa', () => {
    expect(calcularVesDesdeUsd('66.5', '40')).toBe((40 * 66.5).toFixed(2));
    expect(calcularVesDesdeUsd('', '40')).toBe('');
    expect(calcularVesDesdeUsd('0', '40')).toBe('');
  });

  it('VES→USD redondea a 2 decimales y conserva el valor sin tasa', () => {
    expect(calcularUsdDesdeVes('66.5', '2660', '40.00')).toBe((2660 / 66.5).toFixed(2));
    expect(calcularUsdDesdeVes('', '2660', '40.00')).toBe('40.00');
  });
});
