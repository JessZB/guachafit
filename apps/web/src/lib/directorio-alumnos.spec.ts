import { describe, it, expect } from 'vitest';
import { EstadoAlumno, Modalidad, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import {
  calcularResumenDirectorio,
  filtrarDirectorioDemo,
  ROSTER_DEMO_DIRECTORIO,
} from './directorio-alumnos';

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

describe('filtrarDirectorioDemo (WU25a: mismo flujo de filtros que el servidor, sin API)', () => {
  const roster = [
    alumno({
      id: 'al-001',
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@email.com',
      numeroDocumento: '24123456',
      modalidad: Modalidad.PRESENCIAL,
      estadoActivacion: EstadoAlumno.ACTIVO,
      semaforoPago: 'moroso',
    }),
    alumno({
      id: 'al-002',
      nombres: 'Mariana',
      apellidos: 'Pérez',
      email: 'mariana@email.com',
      numeroDocumento: '26987654',
      modalidad: Modalidad.REMOTO,
      estadoActivacion: EstadoAlumno.ACTIVO,
      semaforoPago: 'al_dia',
    }),
    alumno({
      id: 'al-003',
      nombres: 'Roberto',
      apellidos: 'Díaz',
      numeroDocumento: '20112233',
      modalidad: Modalidad.PRESENCIAL,
      estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
      semaforoPago: 'moroso',
    }),
    alumno({
      id: 'al-004',
      nombres: 'Valeria',
      apellidos: 'Silva',
      modalidad: Modalidad.REMOTO,
      estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
      semaforoPago: 'sin_cuota',
      deletedAtUtc: '2026-06-01T00:00:00.000Z',
    }),
  ];

  it('todos = cartera completa (vigentes + archivados), como incluirArchivados=true', () => {
    expect(filtrarDirectorioDemo(roster).map((a) => a.id)).toEqual([
      'al-001',
      'al-002',
      'al-003',
      'al-004',
    ]);
  });

  it('activo/pausado excluyen archivados y respetan el estado pedido', () => {
    expect(filtrarDirectorioDemo(roster, { estado: 'activo' }).map((a) => a.id)).toEqual([
      'al-001',
      'al-002',
    ]);
    expect(filtrarDirectorioDemo(roster, { estado: 'pausado' }).map((a) => a.id)).toEqual([
      'al-003',
    ]);
  });

  it('mora trae vigentes (activos o pausados) con semáforo moroso; archivados solo las bajas lógicas', () => {
    // Igual que el servidor: `semaforoPago=moroso` no filtra por estado de activación, solo
    // excluye archivados (default `incluirArchivados=false`).
    expect(filtrarDirectorioDemo(roster, { estado: 'mora' }).map((a) => a.id)).toEqual([
      'al-001',
      'al-003',
    ]);
    expect(filtrarDirectorioDemo(roster, { estado: 'archivados' }).map((a) => a.id)).toEqual([
      'al-004',
    ]);
  });

  it('modalidad filtra presencial/remoto', () => {
    expect(filtrarDirectorioDemo(roster, { modalidad: 'presencial' }).map((a) => a.id)).toEqual([
      'al-001',
      'al-003',
    ]);
    expect(filtrarDirectorioDemo(roster, { modalidad: 'remoto' }).map((a) => a.id)).toEqual([
      'al-002',
      'al-004',
    ]);
  });

  it('q busca por nombre/apellido/correo/documento sin distinguir mayúsculas ni acentos', () => {
    expect(filtrarDirectorioDemo(roster, { q: 'PEREZ' }).map((a) => a.id)).toEqual(['al-002']);
    expect(filtrarDirectorioDemo(roster, { q: ' 2412 ' }).map((a) => a.id)).toEqual(['al-001']);
    expect(filtrarDirectorioDemo(roster, { q: 'email.com' }).map((a) => a.id)).toEqual([
      'al-001',
      'al-002',
    ]);
    // `%` es literal (sin comodines), igual que el ILIKE escapado del directorio.
    expect(filtrarDirectorioDemo(roster, { q: '%' })).toEqual([]);
  });

  it('combina búsqueda + estado + modalidad', () => {
    expect(
      filtrarDirectorioDemo(roster, { q: 'roberto', estado: 'pausado', modalidad: 'presencial' }).map(
        (a) => a.id
      )
    ).toEqual(['al-003']);
    expect(
      filtrarDirectorioDemo(roster, { q: 'roberto', estado: 'activo', modalidad: 'presencial' })
    ).toEqual([]);
  });
});

describe('ROSTER_DEMO_DIRECTORIO (WU26: roster demo de más de una página)', () => {
  it('supera el tamaño de página (10) y no repite ids', () => {
    expect(ROSTER_DEMO_DIRECTORIO.length).toBeGreaterThan(10);
    expect(new Set(ROSTER_DEMO_DIRECTORIO.map((a) => a.id)).size).toBe(
      ROSTER_DEMO_DIRECTORIO.length
    );
  });

  it('conserva variedad: estados, modalidades, archivados y semáforos de pago', () => {
    const estados = new Set(ROSTER_DEMO_DIRECTORIO.map((a) => a.estadoActivacion));
    expect(estados.has(EstadoAlumno.ACTIVO)).toBe(true);
    expect(estados.has(EstadoAlumno.INACTIVO_PAUSADO)).toBe(true);

    const modalidades = new Set(ROSTER_DEMO_DIRECTORIO.map((a) => a.modalidad));
    expect(modalidades.has(Modalidad.PRESENCIAL)).toBe(true);
    expect(modalidades.has(Modalidad.REMOTO)).toBe(true);

    expect(ROSTER_DEMO_DIRECTORIO.some((a) => Boolean(a.deletedAtUtc))).toBe(true);
    expect(new Set(ROSTER_DEMO_DIRECTORIO.map((a) => a.semaforoPago))).toEqual(
      new Set(['al_dia', 'por_vencer', 'moroso', 'sin_cuota'])
    );
  });

  it('el resumen del roster cuadra con sus perfiles (cartera completa)', () => {
    const resumen = calcularResumenDirectorio(ROSTER_DEMO_DIRECTORIO);
    expect(resumen.total).toBe(ROSTER_DEMO_DIRECTORIO.length);
    expect(resumen.archivados).toBe(1);
    expect(resumen.activos + resumen.pausados + resumen.archivados).toBe(resumen.total);
    expect(resumen.presenciales + resumen.remotos).toBe(resumen.total - resumen.archivados);
  });
});
