/**
 * Reglas puras de paginación de la bandeja de conciliación.
 */
import { describe, expect, it } from 'vitest';
import { parsearPaginacionBandeja } from './paginacion-bandeja-reglas';

describe('paginación de la bandeja de conciliación', () => {
  it('sin query pide 25 desde 0', () => {
    expect(parsearPaginacionBandeja(undefined, undefined)).toEqual({ limite: 25, desplazamiento: 0 });
  });

  it('acota el límite al techo de 100 y el desplazamiento negativo a 0', () => {
    expect(parsearPaginacionBandeja('500', '-3')).toEqual({ limite: 100, desplazamiento: 0 });
  });

  it('un límite no numérico conserva el valor por defecto', () => {
    expect(parsearPaginacionBandeja('no-numero', undefined)).toEqual({ limite: 25, desplazamiento: 0 });
  });

  it('respeta valores intermedios válidos', () => {
    expect(parsearPaginacionBandeja('10', '20')).toEqual({ limite: 10, desplazamiento: 20 });
  });
});
