/**
 * Pure-logic spec for `lib/matriz-preferencias-notificacion-clon`.
 *
 * Runs in Node (no jsdom): the clone helper touches no DOM and performs no I/O.
 */
import { describe, expect, it } from 'vitest';
import { Rol } from '@guachafit/shared';
import { buildDemoPreferenciasNotificacion } from './demo-notificaciones';
import { clonarMatriz } from './matriz-preferencias-notificacion-clon';

describe('clonarMatriz', () => {
  it('copies every row with equal content', () => {
    const original = buildDemoPreferenciasNotificacion(Rol.ALUMNO).matriz;
    const copia = clonarMatriz(original);
    expect(copia).toEqual(original);
    expect(copia.length).toBe(original.length);
  });

  it('shares no row or canalesObligatorios references with the source', () => {
    const original = buildDemoPreferenciasNotificacion(Rol.ALUMNO).matriz;
    const copia = clonarMatriz(original);
    for (const [indice, fila] of copia.entries()) {
      expect(fila).not.toBe(original[indice]);
      expect(fila.canalesObligatorios).not.toBe(original[indice]?.canalesObligatorios);
    }
  });

  it('mutating the clone leaves the source untouched', () => {
    const original = buildDemoPreferenciasNotificacion(Rol.ALUMNO).matriz;
    const pushOriginal = original[0]?.push;
    const copia = clonarMatriz(original);
    if (copia[0]) copia[0].push = !copia[0].push;
    copia[0]?.canalesObligatorios.push('push');
    expect(original[0]?.push).toBe(pushOriginal);
    expect(original[0]?.canalesObligatorios).not.toContain('push');
  });

  it('clones an empty matrix to an empty matrix', () => {
    expect(clonarMatriz([])).toEqual([]);
  });
});
