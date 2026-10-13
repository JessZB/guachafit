/**
 * M8 plantillas (fase B, prompt 58) · specs de `plantillas-resumen.ts`.
 *
 * Cubre la lógica pura extraída de `PlantillasPage.tsx:335-348`: el resumen del
 * listado tras guardar (crear/editar en modo real) conserva identidad, nivel,
 * estado y fechas, y cuenta días/ejercicios del detalle.
 */
import { describe, expect, it } from 'vitest';
import { NivelObjetivoPlantilla, type PlantillaRutinaDTO } from '@guachafit/shared';
import { resumirDetallePlantilla } from './plantillas-resumen';

function detalleBase(): PlantillaRutinaDTO {
  return {
    id: 'p-1',
    entrenadorId: 'e1',
    nombre: 'Rutina Fuerza',
    nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
    activa: true,
    createdAtUtc: '2026-09-01T10:00:00.000Z',
    updatedAtUtc: '2026-09-20T10:00:00.000Z',
    bloques: [
      {
        diaId: 'd1',
        diaSugerido: 1,
        titulo: 'Día 1 (Lunes)',
        enfoque: 'Fuerza',
        ejercicios: [
          {
            id: 'e-1',
            ejercicioId: '11111111-1111-4111-8111-111111111c01',
            nombre: 'Press Plano con Mancuernas',
            series: 4,
            reps: '8-10',
            peso: '28.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
        ],
      },
    ],
  };
}

describe('resumirDetallePlantilla', () => {
  it('conserva identidad, nivel, estado y fechas del detalle', () => {
    const resumen = resumirDetallePlantilla(detalleBase());

    expect(resumen.id).toBe('p-1');
    expect(resumen.entrenadorId).toBe('e1');
    expect(resumen.nombre).toBe('Rutina Fuerza');
    expect(resumen.nivelObjetivo).toBe(NivelObjetivoPlantilla.INTERMEDIO);
    expect(resumen.activa).toBe(true);
    expect(resumen.createdAtUtc).toBe('2026-09-01T10:00:00.000Z');
    expect(resumen.updatedAtUtc).toBe('2026-09-20T10:00:00.000Z');
  });

  it('cuenta los días y ejercicios del detalle', () => {
    const resumen = resumirDetallePlantilla(detalleBase());

    expect(resumen.totalDias).toBe(1);
    expect(resumen.totalEjercicios).toBe(1);
  });

  it('suma ejercicios de varios días', () => {
    const detalle = detalleBase();
    detalle.bloques = [
      ...detalle.bloques,
      { ...detalle.bloques[0], diaId: 'd2', ejercicios: [...detalle.bloques[0].ejercicios, ...detalle.bloques[0].ejercicios] },
    ];

    const resumen = resumirDetallePlantilla(detalle);

    expect(resumen.totalDias).toBe(2);
    expect(resumen.totalEjercicios).toBe(3);
  });

  it('tolera bloques sin ejercicios (respuesta real del servidor)', () => {
    const detalle = detalleBase();
    detalle.bloques = [{ ...detalle.bloques[0], ejercicios: undefined as never }];

    const resumen = resumirDetallePlantilla(detalle);

    expect(resumen.totalDias).toBe(1);
    expect(resumen.totalEjercicios).toBe(0);
  });

  it('un detalle sin bloques resume en ceros', () => {
    const detalle = detalleBase();
    detalle.bloques = [];

    const resumen = resumirDetallePlantilla(detalle);

    expect(resumen.totalDias).toBe(0);
    expect(resumen.totalEjercicios).toBe(0);
  });
});
