import { describe, it, expect } from 'vitest';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { MAX_DIAS_RUTINA, asignarDiasLibres, clonarYRegenerarDiaIds } from './bloques-reglas';

/** Prompt 120 (lote A): unitarias del clonado y del reparto de días de FUSIONAR. */
describe('bloques-reglas', () => {
  function bloque(diaId: string, diaSugerido?: number): BloqueDiaRutinaDTO {
    return { diaId, titulo: `Día ${diaId}`, diaSugerido, ejercicios: [] } as BloqueDiaRutinaDTO;
  }

  it('expone el tope semanal de 7 días', () => {
    expect(MAX_DIAS_RUTINA).toBe(7);
  });

  it('clona en profundidad y regenera cada diaId sin tocar el original', () => {
    const originales = [bloque('dia-1', 1), bloque('dia-2', 3)];
    const clonados = clonarYRegenerarDiaIds(originales);
    expect(clonados).toHaveLength(2);
    expect(clonados[0].diaId).not.toBe('dia-1');
    expect(clonados[1].diaId).not.toBe('dia-2');
    expect(clonados[0].diaId).not.toBe(clonados[1].diaId);
    expect(originales.map((b) => b.diaId)).toEqual(['dia-1', 'dia-2']);
    expect(clonados[0].diaSugerido).toBe(1);
  });

  it('conserva el día sugerido cuando está libre', () => {
    const existentes = [bloque('e-1', 1)];
    const nuevos = [bloque('n-1', 3)];
    expect(asignarDiasLibres(existentes, nuevos).map((b) => b.diaSugerido)).toEqual([3]);
  });

  it('mueve al siguiente día libre cuando el sugerido está ocupado, sin tocar los existentes', () => {
    const existentes = [bloque('e-1', 1), bloque('e-2', 2)];
    const nuevos = [bloque('n-1', 1), bloque('n-2', 2)];
    const resultado = asignarDiasLibres(existentes, nuevos);
    expect(resultado.map((b) => b.diaSugerido)).toEqual([3, 4]);
    expect(existentes.map((b) => b.diaSugerido)).toEqual([1, 2]);
  });

  it('reparte días distintos entre los nuevos aunque pidan el mismo', () => {
    const resultado = asignarDiasLibres([], [bloque('n-1', 5), bloque('n-2', 5)]);
    expect(resultado.map((b) => b.diaSugerido)).toEqual([5, 6]);
  });

  it('un día fuera de 1-7 cae al primer día libre', () => {
    const resultado = asignarDiasLibres([bloque('e-1', 1)], [bloque('n-1', 9)]);
    expect(resultado[0].diaSugerido).toBe(2);
  });
});
