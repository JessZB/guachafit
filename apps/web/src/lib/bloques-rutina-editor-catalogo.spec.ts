/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · unitaria de la lógica pura
 * `lib/bloques-rutina-editor-catalogo.ts` (origen `BloquesRutinaEditor.tsx:96-107`).
 */
import { describe, expect, it } from 'vitest';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import { filtrarCatalogoEditor, hayFiltroEditor } from './bloques-rutina-editor-catalogo';

function ejercicio(nombre: string, grupoMuscular: string, id: string): EjercicioCatalogoDetalleDTO {
  return { id, nombre, grupoMuscular, activo: true, createdAtUtc: '2026-01-01T00:00:00Z' };
}

const CATALOGO = [
  ejercicio('Press Banca', 'Pecho', 'c-1'),
  ejercicio('Remo Barra', 'Espalda', 'c-2'),
  ejercicio('Press Militar', 'Hombros', 'c-3'),
];

describe('filtrarCatalogoEditor', () => {
  it('sin filtros devuelve todo el catálogo', () => {
    expect(filtrarCatalogoEditor(CATALOGO, 'Todos', '')).toHaveLength(3);
    expect(filtrarCatalogoEditor(CATALOGO, 'Todos', '   ')).toHaveLength(3);
  });

  it('filtra por grupo muscular conteniendo e insensible a mayúsculas', () => {
    expect(filtrarCatalogoEditor(CATALOGO, 'Espalda', '').map((e) => e.nombre)).toEqual([
      'Remo Barra',
    ]);
    expect(filtrarCatalogoEditor(CATALOGO, 'pecho', '').map((e) => e.nombre)).toEqual([
      'Press Banca',
    ]);
  });

  it('filtra por texto en el nombre conteniendo e insensible a mayúsculas', () => {
    expect(filtrarCatalogoEditor(CATALOGO, 'Todos', 'press').map((e) => e.nombre)).toEqual([
      'Press Banca',
      'Press Militar',
    ]);
  });

  it('exige ambas condiciones a la vez', () => {
    expect(filtrarCatalogoEditor(CATALOGO, 'Hombros', 'press').map((e) => e.nombre)).toEqual([
      'Press Militar',
    ]);
    expect(filtrarCatalogoEditor(CATALOGO, 'Pecho', 'remo')).toHaveLength(0);
  });
});

describe('hayFiltroEditor', () => {
  it('solo es falso con grupo Todos y texto vacío', () => {
    expect(hayFiltroEditor('Todos', '')).toBe(false);
    expect(hayFiltroEditor('Todos', '   ')).toBe(false);
    expect(hayFiltroEditor('Pecho', '')).toBe(true);
    expect(hayFiltroEditor('Todos', 'press')).toBe(true);
  });
});
