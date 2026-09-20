import { describe, it, expect } from 'vitest';
import { NivelObjetivoPlantilla, type PlantillaRutinaResumenDTO } from '@guachafit/shared';
import {
  coincideFiltroEstadoPlantilla,
  contarPlantillasPorEstado,
  filtrarPlantillas,
  hayFiltroPlantillasActivo,
} from './plantillas-filtros';

function plantilla(parcial: {
  nombre: string;
  activa?: boolean;
  nivelObjetivo?: NivelObjetivoPlantilla;
}): PlantillaRutinaResumenDTO {
  return {
    id: parcial.nombre,
    entrenadorId: 'coach-1',
    nombre: parcial.nombre,
    nivelObjetivo: parcial.nivelObjetivo ?? NivelObjetivoPlantilla.PRINCIPIANTE,
    totalDias: 3,
    totalEjercicios: 12,
    activa: parcial.activa ?? true,
    createdAtUtc: '2026-09-01T00:00:00.000Z',
    updatedAtUtc: '2026-09-02T00:00:00.000Z',
  };
}

const LISTA = [
  plantilla({
    nombre: 'Pierna Énfasis Isquios',
    nivelObjetivo: NivelObjetivoPlantilla.AVANZADO,
    activa: true,
  }),
  plantilla({
    nombre: 'Full Body Principiante',
    nivelObjetivo: NivelObjetivoPlantilla.PRINCIPIANTE,
    activa: true,
  }),
  plantilla({
    nombre: 'Torso Intermedio',
    nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
    activa: false,
  }),
];

describe('coincideFiltroEstadoPlantilla (WU20)', () => {
  it('cada estado agrupa por activa/inactiva y "todas" acepta todo', () => {
    expect(coincideFiltroEstadoPlantilla({ activa: true }, 'activas')).toBe(true);
    expect(coincideFiltroEstadoPlantilla({ activa: true }, 'desactivadas')).toBe(false);
    expect(coincideFiltroEstadoPlantilla({ activa: false }, 'desactivadas')).toBe(true);
    expect(coincideFiltroEstadoPlantilla({ activa: false }, 'activas')).toBe(false);
    expect(coincideFiltroEstadoPlantilla({ activa: false }, 'todas')).toBe(true);
  });
});

describe('contarPlantillasPorEstado (WU20: paridad con los chips)', () => {
  it('cuenta activas, desactivadas y el total', () => {
    expect(contarPlantillasPorEstado(LISTA)).toEqual({ activas: 2, desactivadas: 1, todas: 3 });
  });

  it('un banco vacío da contadores en cero', () => {
    expect(contarPlantillasPorEstado([])).toEqual({ activas: 0, desactivadas: 0, todas: 0 });
  });
});

describe('filtrarPlantillas (WU20: estado + búsqueda + nivel)', () => {
  it('sin opciones aplica el estado por defecto "activas"', () => {
    expect(filtrarPlantillas(LISTA).map((p) => p.nombre)).toEqual([
      'Pierna Énfasis Isquios',
      'Full Body Principiante',
    ]);
  });

  it('busca por nombre sin distinguir mayúsculas ni acentos', () => {
    expect(
      filtrarPlantillas(LISTA, { estado: 'todas', busqueda: 'ENFASIS' }).map((p) => p.nombre)
    ).toEqual(['Pierna Énfasis Isquios']);
    expect(
      filtrarPlantillas(LISTA, { estado: 'todas', busqueda: 'isquios' }).map((p) => p.nombre)
    ).toEqual(['Pierna Énfasis Isquios']);
  });

  it('combina búsqueda, nivel y estado', () => {
    expect(
      filtrarPlantillas(LISTA, {
        estado: 'todas',
        busqueda: 'o',
        nivel: NivelObjetivoPlantilla.INTERMEDIO,
      }).map((p) => p.nombre)
    ).toEqual(['Torso Intermedio']);
    expect(
      filtrarPlantillas(LISTA, { estado: 'activas', nivel: NivelObjetivoPlantilla.AVANZADO }).map(
        (p) => p.nombre
      )
    ).toEqual(['Pierna Énfasis Isquios']);
    expect(
      filtrarPlantillas(LISTA, { estado: 'activas', nivel: NivelObjetivoPlantilla.INTERMEDIO })
    ).toEqual([]);
  });

  it('preserva el orden recibido y no muta la lista original', () => {
    const resultado = filtrarPlantillas(LISTA, { estado: 'activas', busqueda: 'o' });
    expect(resultado.map((p) => p.nombre)).toEqual([
      'Pierna Énfasis Isquios',
      'Full Body Principiante',
    ]);
    expect(LISTA.map((p) => p.nombre)).toEqual([
      'Pierna Énfasis Isquios',
      'Full Body Principiante',
      'Torso Intermedio',
    ]);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filtrarPlantillas(LISTA, { estado: 'todas', busqueda: 'zzz' })).toEqual([]);
  });
});

describe('hayFiltroPlantillasActivo (WU20)', () => {
  it('solo es true con búsqueda con contenido o nivel distinto de todos', () => {
    expect(hayFiltroPlantillasActivo()).toBe(false);
    expect(hayFiltroPlantillasActivo({ busqueda: '   ', nivel: 'todos' })).toBe(false);
    expect(hayFiltroPlantillasActivo({ busqueda: 'pierna' })).toBe(true);
    expect(hayFiltroPlantillasActivo({ nivel: NivelObjetivoPlantilla.AVANZADO })).toBe(true);
  });
});
