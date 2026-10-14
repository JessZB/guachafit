import { describe, it, expect } from 'vitest';
import { EstadoAlumno } from '@guachafit/shared';
import {
  evaluarRiesgoDeportivo,
  indexarDatosAdherencia,
} from './riesgo-deportivo-reglas';

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

describe('reglas de riesgo deportivo del entrenador', () => {
  it('indexa las rutinas, las completadas y la última sesión por alumno', () => {
    const { rutinaPorAlumno, completadasVentanaPorAlumno, ultimaSesionPorAlumno } =
      indexarDatosAdherencia(
        [
          { alumnoId: 'u-1', bloques: [], createdAtUtc: new Date() },
          { alumnoId: 'u-1', bloques: [], createdAtUtc: new Date(0) },
        ],
        [{ alumnoId: 'u-1' }, { alumnoId: 'u-1' }],
        [
          {
            alumnoId: 'u-1',
            fechaProgramada: '2026-10-01',
            fechaFinUtc: new Date(),
          },
          { alumnoId: 'u-1', fechaProgramada: '2026-09-01', fechaFinUtc: null },
        ]
      );
    expect(rutinaPorAlumno.has('u-1')).toBe(true);
    expect(completadasVentanaPorAlumno.get('u-1')).toBe(2);
    expect(ultimaSesionPorAlumno.has('u-1')).toBe(true);
  });

  it('marca en riesgo deportivo al alumno activo con 4 o más días sin entrenar', () => {
    const ahora = new Date();
    const alumnos = [crearAlumno('a-1', 'u-1')];
    const resultado = evaluarRiesgoDeportivo(
      alumnos,
      new Map(),
      new Map(),
      new Map(),
      { isoDayHoy: 1, hoyLocal: '2026-10-13' },
      ahora
    );
    expect(resultado.alumnosInactivosEntrenamiento).toHaveLength(1);
    expect(resultado.alumnosEnRiesgoDeportivo).toBe(1);
    // Sin plan activo no hay prescritas: la tasa queda en null explícito.
    expect(resultado.tasaAdherenciaSemanal).toBeNull();
  });

  it('no marca en riesgo al alumno inactivo sin plan aunque lleve días sin entrenar', () => {
    const ahora = new Date();
    const alumnos = [
      crearAlumno('a-1', 'u-1', { estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO }),
    ];
    const resultado = evaluarRiesgoDeportivo(
      alumnos,
      new Map(),
      new Map(),
      new Map(),
      { isoDayHoy: 1, hoyLocal: '2026-10-13' },
      ahora
    );
    expect(resultado.alumnosInactivosEntrenamiento).toHaveLength(0);
    expect(resultado.alumnosEnRiesgoDeportivo).toBe(0);
  });
});
