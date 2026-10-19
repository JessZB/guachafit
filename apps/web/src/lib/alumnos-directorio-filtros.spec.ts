/**
 * Mis alumnos (dueño 2026-10-19) · spec RED de la lógica pura de
 * `lib/alumnos-directorio-filtros.ts`.
 *
 * Nuevo comportamiento (implementado en producción):
 * - C1: `FiltroEstadoDirectorio` = 'vigentes'|'activo'|'pausado'|'mora'|'archivados';
 *   'todos' desaparece.
 * - C2: `ParametrosDirectorioAlumnos` incluye `orden: OrdenDirectorioAlumnos`.
 * - C3: `construirParametrosDirectorioAlumnos` siempre envía `orden`; con
 *   estado 'vigentes' NO envía `incluirArchivados` ni `soloArchivados`; los demás
 *   estados mantienen su mapeo actual.
 * - C4: `hayFiltrosDirectorioActivos(search, estado, modalidad)` es falso solo con
 *   búsqueda vacía + 'vigentes' + 'todas'.
 */
import { describe, expect, it } from 'vitest';
import { EstadoAlumno, Modalidad } from '@guachafit/shared';
import {
  construirParametrosDirectorioAlumnos,
  hayFiltrosDirectorioActivos,
  TAMANO_PAGINA_POR_DEFECTO,
  type ParametrosDirectorioAlumnos,
} from './alumnos-directorio-filtros';
import type { FiltroEstadoDirectorio } from './directorio-alumnos';

/** `'vigentes'` aún no existe en el union: el cast mantiene el spec compilable en rojo. */
function estado(valor: string): FiltroEstadoDirectorio {
  return valor as unknown as FiltroEstadoDirectorio;
}

/** Entrada con la forma nueva: `orden` aún no existe en `ParametrosDirectorioAlumnos`. */
type EntradaDirectorio = ParametrosDirectorioAlumnos & { orden?: string };

function base(parcial: Partial<EntradaDirectorio> = {}) {
  const { orden = 'alta_reciente', ...resto } = parcial;
  return construirParametrosDirectorioAlumnos({
    tamano: 25,
    pagina: 1,
    q: '',
    estado: estado('vigentes'),
    modalidad: 'todas',
    ...resto,
    orden,
  } as unknown as ParametrosDirectorioAlumnos);
}

describe('alumnos-directorio-filtros · C1 estado: vigentes por defecto, todos desaparece', () => {
  it(`admite 'vigentes'|'activo'|'pausado'|'mora'|'archivados' y 'vigentes' es el neutro`, () => {
    const estados: FiltroEstadoDirectorio[] = [
      estado('vigentes'),
      'activo',
      'pausado',
      'mora',
      'archivados',
    ];
    expect(estados).toContain('vigentes');
    expect(hayFiltrosDirectorioActivos('', estado('vigentes'), 'todas')).toBe(false);
  });

  it(`'vigentes' no pide la cartera completa con archivados (reemplaza a 'todos')`, () => {
    const p = base({ estado: estado('vigentes') });
    expect(p.get('incluirArchivados')).toBeNull();
    expect(p.get('soloArchivados')).toBeNull();
  });
});

describe('alumnos-directorio-filtros · C2+C3 orden siempre viaja; vigentes sin archivados', () => {
  it('ParametrosDirectorioAlumnos incluye orden: siempre viaja (por defecto alta_reciente)', () => {
    expect(base().get('orden')).toBe('alta_reciente');
  });

  it('el orden elegido viaja tal cual', () => {
    expect(base({ orden: 'nombre' }).get('orden')).toBe('nombre');
    expect(base({ orden: 'sin_entrenar' }).get('orden')).toBe('sin_entrenar');
    expect(base({ orden: 'mayor_racha' }).get('orden')).toBe('mayor_racha');
  });

  it(`con estado 'vigentes' NO envía incluirArchivados ni soloArchivados`, () => {
    const p = base({ estado: estado('vigentes'), orden: 'alta_reciente' });
    expect(p.get('incluirArchivados')).toBeNull();
    expect(p.get('soloArchivados')).toBeNull();
    expect(p.get('orden')).toBe('alta_reciente');
  });

  it('los demás estados mantienen su mapeo actual y además envían orden', () => {
    const archivados = base({ estado: 'archivados', orden: 'mayor_racha' });
    expect(archivados.get('soloArchivados')).toBe('true');
    expect(archivados.get('incluirArchivados')).toBeNull();
    expect(archivados.get('orden')).toBe('mayor_racha');

    expect(base({ estado: 'activo' }).get('estado')).toBe(EstadoAlumno.ACTIVO);
    expect(base({ estado: 'pausado' }).get('estado')).toBe(EstadoAlumno.INACTIVO_PAUSADO);

    const mora = base({ estado: 'mora' });
    expect(mora.get('semaforoPago')).toBe('moroso');
    expect(mora.get('estado')).toBeNull();
  });
});

describe('alumnos-directorio-filtros · C4 hayFiltrosDirectorioActivos con vigentes', () => {
  it(`devuelve false solo con búsqueda vacía + 'vigentes' + 'todas'`, () => {
    expect(hayFiltrosDirectorioActivos('', estado('vigentes'), 'todas')).toBe(false);
    expect(hayFiltrosDirectorioActivos('  x ', estado('vigentes'), 'todas')).toBe(true);
    expect(hayFiltrosDirectorioActivos('', 'activo', 'todas')).toBe(true);
    expect(hayFiltrosDirectorioActivos('', estado('vigentes'), 'remoto')).toBe(true);
    expect(hayFiltrosDirectorioActivos('', 'archivados', 'todas')).toBe(true);
  });

  it(`'vigentes' es el estado neutro (reemplaza a 'todos')`, () => {
    expect(hayFiltrosDirectorioActivos('', estado('vigentes'), 'todas')).toBe(false);
  });
});

describe('alumnos-directorio-filtros · resto preservado', () => {
  it('calcula limit/offset desde tamano y pagina', () => {
    const p = base({ tamano: 25, pagina: 2 });
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('25');
  });

  it('el tamaño por defecto es 25', () => {
    expect(TAMANO_PAGINA_POR_DEFECTO).toBe(25);
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
