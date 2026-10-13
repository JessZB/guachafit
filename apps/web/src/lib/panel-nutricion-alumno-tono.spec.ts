/**
 * PanelNutricionAlumno · lógica pura del tono (Ola 2, sub-lote 1).
 *
 * Fija el mapa verbatim extraído del contenedor: cada tono conocido resuelve
 * sus clases y cualquier tono desconocido cae en `neutral` (nunca vacío).
 */
import { describe, expect, it } from 'vitest';
import { tonoDe } from './panel-nutricion-alumno-tono';

describe('tonoDe', () => {
  it('resuelve las clases de cada tono conocido', () => {
    expect(tonoDe('success')).toBe('bg-success/15 text-success border-success/30');
    expect(tonoDe('warning')).toBe('bg-warning/15 text-warning border-warning/30');
    expect(tonoDe('danger')).toBe('bg-destructive/15 text-destructive border-destructive/30');
    expect(tonoDe('info')).toBe('bg-info/15 text-info border-info/30');
    expect(tonoDe('neutral')).toBe('bg-secondary text-muted-foreground border-border');
  });

  it('un tono desconocido o vacío cae en neutral', () => {
    expect(tonoDe('inexistente')).toBe(tonoDe('neutral'));
    expect(tonoDe('')).toBe(tonoDe('neutral'));
  });
});
