import { describe, it, expect } from 'vitest';
import { EstadoAlumno } from '@guachafit/shared';
import {
  calcularContadoresRiesgo,
  calcularMetaCobranza,
  calcularOcupacion,
  mapearAlumnosEnMora,
} from './dashboard-entrenador-reglas';

const DIA_MS = 24 * 60 * 60 * 1000;

function crearAlumno(id: string, usuarioId: string, opciones: Record<string, unknown> = {}) {
  return {
    id,
    usuarioId,
    nombres: 'Carlos',
    apellidos: 'Mendoza',
    estadoActivacion: EstadoAlumno.ACTIVO,
    createdAtUtc: new Date(Date.now() - 10 * DIA_MS),
    ...opciones,
  };
}

describe('reglas del dashboard del entrenador', () => {
  it('calcula los activos y el porcentaje de ocupación sobre la capacidad', () => {
    const alumnos = [
      crearAlumno('a-1', 'u-1'),
      crearAlumno('a-2', 'u-2', { estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO }),
    ];
    const resultado = calcularOcupacion(alumnos, 50);
    expect(resultado.alumnosActivos).toBe(1);
    expect(resultado.porcentajeOcupacion).toBe('2.00');
  });

  it('devuelve ocupación 0.00 cuando la capacidad es cero', () => {
    const resultado = calcularOcupacion([crearAlumno('a-1', 'u-1')], 0);
    expect(resultado.porcentajeOcupacion).toBe('0.00');
  });

  it('calcula la meta de cobranza y su porcentaje de avance', () => {
    const resultado = calcularMetaCobranza(
      [{ montoTotalUsd: '35.00' }, { montoTotalUsd: '40.00' }],
      '37.50'
    );
    expect(resultado.metaCobranzaMesUsd).toBe('75.00');
    expect(resultado.porcentajeCobranza).toBe('50.00');
  });

  it('deja la meta en null cuando no hay cuotas emitidas del periodo', () => {
    const resultado = calcularMetaCobranza([], '10.00');
    expect(resultado.metaCobranzaMesUsd).toBeNull();
    expect(resultado.porcentajeCobranza).toBeNull();
  });

  it('mapea las cuotas en mora con los días de vencimiento', () => {
    const ahora = new Date();
    const alumnos = [crearAlumno('a-1', 'u-1')];
    const resultado = mapearAlumnosEnMora(
      [
        {
          id: 'cuota-1',
          clienteId: 'u-1',
          saldoPendienteUsd: '35.00',
          fechaCorteUtc: new Date(ahora.getTime() - 3 * DIA_MS),
          estado: 'VENCIDA',
        },
      ],
      alumnos,
      ahora
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Carlos Mendoza');
    expect(resultado[0].saldoPendienteUsd).toBe('35.00');
    expect(resultado[0].diasVencido).toBe(3);
  });

  it('usa el nombre genérico cuando el alumno ya no está en la cartera', () => {
    const ahora = new Date();
    const resultado = mapearAlumnosEnMora(
      [
        {
          id: 'cuota-1',
          clienteId: 'u-fuera',
          saldoPendienteUsd: '10.00',
          fechaCorteUtc: new Date(ahora.getTime() - DIA_MS),
          estado: 'VENCIDA',
        },
      ],
      [],
      ahora
    );
    expect(resultado[0].alumnoId).toBe('u-fuera');
    expect(resultado[0].nombre).toBe('Alumno Registrado');
  });

  it('separa los contadores de riesgo deportivo y mora financiera', () => {
    const resultado = calcularContadoresRiesgo(
      [
        {
          alumnoId: 'a-1',
          nombre: 'Carlos Mendoza',
          cuotaId: 'c-1',
          saldoPendienteUsd: '35.00',
          diasVencido: 3,
        },
      ],
      [{ alumnoId: 'a-2', nombre: 'Mariana Gómez', diasSinEntrenar: 5 }]
    );
    expect(resultado.alumnosEnMoraFinanciera).toBe(1);
    expect(resultado.alumnosEnRiesgo).toBe(2);
  });
});
