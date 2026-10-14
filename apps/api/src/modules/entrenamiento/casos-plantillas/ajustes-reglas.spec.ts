import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import {
  MENSAJE_AJUSTE_AJENO_A_PLANTILLA,
  aplicarAjustesBloques,
} from './ajustes-reglas';

/** Prompt 120 (lote A): unitarias de los ajustes de asignación (RF-017 Escenario 2). */
describe('ajustes-reglas', () => {
  function bloqueBase(): BloqueDiaRutinaDTO {
    return {
      diaId: 'dia-1',
      titulo: 'Pierna',
      ejercicios: [
        {
          ejercicioId: '11111111-1111-1111-8111-111111111111',
          nombre: 'Sentadilla',
          series: 4,
          reps: '8-10',
          peso: '60 kg',
          rpe: '8',
        },
      ],
    } as BloqueDiaRutinaDTO;
  }

  it('sin ajustes deja los bloques intactos', () => {
    const bloques = [bloqueBase()];
    aplicarAjustesBloques(bloques, undefined);
    aplicarAjustesBloques(bloques, []);
    expect(bloques[0].ejercicios[0]).toMatchObject({ series: 4, reps: '8-10' });
  });

  it('aplica peso, series, reps y rpe sobre el ejercicio localizado por diaId y nombre', () => {
    const bloques = [bloqueBase()];
    aplicarAjustesBloques(bloques, [
      {
        diaId: 'dia-1',
        nombre: 'Sentadilla',
        pesoPrescritoKg: '62.50',
        series: 5,
        reps: '6',
        rpe: '9',
      },
    ]);
    expect(bloques[0].ejercicios[0]).toMatchObject({
      peso: '62.50',
      series: 5,
      reps: '6',
      rpe: '9',
    });
  });

  it('localiza el ejercicio por ejercicioId cuando el ajuste lo trae', () => {
    const bloques = [bloqueBase()];
    aplicarAjustesBloques(bloques, [
      {
        diaId: 'dia-1',
        ejercicioId: '11111111-1111-1111-8111-111111111111',
        series: 3,
      },
    ]);
    expect(bloques[0].ejercicios[0].series).toBe(3);
  });

  it('rechaza con 400 el ajuste a un día que no está en la plantilla', () => {
    const bloques = [bloqueBase()];
    expect(() =>
      aplicarAjustesBloques(bloques, [{ diaId: 'dia-ajeno', nombre: 'Sentadilla', series: 3 }])
    ).toThrowError(BadRequestException);
    try {
      aplicarAjustesBloques(bloques, [{ diaId: 'dia-ajeno', nombre: 'Sentadilla', series: 3 }]);
    } catch (error) {
      expect((error as BadRequestException).message).toContain(MENSAJE_AJUSTE_AJENO_A_PLANTILLA);
    }
  });

  it('rechaza con 400 el ajuste a un ejercicio que no está en el bloque', () => {
    const bloques = [bloqueBase()];
    expect(() =>
      aplicarAjustesBloques(bloques, [{ diaId: 'dia-1', nombre: 'Press banca', series: 3 }])
    ).toThrowError(MENSAJE_AJUSTE_AJENO_A_PLANTILLA);
  });
});
