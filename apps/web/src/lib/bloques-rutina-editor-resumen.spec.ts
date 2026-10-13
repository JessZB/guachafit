/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · unitaria de la lógica pura
 * `lib/bloques-rutina-editor-resumen.ts` (origen `BloquesRutinaEditor.tsx:109-116`).
 */
import { describe, expect, it } from 'vitest';
import { crearBloqueEdicion, crearEjercicioEdicion } from './rutina-bloques';
import { calcularResumenEditor } from './bloques-rutina-editor-resumen';

describe('calcularResumenEditor', () => {
  it('sin bloques resume ceros', () => {
    expect(calcularResumenEditor([])).toEqual({ totalDias: 0, totalEjercicios: 0, totalSeries: 0 });
  });

  it('suma ejercicios y series de todos los días', () => {
    const primero = crearBloqueEdicion(1, 'd-resumen-1');
    primero.ejercicios = [
      { ...crearEjercicioEdicion('Press', 'c-1', 'e-1'), series: 3 },
      { ...crearEjercicioEdicion('Remo', 'c-2', 'e-2'), series: 4 },
    ];
    const segundo = crearBloqueEdicion(2, 'd-resumen-2');
    segundo.ejercicios = [{ ...crearEjercicioEdicion('Sentadilla', 'c-3', 'e-3'), series: 5 }];
    expect(calcularResumenEditor([primero, segundo])).toEqual({
      totalDias: 2,
      totalEjercicios: 3,
      totalSeries: 12,
    });
  });
});
