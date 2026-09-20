import { describe, it, expect } from 'vitest';
import { EstadoAlumno, Modalidad, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { calcularResumenDirectorio } from './directorio-alumnos';

function alumno(parcial: Partial<PerfilAlumnoDetalleDTO>): PerfilAlumnoDetalleDTO {
  return {
    id: parcial.id ?? 'a1',
    usuarioId: 'u1',
    entrenadorId: 'coach',
    tipoDocumento: 'V' as PerfilAlumnoDetalleDTO['tipoDocumento'],
    numeroDocumento: '1',
    nombres: 'Alumno',
    apellidos: 'Demo',
    fechaNacimiento: '1995-01-01',
    edadCalculada: 30,
    telefonoWhatsapp: '+584120000000',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    ...parcial,
  };
}

describe('calcularResumenDirectorio (WU19: KPIs del directorio desde la cartera)', () => {
  it('cuenta la cartera completa: activos, pausados, modalidades y archivados', () => {
    const resumen = calcularResumenDirectorio([
      alumno({ id: 'a1', modalidad: Modalidad.PRESENCIAL }),
      alumno({ id: 'a2', modalidad: Modalidad.REMOTO }),
      alumno({
        id: 'a3',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
      }),
      alumno({
        id: 'a4',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        deletedAtUtc: '2026-06-01T00:00:00.000Z',
      }),
    ]);

    expect(resumen).toEqual({
      total: 4,
      activos: 2,
      pausados: 1,
      morosos: 0,
      presenciales: 1,
      remotos: 2,
      archivados: 1,
    });
  });

  it('un alumno archivado jamás suma a activos/pausados/modalidades aunque conserve su estado', () => {
    const resumen = calcularResumenDirectorio([
      alumno({
        id: 'a1',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: '2026-06-01T00:00:00.000Z',
      }),
    ]);

    expect(resumen.total).toBe(1);
    expect(resumen.archivados).toBe(1);
    expect(resumen.activos).toBe(0);
    expect(resumen.presenciales).toBe(0);
  });

  it('cuenta morosos solo entre alumnos vigentes con semáforo moroso', () => {
    const resumen = calcularResumenDirectorio([
      alumno({ id: 'a1', semaforoPago: 'moroso' }),
      alumno({ id: 'a2', semaforoPago: 'al_dia' }),
      alumno({ id: 'a3', semaforoPago: 'moroso', deletedAtUtc: '2026-06-01T00:00:00.000Z' }),
    ]);

    expect(resumen.morosos).toBe(1);
  });

  it('una cartera vacía produce contadores en cero', () => {
    expect(calcularResumenDirectorio([])).toEqual({
      total: 0,
      activos: 0,
      pausados: 0,
      morosos: 0,
      presenciales: 0,
      remotos: 0,
      archivados: 0,
    });
  });
});
