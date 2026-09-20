import { describe, expect, it } from 'vitest';
import { estimarCumpleRachaPorVolumen } from './racha';

/**
 * D8 (RN-02): la estimación local debe usar la MISMA semántica que el servidor
 * (`evaluarCumplimientoRachaPorVolumen` en el API): volumen cuando hay pesos
 * prescritos y fallback a series cuando la prescripción es cualitativa.
 */
describe('estimarCumpleRachaPorVolumen (RN-02, espejo del servidor)', () => {
  it('cumple por VOLUMEN cuando el peso real alcanza >= 70% del prescrito', () => {
    const series = [
      {
        pesoPrescritoKg: '100.00',
        pesoKg: '75.00',
        repsObjetivo: 10,
        repsLogradas: 10,
        completada: true,
      },
    ];
    expect(estimarCumpleRachaPorVolumen(series)).toBe(true);
  });

  it('NO cumple por volumen cuando el peso real es < 70% del prescrito (aunque se completen todas las series)', () => {
    const series = [
      {
        pesoPrescritoKg: '100.00',
        pesoKg: '50.00',
        repsObjetivo: 10,
        repsLogradas: 10,
        completada: true,
      },
      {
        pesoPrescritoKg: '100.00',
        pesoKg: '50.00',
        repsObjetivo: 10,
        repsLogradas: 10,
        completada: true,
      },
    ];
    expect(estimarCumpleRachaPorVolumen(series)).toBe(false);
  });

  it('sin pesos prescritos cae al ratio de series (comportamiento legacy cualitativo)', () => {
    const series = [
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: 10, completada: true },
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: 10, completada: true },
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: 8, completada: true },
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: null, completada: false },
    ];
    expect(estimarCumpleRachaPorVolumen(series)).toBe(true); // 3/4 = 75%
  });

  it('NO cumple si la parte cualitativa queda por debajo del 70% (aunque el volumen sea 100%)', () => {
    const series = [
      {
        pesoPrescritoKg: '100.00',
        pesoKg: '100.00',
        repsObjetivo: 10,
        repsLogradas: 10,
        completada: true,
      },
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: null, completada: false },
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: null, completada: false },
    ];
    expect(estimarCumpleRachaPorVolumen(series)).toBe(false); // cualitativa 0/2 = 0%
  });

  it('exige TODAS las partes existentes >= 70% y no cumple con lista vacía', () => {
    const mixtaOk = [
      {
        pesoPrescritoKg: '80.00',
        pesoKg: '60.00',
        repsObjetivo: 10,
        repsLogradas: 10,
        completada: true,
      },
      { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: 10, completada: true },
    ];
    expect(estimarCumpleRachaPorVolumen(mixtaOk)).toBe(true); // volumen 75% y series 100%
    expect(estimarCumpleRachaPorVolumen([])).toBe(false);
  });
});
