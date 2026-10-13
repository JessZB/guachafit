import { describe, expect, it } from 'vitest';
import { ModoAsignacionPlantilla, NivelObjetivoPlantilla, type PlantillaRutinaDTO } from '@guachafit/shared';
import { construirResultadoDemoAsignacion } from './selector-plantilla-asignacion-demo';

function detalle(): PlantillaRutinaDTO {
  return {
    id: 'plantilla-1',
    entrenadorId: 'entrenador-1',
    nombre: 'Tren Superior Hipertrofia A',
    nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
    bloques: [],
    activa: true,
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
  };
}

describe('construirResultadoDemoAsignacion', () => {
  it('devuelve éxito único con el modo y la plantilla recibidos', () => {
    const res = construirResultadoDemoAsignacion(
      detalle(),
      ModoAsignacionPlantilla.REEMPLAZAR,
      'alumno-1'
    );

    expect(res.plantillaId).toBe('plantilla-1');
    expect(res.modo).toBe(ModoAsignacionPlantilla.REEMPLAZAR);
    expect(res.totalSolicitados).toBe(1);
    expect(res.exitosos).toBe(1);
    expect(res.fallidos).toBe(0);
  });

  it('el resultado enlaza al alumno con una rutina demo estable', () => {
    const res = construirResultadoDemoAsignacion(
      detalle(),
      ModoAsignacionPlantilla.FUSIONAR,
      'alumno-9'
    );

    expect(res.resultados).toHaveLength(1);
    expect(res.resultados[0]).toMatchObject({
      alumnoId: 'alumno-9',
      exito: true,
      rutinaId: 'demo-rutina-alumno-9',
      rutinaNombre: 'Tren Superior Hipertrofia A',
    });
  });

  it('cuenta los bloques del detalle', () => {
    const conBloques = detalle();
    conBloques.bloques = [
      { diaId: 'd1', titulo: 'Día 1', ejercicios: [] },
      { diaId: 'd2', titulo: 'Día 2', ejercicios: [] },
    ];

    const res = construirResultadoDemoAsignacion(
      conBloques,
      ModoAsignacionPlantilla.FUSIONAR,
      'alumno-1'
    );

    expect(res.resultados[0].bloquesTotal).toBe(2);
  });
});
