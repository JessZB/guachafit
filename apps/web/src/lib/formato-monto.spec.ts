/**
 * 01 · UX-03 · Spec de `lib/formato-monto.ts` (contrato A)
 *
 * Requisito: formato venezolano por defecto (`$1.900,00` y `Bs. 36.500,00`),
 * configurable a punto decimal (`$1,900.00`), determinista y sin espacios de no separación.
 */
import { describe, expect, it } from 'vitest';
import {
  formatDecimal,
  formatMonto,
  FORMATO_NUMERO_POR_DEFECTO,
  type FormatoNumero,
  type MonedaMonto,
} from './formato-monto';

describe('formato-monto · Contrato A', () => {
  it('FORMATO_NUMERO_POR_DEFECTO es coma-decimal', () => {
    expect(FORMATO_NUMERO_POR_DEFECTO).toBe('coma-decimal');
  });

  describe('formatMonto · casos estándar y opciones', () => {
    it.each([
      ['1900.00', 'USD', undefined, '$1.900,00'],
      ['40', 'USD', undefined, '$40,00'],
      ['40.5', 'USD', undefined, '$40,50'],
      [0, 'USD', undefined, '$0,00'],
      ['999.99', 'USD', undefined, '$999,99'],
      ['1000', 'USD', undefined, '$1.000,00'],
      ['1234567.891', 'USD', undefined, '$1.234.567,89'],
      ['36500', 'VES', undefined, 'Bs. 36.500,00'],
      ['-5', 'USD', undefined, '-$5,00'],
      ['-5', 'VES', undefined, '-Bs. 5,00'],
      ['1900', 'USD', { conCodigo: true }, '$1.900,00 USD'],
      ['36500', 'VES', { conCodigo: true }, 'Bs. 36.500,00'],
      ['1900', 'USD', { formato: 'punto-decimal' as FormatoNumero }, '$1,900.00'],
      ['36500', 'VES', { formato: 'punto-decimal' as FormatoNumero }, 'Bs. 36,500.00'],
    ] as const)(
      'formatMonto(%s, %s, %o) -> %s',
      (valor, moneda, opciones, esperado) => {
        expect(formatMonto(valor, moneda as MonedaMonto, opciones)).toBe(esperado);
      }
    );
  });

  describe('formatMonto · valores inválidos o nulos devuelven guion largo (—)', () => {
    it.each([
      [null, 'USD'],
      [undefined, 'USD'],
      ['', 'USD'],
      ['abc', 'USD'],
      ['40,5', 'USD'],
      [Number.NaN, 'USD'],
      [Number.POSITIVE_INFINITY, 'USD'],
      [Number.NEGATIVE_INFINITY, 'USD'],
    ] as const)('formatMonto(%s, %s) -> —', (valor, moneda) => {
      expect(formatMonto(valor, moneda as MonedaMonto)).toBe('—');
    });
  });

  describe('formatDecimal', () => {
    it('formatDecimal("36.5") -> "36,50"', () => {
      expect(formatDecimal('36.5')).toBe('36,50');
    });

    it('formatDecimal("36.5", { decimales: 4 }) -> "36,5000"', () => {
      expect(formatDecimal('36.5', { decimales: 4 })).toBe('36,5000');
    });

    it('formatDecimal("1234.5", { decimales: 1, formato: "punto-decimal" }) -> "1,234.5"', () => {
      expect(
        formatDecimal('1234.5', { decimales: 1, formato: 'punto-decimal' })
      ).toBe('1,234.5');
    });

    it('formatDecimal(null) -> —', () => {
      expect(formatDecimal(null)).toBe('—');
    });
  });

  describe('determinismo y limpieza de caracteres', () => {
    it('determinismo: 1900 USD separa miles desde 1000 sin depender de locale del host', () => {
      expect(formatMonto('1900', 'USD')).toBe('$1.900,00');
    });

    it('sin espacios raros: no contiene espacios de no separación (\\u00a0, \\u202f)', () => {
      const montos = [
        formatMonto('36500', 'VES'),
        formatMonto('1900', 'USD', { conCodigo: true }),
        formatMonto('-5', 'VES'),
      ];
      for (const monto of montos) {
        expect(monto).not.toMatch(/[\u00a0\u202f]/);
      }
    });
  });
});
