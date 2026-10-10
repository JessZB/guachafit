/**
 * M5-L1B (contrato B): payload del cobro en sala.
 *
 * Fase ROJA: `cobro-sala.ts` todavía no existe; el test define el contrato del constructor
 * (`construirPayloadCobroSala`): método efectivo derivado de la moneda, fecha de operación local
 * y notas solo cuando tienen texto, sin `referenciaBancaria` jamás.
 */
import { describe, expect, it } from 'vitest';
import { MetodoPago, Moneda } from '@guachafit/shared';
import { construirPayloadCobroSala } from './cobro-sala';

const HOY = '2026-10-09';

describe('cobro-sala · contrato B (M5-L1B)', () => {
  it('B1 · con moneda USD el método es efectivo_usd y la fecha es el día local', () => {
    const payload = construirPayloadCobroSala({
      monto: '40.00',
      moneda: Moneda.USD,
      hoyLocal: HOY,
    });
    expect(payload).toEqual({
      montoOriginal: '40.00',
      monedaOriginal: Moneda.USD,
      metodoPago: MetodoPago.EFECTIVO_USD,
      fechaOperacion: HOY,
    });
    expect(payload).not.toHaveProperty('notas');
    expect(payload).not.toHaveProperty('referenciaBancaria');
  });

  it('B2 · con moneda VES el método es efectivo_ves', () => {
    const payload = construirPayloadCobroSala({
      monto: '1500.00',
      moneda: Moneda.VES,
      hoyLocal: HOY,
    });
    expect(payload).toEqual({
      montoOriginal: '1500.00',
      monedaOriginal: Moneda.VES,
      metodoPago: MetodoPago.EFECTIVO_VES,
      fechaOperacion: HOY,
    });
    expect(payload).not.toHaveProperty('referenciaBancaria');
  });

  it('B3 · recorta el monto y las notas antes de construir el payload', () => {
    const payload = construirPayloadCobroSala({
      monto: ' 40.00 ',
      moneda: Moneda.USD,
      notas: '  pago completo del mes  ',
      hoyLocal: HOY,
    });
    expect(payload.montoOriginal).toBe('40.00');
    expect(payload.notas).toBe('pago completo del mes');
  });

  it('B4 · unas notas en blanco no viajan en el payload', () => {
    const conEspacios = construirPayloadCobroSala({
      monto: '40.00',
      moneda: Moneda.USD,
      notas: '   ',
      hoyLocal: HOY,
    });
    expect(conEspacios).not.toHaveProperty('notas');

    const sinNotas = construirPayloadCobroSala({
      monto: '40.00',
      moneda: Moneda.USD,
      hoyLocal: HOY,
    });
    expect(sinNotas).not.toHaveProperty('notas');
  });
});
