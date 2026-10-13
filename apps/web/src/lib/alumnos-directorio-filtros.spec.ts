/**
 * Módulo `alumnos` (fase B, prompt 53) · spec de la lógica pura extraída a
 * `lib/alumnos-directorio-filtros.ts` (caracteriza la semántica vigente de
 * `AlumnosPage.tsx:215-227, 389-390`; R5: la producción no se edita para el spec).
 */
import { describe, expect, it } from 'vitest';
import { EstadoAlumno, Modalidad } from '@guachafit/shared';
import {
  construirParametrosDirectorioAlumnos,
  hayFiltrosDirectorioActivos,
  TAMANO_PAGINA_POR_DEFECTO,
  type ParametrosDirectorioAlumnos,
} from './alumnos-directorio-filtros';

function base(parcial: Partial<ParametrosDirectorioAlumnos> = {}) {
  return construirParametrosDirectorioAlumnos({
    tamano: 25,
    pagina: 1,
    q: '',
    estado: 'todos',
    modalidad: 'todas',
    ...parcial,
  });
}

describe('alumnos-directorio-filtros · construirParametrosDirectorioAlumnos', () => {
  it('calcula limit/offset desde tamano y pagina', () => {
    const p = base({ tamano: 25, pagina: 2 });
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('25');
  });

  it('"todos" pide la cartera completa con archivados incluidos', () => {
    const p = base({ estado: 'todos' });
    expect(p.get('incluirArchivados')).toBe('true');
    expect(p.get('soloArchivados')).toBeNull();
    expect(p.get('estado')).toBeNull();
  });

  it('"activo" viaja como estado=activo', () => {
    const p = base({ estado: 'activo' });
    expect(p.get('estado')).toBe(EstadoAlumno.ACTIVO);
    expect(p.get('incluirArchivados')).toBeNull();
  });

  it('"pausado" viaja como el estado de pausa del dominio', () => {
    const p = base({ estado: 'pausado' });
    expect(p.get('estado')).toBe(EstadoAlumno.INACTIVO_PAUSADO);
  });

  it('"mora" filtra por semáforo moroso, no por estado', () => {
    const p = base({ estado: 'mora' });
    expect(p.get('semaforoPago')).toBe('moroso');
    expect(p.get('estado')).toBeNull();
  });

  it('"archivados" viaja como soloArchivados', () => {
    const p = base({ estado: 'archivados' });
    expect(p.get('soloArchivados')).toBe('true');
    expect(p.get('incluirArchivados')).toBeNull();
  });

  it('la modalidad viaja con el valor del dominio y "todas" la omite', () => {
    expect(base({ modalidad: 'presencial' }).get('modalidad')).toBe(Modalidad.PRESENCIAL);
    expect(base({ modalidad: 'remoto' }).get('modalidad')).toBe(Modalidad.REMOTO);
    expect(base({ modalidad: 'todas' }).get('modalidad')).toBeNull();
  });

  it('la búsqueda viaja recortada como q y en blanco se omite', () => {
    expect(base({ q: '  valeria ' }).get('q')).toBe('valeria');
    expect(base({ q: '   ' }).get('q')).toBeNull();
  });
});

describe('alumnos-directorio-filtros · resto', () => {
  it('el tamaño por defecto es 25', () => {
    expect(TAMANO_PAGINA_POR_DEFECTO).toBe(25);
  });

  it('detecta búsqueda, estado y modalidad activos', () => {
    expect(hayFiltrosDirectorioActivos('', 'todos', 'todas')).toBe(false);
    expect(hayFiltrosDirectorioActivos('  x ', 'todos', 'todas')).toBe(true);
    expect(hayFiltrosDirectorioActivos('', 'activo', 'todas')).toBe(true);
    expect(hayFiltrosDirectorioActivos('', 'todos', 'remoto')).toBe(true);
  });
});
