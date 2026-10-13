import { describe, expect, it } from 'vitest';
import {
  TAMANO_PAGINA_FICHA,
  controlesDemoAlumno,
  mapearControlAntro,
} from './alumno-detalle-controles';

describe('alumno-detalle-controles', () => {
  it('fija el tamaño de página de la ficha en 10', () => {
    expect(TAMANO_PAGINA_FICHA).toBe(10);
  });

  it('normaliza el DTO real con perímetros nulos', () => {
    expect(
      mapearControlAntro({
        id: 'c1',
        fechaEvaluacion: '2026-09-01',
        pesoKg: '78.50',
        porcentajeGrasa: null,
        perimetros: null,
      } as never)
    ).toEqual({
      id: 'c1',
      fecha: '2026-09-01',
      pesoKg: '78.50',
      grasaPorcentaje: null,
      cinturaCm: null,
      brazoCm: null,
      pechoCm: null,
      musloCm: null,
    });
  });

  it('el fixture demo trae 2 filas más recientes primero', () => {
    const filas = controlesDemoAlumno();
    expect(filas).toHaveLength(2);
    expect(filas[0].id).toBe('antro-1');
    expect(filas[1].id).toBe('antro-0');
  });
});
