import { describe, expect, it } from 'vitest';
import { EstadoSesion } from '@guachafit/shared';
import {
  calcularDeltasAntropometricos,
  calcularEdadAlumno,
  calcularSemaforoPago,
  esSesionRealizada,
  resolverUltimoEntrenamiento,
} from './alumno-detalle-metricas';

const sesion = (estado: EstadoSesion) => ({ estado }) as never;

describe('alumno-detalle-metricas', () => {
  it('solo COMPLETADA y EN_PROGRESO cuentan como realizadas', () => {
    expect(esSesionRealizada(sesion(EstadoSesion.COMPLETADA))).toBe(true);
    expect(esSesionRealizada(sesion(EstadoSesion.EN_PROGRESO))).toBe(true);
    expect(esSesionRealizada(null)).toBe(false);
    expect(esSesionRealizada(undefined)).toBe(false);
  });

  it('D2: sin semáforo del perfil ni finanzas no inventa estado', () => {
    expect(calcularSemaforoPago(undefined, null)).toBeNull();
    expect(calcularSemaforoPago('moroso', null)).toBe('moroso');
    expect(
      calcularSemaforoPago(undefined, { saldoPendienteTotalUsd: '20.00' } as never)
    ).toBe('moroso');
    expect(
      calcularSemaforoPago(undefined, { saldoPendienteTotalUsd: '0.00' } as never)
    ).toBe('al_dia');
  });

  it('el último prefiere /ultima y cae al historial realizado', () => {
    const realizada = sesion(EstadoSesion.COMPLETADA);
    const planificada = sesion(EstadoSesion.PLANIFICADA);
    expect(resolverUltimoEntrenamiento(realizada, [planificada])).toBe(realizada);
    expect(resolverUltimoEntrenamiento(planificada, [planificada, realizada])).toBe(realizada);
    expect(resolverUltimoEntrenamiento(null, [planificada])).toBeNull();
  });

  it('la edad es 0 sin fecha o con fecha inválida', () => {
    expect(calcularEdadAlumno('')).toBe(0);
    expect(calcularEdadAlumno('no-fecha')).toBe(0);
    expect(calcularEdadAlumno('1998-05-14')).toBeGreaterThan(20);
  });

  it('los deltas exigen ambos valores (nunca NaN)', () => {
    const actual = {
      id: 'a1',
      fecha: '2026-09-01',
      pesoKg: '78.50',
      grasaPorcentaje: '16.2',
      cinturaCm: null,
      brazoCm: null,
      pechoCm: null,
      musloCm: null,
    };
    const anterior = {
      id: 'a0',
      fecha: '2026-08-01',
      pesoKg: '80.80',
      grasaPorcentaje: null,
      cinturaCm: '84.5',
      brazoCm: null,
      pechoCm: null,
      musloCm: null,
    };
    expect(calcularDeltasAntropometricos(actual, anterior)).toEqual({
      deltaPeso: '-2.3',
      deltaGrasa: null,
      deltaCintura: null,
    });
    expect(calcularDeltasAntropometricos(actual, null)).toEqual({
      deltaPeso: null,
      deltaGrasa: null,
      deltaCintura: null,
    });
  });
});
