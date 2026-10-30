/**
 * 01 · UX-10 · Contrato C1 · etiquetaMetodoPago en sentence case y formatos humanos.
 *
 * C1:
 * - pago_movil -> "Pago móvil"
 * - transferencia_bancaria -> "Transferencia bancaria"
 * - efectivo_usd -> "Efectivo en dólares"
 * - efectivo_ves -> "Efectivo en bolívares"
 * - zelle -> "Zelle"
 * - binance_usdt -> "Binance (USDT)"
 * - otro -> "Otro"
 * - null, undefined o '' -> "Sin dato"
 * - desconocido, p. ej. 'cripto_x' -> "Cripto x" (guiones bajos por espacios y primera en mayúscula)
 */
import { describe, expect, it } from 'vitest';
import { MetodoPago } from '@guachafit/shared';
import { etiquetaMetodoPago } from './conciliacion-filtros';

describe('Contrato C1 · etiquetaMetodoPago (UX-10)', () => {
  it('formatea cada método conocido según el contrato C1', () => {
    expect(etiquetaMetodoPago(MetodoPago.PAGO_MOVIL)).toBe('Pago móvil');
    expect(etiquetaMetodoPago(MetodoPago.TRANSFERENCIA_BANCARIA)).toBe('Transferencia bancaria');
    expect(etiquetaMetodoPago(MetodoPago.EFECTIVO_USD)).toBe('Efectivo en dólares');
    expect(etiquetaMetodoPago(MetodoPago.EFECTIVO_VES)).toBe('Efectivo en bolívares');
    expect(etiquetaMetodoPago(MetodoPago.ZELLE)).toBe('Zelle');
    expect(etiquetaMetodoPago(MetodoPago.BINANCE_USDT)).toBe('Binance (USDT)');
    expect(etiquetaMetodoPago(MetodoPago.OTRO)).toBe('Otro');
  });

  it('formatea valores ausentes o vacíos como "Sin dato"', () => {
    expect(etiquetaMetodoPago(null)).toBe('Sin dato');
    expect(etiquetaMetodoPago(undefined)).toBe('Sin dato');
    expect(etiquetaMetodoPago('')).toBe('Sin dato');
  });

  it('formatea valores desconocidos capitalizando la primera letra y reemplazando guiones bajos', () => {
    expect(etiquetaMetodoPago('cripto_x')).toBe('Cripto x');
  });
});
