/**
 * 01 · UX-08 · Función pura equivalenteUsdCobro (Contrato A).
 *
 * Requisitos:
 * - A1: ('50', USD, null) -> '50.00'
 * - A2: ('50.5', USD, '36.50') -> '50.50'
 * - A3: ('1825', VES, '36.50') -> '50.00'
 * - A4: ('100', VES, '36.50') -> '2.74'
 * - A5: ('1825', VES, null), ('1825', VES, '0'), ('1825', VES, 'abc') -> null (sin tasa no se inventa)
 * - A6: ('', USD, null), ('0', USD, null), ('-5', USD, null), ('abc', USD, null), ('1,5', USD, null) -> null
 */
import { describe, expect, it } from 'vitest';
import { Moneda } from '@guachafit/shared';
import { equivalenteUsdCobro, normalizarMontoCobro, resumenDeCobro } from './cobro-sala';
import { FORMATO_NUMERO_POR_DEFECTO, formatMonto } from './formato-monto';

describe('cobro-sala · equivalenteUsdCobro (Contrato A)', () => {
  it('A1 · monto entero en USD sin tasa devuelve formato decimal con dos ceros', () => {
    expect(equivalenteUsdCobro('50', Moneda.USD, null)).toBe('50.00');
  });

  it('A2 · monto con decimales en USD conserva los dos decimales sin importar la tasa', () => {
    expect(equivalenteUsdCobro('50.5', Moneda.USD, '36.50')).toBe('50.50');
  });

  it('A3 · monto en VES con tasa vigente válida convierte exactamente a USD con dos decimales', () => {
    expect(equivalenteUsdCobro('1825', Moneda.VES, '36.50')).toBe('50.00');
  });

  it('A4 · monto en VES con tasa que genera decimales redondea a 2 decimales', () => {
    expect(equivalenteUsdCobro('100', Moneda.VES, '36.50')).toBe('2.74');
  });

  it('A5 · monto en VES sin tasa, tasa cero o tasa no numérica devuelve null (no inventa)', () => {
    expect(equivalenteUsdCobro('1825', Moneda.VES, null)).toBeNull();
    expect(equivalenteUsdCobro('1825', Moneda.VES, undefined)).toBeNull();
    expect(equivalenteUsdCobro('1825', Moneda.VES, '0')).toBeNull();
    expect(equivalenteUsdCobro('1825', Moneda.VES, 'abc')).toBeNull();
  });

  it('A6 · montos no numéricos, vacíos, cero, negativos o con coma decimal devuelven null', () => {
    expect(equivalenteUsdCobro('', Moneda.USD, null)).toBeNull();
    expect(equivalenteUsdCobro('0', Moneda.USD, null)).toBeNull();
    expect(equivalenteUsdCobro('-5', Moneda.USD, null)).toBeNull();
    expect(equivalenteUsdCobro('abc', Moneda.USD, null)).toBeNull();
    expect(equivalenteUsdCobro('1,5', Moneda.USD, null)).toBeNull();
  });

  it('A7 · normalizarMontoCobro: quita espacios y cambia coma única por punto; con punto no se toca', () => {
    expect(normalizarMontoCobro(' 35,50 ')).toBe('35.50');
    expect(normalizarMontoCobro('35.50')).toBe('35.50');
    expect(normalizarMontoCobro('1.825')).toBe('1.825');
  });

  it('A8 · equivalenteUsdCobro con más de 2 decimales devuelve null', () => {
    expect(equivalenteUsdCobro('50.123', Moneda.USD, null)).toBeNull();
  });

  it('A9 · resumenDeCobro: genera resumen formateado con tasa o null si el monto no es válido', () => {
    const formateador = (
      valor: string | number | null | undefined,
      moneda: 'USD' | 'VES',
      opciones?: { conCodigo?: boolean }
    ) => formatMonto(valor, moneda, { formato: FORMATO_NUMERO_POR_DEFECTO, ...opciones });

    expect(resumenDeCobro('1825,00', Moneda.VES, '36.50', formateador)).toBe(
      'Se registrarán Bs. 1.825,00 (≈ $50,00 USD)'
    );
    expect(resumenDeCobro('50.123', Moneda.USD, null, formateador)).toBeNull();
  });
});
