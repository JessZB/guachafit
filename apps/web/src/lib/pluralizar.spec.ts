import { describe, expect, it } from 'vitest';
import { pluralizar } from './pluralizar';

describe('pluralizar', () => {
  it('usa singular solo con exactamente 1', () => {
    expect(pluralizar(1, 'pago', 'pagos')).toBe('1 pago');
    expect(pluralizar(1, 'ejercicio', 'ejercicios')).toBe('1 ejercicio');
    expect(pluralizar(1, 'día', 'días')).toBe('1 día');
  });

  it('usa plural con 0 (forma correcta en español)', () => {
    expect(pluralizar(0, 'registro', 'registros')).toBe('0 registros');
  });

  it('usa plural con más de 1', () => {
    expect(pluralizar(2, 'ejercicio', 'ejercicios')).toBe('2 ejercicios');
    expect(pluralizar(31, 'registro', 'registros')).toBe('31 registros');
  });

  it('usa plural con cantidades grandes', () => {
    expect(pluralizar(1000, 'día', 'días')).toBe('1000 días');
  });
});
