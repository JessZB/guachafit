/**
 * Reglas puras de paginación del historial del alumno.
 */
import { describe, expect, it } from 'vitest';
import { parsearPaginacionHistorial } from './paginacion-historial-reglas';

describe('paginación del historial del alumno', () => {
  it('sin query pide todas las transacciones con desplazamiento 0', () => {
    expect(parsearPaginacionHistorial(undefined, undefined)).toEqual({
      limiteTx: undefined,
      desplazamientoTx: 0,
    });
  });

  it('acota el límite al máximo y normaliza el desplazamiento negativo', () => {
    expect(parsearPaginacionHistorial('9999', '-5')).toEqual({ limiteTx: 100, desplazamientoTx: 0 });
  });

  it('un límite no numérico conserva el contrato de todas', () => {
    expect(parsearPaginacionHistorial('no-numero', undefined).limiteTx).toBeUndefined();
  });

  it('respeta valores intermedios válidos', () => {
    expect(parsearPaginacionHistorial('10', '20')).toEqual({ limiteTx: 10, desplazamientoTx: 20 });
  });
});
