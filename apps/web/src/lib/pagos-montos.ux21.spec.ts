/**
 * Specs de comportamiento UX-21: validación y normalización de montos (ALU-01, D8).
 * Contrato C1: exportación de constantes y funciones puras en `lib/pagos-montos.ts`.
 */
import { describe, expect, it } from 'vitest';
import * as pagosMontos from './pagos-montos';

const {
  MENSAJE_MONTO_PAGO_INVALIDO,
  validarMontoPago,
  normalizarMontoPago,
} = pagosMontos as {
  MENSAJE_MONTO_PAGO_INVALIDO?: string;
  validarMontoPago?: (valor: string) => string | null;
  normalizarMontoPago?: (valor: string) => string;
};

describe('pagos-montos · C1: validación y normalización de montos (ALU-01, D8)', () => {
  it('C1 · exporta el mensaje exacto MENSAJE_MONTO_PAGO_INVALIDO', () => {
    expect(MENSAJE_MONTO_PAGO_INVALIDO).toBe('Ingresa un monto válido mayor a 0.');
  });

  it('C1 · validarMontoPago acepta montos válidos mayores a 0 con punto decimal (hasta 2 decimales)', () => {
    expect(validarMontoPago!('10')).toBeNull();
    expect(validarMontoPago!('10.5')).toBeNull();
    expect(validarMontoPago!('10.50')).toBeNull();
    expect(validarMontoPago!('0.01')).toBeNull();
  });

  it('C1 · validarMontoPago acepta montos válidos mayores a 0 con coma decimal (hasta 2 decimales)', () => {
    expect(validarMontoPago!('10,5')).toBeNull();
    expect(validarMontoPago!('10,50')).toBeNull();
    expect(validarMontoPago!('0,01')).toBeNull();
  });

  it('C1 · validarMontoPago rechaza cadena vacía o espacios en blanco con el mensaje aprobado', () => {
    expect(validarMontoPago!('')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('   ')).toBe('Ingresa un monto válido mayor a 0.');
  });

  it('C1 · validarMontoPago rechaza monto <= 0 con el mensaje aprobado', () => {
    expect(validarMontoPago!('0')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('0.00')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('0,00')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('-5')).toBe('Ingresa un monto válido mayor a 0.');
  });

  it('C1 · validarMontoPago rechaza formatos con más de 2 decimales o texto con el mensaje aprobado', () => {
    expect(validarMontoPago!('10.999')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('10,999')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('abc')).toBe('Ingresa un monto válido mayor a 0.');
    expect(validarMontoPago!('10.5.2')).toBe('Ingresa un monto válido mayor a 0.');
  });

  it('C1 · normalizarMontoPago convierte coma a punto y formatea con 2 decimales', () => {
    expect(normalizarMontoPago!('25,5')).toBe('25.50');
    expect(normalizarMontoPago!('10')).toBe('10.00');
    expect(normalizarMontoPago!('35.5')).toBe('35.50');
    expect(normalizarMontoPago!('35,25')).toBe('35.25');
  });

  it('V1 · validarMontoPago rechaza montos con más de 12 dígitos enteros y acepta 999999999999.99', () => {
    expect(validarMontoPago!('1000000000000.00')).toBe(MENSAJE_MONTO_PAGO_INVALIDO);
    expect(validarMontoPago!('1000000000000000000000')).toBe(MENSAJE_MONTO_PAGO_INVALIDO);
    expect(validarMontoPago!('999999999999.99')).toBeNull();
  });
});
