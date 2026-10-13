import { describe, it, expect } from 'vitest';
import {
  evaluarToleranciaNutricional,
  redondearPorcentaje,
} from './tolerancia-nutricional-reglas';

/** Prompt 106: unitarias de la lógica pura de tolerancia (RF-002 Escenario 3, RN-01, RN-04). */
describe('tolerancia-nutricional-reglas', () => {
  const metas = { caloriasObjetivo: 2000, proteinaGramosObjetivo: 150 };

  it('redondea el porcentaje a 2 decimales', () => {
    expect(redondearPorcentaje(10.005)).toBe(10.01);
    expect(redondearPorcentaje(-26.666)).toBe(-26.67);
  });

  it('sin metas del coach devuelve {} (sin evaluar, nunca un OK fabricado)', () => {
    expect(evaluarToleranciaNutricional(2100, 155, null)).toEqual({});
    expect(evaluarToleranciaNutricional(2100, 155, undefined)).toEqual({});
  });

  it('sin dimensiones evaluables devuelve {}', () => {
    expect(evaluarToleranciaNutricional(null, undefined, metas)).toEqual({});
    expect(
      evaluarToleranciaNutricional(2100, 155, { caloriasObjetivo: 0, proteinaGramosObjetivo: 0 })
    ).toEqual({});
  });

  it('dentro del ±10% marca dentroMargenTolerancia con desviaciones', () => {
    const tol = evaluarToleranciaNutricional(2100, 155, metas);
    expect(tol.dentroMargenTolerancia).toBe(true);
    expect(tol.desviacionCaloriasPct).toBe(5);
    expect(tol.desviacionProteinasPct).toBe(3.33);
  });

  it('fuera del margen en una dimensión marca false (AND de evaluadas)', () => {
    expect(evaluarToleranciaNutricional(2400, 150, metas).dentroMargenTolerancia).toBe(false);
    expect(evaluarToleranciaNutricional(2000, 110, metas).dentroMargenTolerancia).toBe(false);
  });

  it('evalúa solo las dimensiones con meta configurada', () => {
    const soloCalorias = evaluarToleranciaNutricional(2100, 999, {
      caloriasObjetivo: 2000,
      proteinaGramosObjetivo: null,
    });
    expect(soloCalorias.dentroMargenTolerancia).toBe(true);
    expect(soloCalorias.desviacionProteinasPct).toBeUndefined();
  });

  it('la meta de hidratación no entra en la tolerancia (RN-04)', () => {
    const tol = evaluarToleranciaNutricional(2000, 150, {
      ...metas,
      aguaLitrosObjetivo: '2.00',
    });
    expect(tol.dentroMargenTolerancia).toBe(true);
    expect(tol).not.toHaveProperty('desviacionAguaPct');
  });
});
