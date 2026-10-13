import { describe, expect, it } from 'vitest';
import type {
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
} from '@guachafit/shared';
import {
  calcularResumenPrescripcion,
  capturarRpeSugerido,
  formatearPrescripcion,
  pesoPrescritoConCarga,
  serieSinDatosReales,
} from './entrenamiento-prescripcion';

function serie(parcial: Partial<SerieRegistroDetalleDTO> = {}): SerieRegistroDetalleDTO {
  return {
    id: 's1',
    ejercicioSesionId: 'es1',
    numeroSerie: 1,
    repsObjetivo: 10,
    repsLogradas: null,
    pesoKg: null,
    pesoPrescritoKg: '28.00',
    rpe: '8.0',
    completada: false,
    ...parcial,
  };
}

describe('serieSinDatosReales', () => {
  it('detecta una serie intacta', () => {
    expect(serieSinDatosReales(serie())).toBe(true);
  });

  it('deja de contar en cuanto hay datos reales', () => {
    expect(serieSinDatosReales(serie({ completada: true }))).toBe(false);
    expect(serieSinDatosReales(serie({ pesoKg: '28.00' }))).toBe(false);
    expect(serieSinDatosReales(serie({ repsLogradas: 10 }))).toBe(false);
  });
});

describe('capturarRpeSugerido', () => {
  it('captura el RPE solo si las intactas son uniformes', () => {
    const ejercicios: EjercicioSesionDetalleDTO[] = [
      {
        id: 'es1',
        sesionId: 'ses1',
        ejercicioId: 'ej1',
        orden: 1,
        series: [serie({ id: 's1', rpe: '8.0' }), serie({ id: 's2', rpe: '8.0' })],
      },
      {
        id: 'es2',
        sesionId: 'ses1',
        ejercicioId: 'ej2',
        orden: 2,
        series: [serie({ id: 's3', rpe: '8.0' }), serie({ id: 's4', rpe: '9.0' })],
      },
    ];
    expect(capturarRpeSugerido(ejercicios)).toEqual({ es1: '8.0' });
  });
});

describe('calcularResumenPrescripcion + formatearPrescripcion', () => {
  it('resume n series × reps × peso prescrito', () => {
    const resumen = calcularResumenPrescripcion({
      id: 'es1',
      sesionId: 'ses1',
      ejercicioId: 'ej1',
      orden: 1,
      series: [
        serie({ id: 's1', repsObjetivo: 8 }),
        serie({ id: 's2', repsObjetivo: 10 }),
      ],
    });
    expect(resumen.totalSeries).toBe(2);
    expect(resumen.repsTexto).toBe('8–10');
    expect(formatearPrescripcion(resumen, 'kg')).toBe('2 series × 8–10 reps · 28 kg');
  });

  it('omite el peso cuando la prescripción es cualitativa', () => {
    const resumen = calcularResumenPrescripcion({
      id: 'es1',
      sesionId: 'ses1',
      ejercicioId: 'ej1',
      orden: 1,
      series: [serie({ id: 's1', pesoPrescritoKg: null })],
    });
    expect(formatearPrescripcion(resumen, 'kg')).toBe('1 serie × 10 reps');
  });
});

describe('pesoPrescritoConCarga', () => {
  it('devuelve null sin prescripción con carga', () => {
    expect(pesoPrescritoConCarga(serie({ pesoPrescritoKg: null }))).toBeNull();
    expect(pesoPrescritoConCarga(serie({ pesoPrescritoKg: '0.00' }))).toBeNull();
    expect(pesoPrescritoConCarga(serie())).toBe('28.00');
  });
});
