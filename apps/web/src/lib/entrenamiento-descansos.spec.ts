import { describe, expect, it } from 'vitest';
import type { EjercicioSesionDetalleDTO } from '@guachafit/shared';
import { construirEtiquetaDescanso, resumirDescansos } from './entrenamiento-descansos';

function ejercicio(parcial: Partial<EjercicioSesionDetalleDTO> = {}): EjercicioSesionDetalleDTO {
  return {
    id: 'es1',
    sesionId: 'ses1',
    ejercicioId: 'ej1',
    orden: 1,
    descansoPrescritoSegundos: 90,
    series: [],
    ...parcial,
  };
}

describe('resumirDescansos', () => {
  it('devuelve null sin series completadas con dato', () => {
    expect(resumirDescansos([])).toBeNull();
    expect(
      resumirDescansos([
        ejercicio({
          series: [
            {
              id: 's1',
              ejercicioSesionId: 'es1',
              numeroSerie: 1,
              repsObjetivo: 10,
              completada: false,
              descansoSegundos: 90,
            },
          ],
        }),
      ])
    ).toBeNull();
  });

  it('promedia real vs prescrito sobre las completadas', () => {
    const resumen = resumirDescansos([
      ejercicio({
        descansoPrescritoSegundos: 90,
        series: [
          {
            id: 's1',
            ejercicioSesionId: 'es1',
            numeroSerie: 1,
            repsObjetivo: 10,
            completada: true,
            descansoSegundos: 100,
          },
          {
            id: 's2',
            ejercicioSesionId: 'es1',
            numeroSerie: 2,
            repsObjetivo: 10,
            completada: true,
            descansoSegundos: 80,
          },
        ],
      }),
    ]);
    expect(resumen).toMatchObject({ count: 2, avgReal: 90, avgPrescrito: 90, diff: 0 });
  });
});

describe('construirEtiquetaDescanso', () => {
  it('usa el separador interno "·" y el formato exacto de la página', () => {
    const etiqueta = construirEtiquetaDescanso({
      totalReal: 200,
      totalPrescrito: 180,
      count: 2,
      avgReal: 100,
      avgPrescrito: 90,
      diff: 10,
    });
    expect(etiqueta).toContain('[Descanso promedio:');
    expect(etiqueta).toContain('·');
    expect(etiqueta).not.toContain(' • ');
  });

  it('marca "exacto" cuando no hay diferencia', () => {
    const etiqueta = construirEtiquetaDescanso({
      totalReal: 180,
      totalPrescrito: 180,
      count: 2,
      avgReal: 90,
      avgPrescrito: 90,
      diff: 0,
    });
    expect(etiqueta).toContain('exacto');
  });
});
