import { describe, expect, it } from 'vitest';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { construirPayloadSerie, revertirSerieRechazada, validarSerieParaEnviar } from './entrenamiento-series';

function serieBase(parcial: Partial<SerieRegistroDetalleDTO> = {}): SerieRegistroDetalleDTO {
  return {
    id: 's1',
    ejercicioSesionId: 'es1',
    numeroSerie: 1,
    repsObjetivo: 10,
    repsLogradas: 10,
    pesoKg: '28.00',
    pesoPrescritoKg: '28.00',
    rpe: '8.0',
    descansoSegundos: 90,
    completada: false,
    timestampCompletadaUtc: null,
    ...parcial,
  };
}

describe('validarSerieParaEnviar', () => {
  it('acepta una serie completa válida', () => {
    expect(validarSerieParaEnviar(serieBase())).toBeNull();
  });

  it('acepta una serie sin peso (RN-01: el peso es opcional)', () => {
    expect(validarSerieParaEnviar(serieBase({ pesoKg: null }))).toBeNull();
    expect(validarSerieParaEnviar(serieBase({ pesoKg: '' }))).toBeNull();
  });

  it('rechaza un peso presente pero no representable', () => {
    const error = validarSerieParaEnviar(serieBase({ pesoKg: 'no-numero' }));
    expect(error?.campo).toBe('pesoKg');
  });

  it('rechaza un esfuerzo fuera de rango', () => {
    const error = validarSerieParaEnviar(serieBase({ rpe: '99' }));
    expect(error?.campo).toBe('rpe');
  });
});

describe('construirPayloadSerie', () => {
  it('construye el batch del marcado con el peso ya normalizado', () => {
    const serie = serieBase({ completada: true, timestampCompletadaUtc: '2026-10-13T10:00:00Z' });
    expect(construirPayloadSerie(serie, '28.00', 90, true)).toEqual({
      series: [
        {
          serieId: 's1',
          repsLogradas: 10,
          pesoKg: '28.00',
          rpe: '8.0',
          descansoSegundos: 90,
          completada: true,
          timestampInicioUtc: undefined,
          timestampCompletadaUtc: '2026-10-13T10:00:00Z',
        },
      ],
    });
  });

  it('propaga la marca de inicio real en el mismo batch (WU17)', () => {
    const serie = serieBase({ timestampInicioUtc: '2026-10-13T09:58:00Z' });
    const payload = construirPayloadSerie(serie, null, 90, false);
    expect(payload.series[0].timestampInicioUtc).toBe('2026-10-13T09:58:00Z');
  });

  it('normaliza un descanso ausente a null', () => {
    const serie = serieBase({ descansoSegundos: null });
    const payload = construirPayloadSerie(serie, null, undefined, false);
    expect(payload.series[0].descansoSegundos).toBeNull();
  });
});

describe('revertirSerieRechazada', () => {
  it('revierte solo lo que tocó el marcado y conserva ediciones en vuelo', () => {
    const antes = serieBase({ completada: false, timestampCompletadaUtc: null, descansoSegundos: 90 });
    const actual = {
      id: 'ses1',
      alumnoId: 'a1',
      fechaProgramada: '2026-10-13',
      timezoneCliente: 'America/Caracas',
      estado: 'EN_PROGRESO',
      porcentajeCumplimiento: '50.00',
      ejercicios: [
        {
          id: 'es1',
          sesionId: 'ses1',
          ejercicioId: 'ej1',
          orden: 1,
          series: [
            {
              ...serieBase(),
              completada: true,
              pesoKg: '30.00',
              timestampCompletadaUtc: '2026-10-13T10:00:00Z',
              descansoSegundos: 120,
            },
          ],
        },
      ],
    } as never;
    const revertida = revertirSerieRechazada(actual, {
      ejercicioIndex: 0,
      serieIndex: 0,
      serieAntes: antes,
      porcentajeAntes: '0.00',
      rachaAntes: false,
    });
    const serie = (revertida as unknown as { ejercicios: { series: SerieRegistroDetalleDTO[] }[] }).ejercicios[0].series[0];
    expect(serie.completada).toBe(false);
    expect(serie.descansoSegundos).toBe(90);
    expect(serie.pesoKg).toBe('30.00');
    expect(revertida.porcentajeCumplimiento).toBe('0.00');
  });
});
