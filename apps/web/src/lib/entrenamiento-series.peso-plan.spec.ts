import { describe, expect, it } from 'vitest';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { construirPayloadSerie } from './entrenamiento-series';

function serieBase(parcial: Partial<SerieRegistroDetalleDTO> = {}): SerieRegistroDetalleDTO {
  return {
    id: 's-test',
    ejercicioSesionId: 'es-test',
    numeroSerie: 1,
    repsObjetivo: 10,
    repsLogradas: null,
    pesoKg: null,
    pesoPrescritoKg: '60.00',
    rpe: '8.0',
    descansoSegundos: 90,
    completada: false,
    timestampCompletadaUtc: null,
    ...parcial,
  };
}

describe('construirPayloadSerie · precarga del peso con el plan', () => {
  it('con serie pendiente pesoKg: null y pesoPrescritoKg: "60.00" produce pesoKg igual al plan normalizado ("60.00")', () => {
    const serie = serieBase({ pesoKg: null, pesoPrescritoKg: '60.00' });
    const payload = construirPayloadSerie(serie, null, 90, false);
    expect(payload.series[0].pesoKg).toBe('60.00');
  });

  it('con serie pendiente pesoKg: "" produce pesoKg: null', () => {
    const serie = serieBase({ pesoKg: '', pesoPrescritoKg: '60.00' });
    const payload = construirPayloadSerie(serie, null, 90, false);
    expect(payload.series[0].pesoKg).toBeNull();
  });

  it('con serie pendiente pesoKg: "62.50" y plan distinto ("60.00") produce "62.50"', () => {
    const serie = serieBase({ pesoKg: '62.50', pesoPrescritoKg: '60.00' });
    const payload = construirPayloadSerie(serie, null, 90, false);
    expect(payload.series[0].pesoKg).toBe('62.50');
  });
});
