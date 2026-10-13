import { describe, it, expect } from 'vitest';
import {
  elegirTasaAplicada,
  proyectarSaldoCon,
} from './proyectar-saldo-reglas';

const proyectarVES = (saldo: string, tasa: string) =>
  (Number(saldo) * Number(tasa)).toFixed(2);

describe('elegirTasaAplicada', () => {
  it('prefiere el override del alumno cuando es utilizable', () => {
    expect(elegirTasaAplicada('40.00', '36.50')).toBe('40.00');
  });

  it('cae a la tasa base cuando el override es nulo', () => {
    expect(elegirTasaAplicada(null, '36.50')).toBe('36.50');
  });

  it('ignora overrides en cero o negativos', () => {
    expect(elegirTasaAplicada('0', '36.50')).toBe('36.50');
    expect(elegirTasaAplicada('-5', '36.50')).toBe('36.50');
  });

  it('devuelve null honesto sin ninguna tasa utilizable', () => {
    expect(elegirTasaAplicada(null, null)).toBeNull();
    expect(elegirTasaAplicada(null, '0')).toBeNull();
    expect(elegirTasaAplicada('no-num', null)).toBeNull();
  });
});

describe('proyectarSaldoCon', () => {
  it('proyecta con el override del alumno', () => {
    expect(proyectarSaldoCon(proyectarVES, '100.00', '40.00', '36.50')).toEqual({
      tasaAplicada: '40.00',
      saldoPendienteBs: '4000.00',
    });
  });

  it('proyecta con la tasa base sin override', () => {
    expect(proyectarSaldoCon(proyectarVES, '100.00', null, '36.50')).toEqual({
      tasaAplicada: '36.50',
      saldoPendienteBs: '3650.00',
    });
  });

  it('devuelve nulls honestos sin tasa', () => {
    expect(proyectarSaldoCon(proyectarVES, '100.00', null, null)).toEqual({
      tasaAplicada: null,
      saldoPendienteBs: null,
    });
  });
});
