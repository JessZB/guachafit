import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { MetodoPago, Moneda } from '@guachafit/shared';
import * as pagosMontosModule from './pagos-montos';

const {
  monedaSugeridaPorMetodo,
  avisoMonedaMetodo,
  validarReferenciaPago,
  MENSAJE_REFERENCIA_PAGO_REQUERIDA,
  MENSAJE_REFERENCIA_PAGO_INVALIDA,
  TEXTO_RECHAZO_SIN_MOTIVO,
} = pagosMontosModule as unknown as {
  monedaSugeridaPorMetodo: (metodo: MetodoPago) => Moneda;
  avisoMonedaMetodo: (metodo: MetodoPago, moneda: Moneda) => string | null;
  validarReferenciaPago: (metodo: MetodoPago, referencia: string) => string | null;
  MENSAJE_REFERENCIA_PAGO_REQUERIDA: string;
  MENSAJE_REFERENCIA_PAGO_INVALIDA: string;
  TEXTO_RECHAZO_SIN_MOTIVO: string;
};

afterEach(() => {
  cleanup();
});

describe('lib/pagos-montos · D11 y validación de referencia', () => {
  it('P1: los 7 valores de MetodoPago devuelven la moneda sugerida correspondiente', () => {
    expect(monedaSugeridaPorMetodo(MetodoPago.PAGO_MOVIL)).toBe(Moneda.VES);
    expect(monedaSugeridaPorMetodo(MetodoPago.TRANSFERENCIA_BANCARIA)).toBe(Moneda.VES);
    expect(monedaSugeridaPorMetodo(MetodoPago.EFECTIVO_VES)).toBe(Moneda.VES);
    expect(monedaSugeridaPorMetodo(MetodoPago.ZELLE)).toBe(Moneda.USD);
    expect(monedaSugeridaPorMetodo(MetodoPago.BINANCE_USDT)).toBe(Moneda.USD);
    expect(monedaSugeridaPorMetodo(MetodoPago.EFECTIVO_USD)).toBe(Moneda.USD);
    expect(monedaSugeridaPorMetodo(MetodoPago.OTRO)).toBe(Moneda.VES);
  });

  it('P2: avisoMonedaMetodo devuelve null con método y moneda coherentes y texto no vacío si difieren', () => {
    expect(avisoMonedaMetodo(MetodoPago.ZELLE, Moneda.USD)).toBeNull();
    expect(avisoMonedaMetodo(MetodoPago.PAGO_MOVIL, Moneda.VES)).toBeNull();

    const avisoZelleVes = avisoMonedaMetodo(MetodoPago.ZELLE, Moneda.VES);
    expect(typeof avisoZelleVes).toBe('string');
    expect(avisoZelleVes!.trim().length).toBeGreaterThan(0);

    const avisoPmUsd = avisoMonedaMetodo(MetodoPago.PAGO_MOVIL, Moneda.USD);
    expect(typeof avisoPmUsd).toBe('string');
    expect(avisoPmUsd!.trim().length).toBeGreaterThan(0);
  });

  it('P3: validarReferenciaPago valida según método (requerida en no efectivo, longitud 4..64 en todos)', () => {
    expect(validarReferenciaPago(MetodoPago.ZELLE, '')).toBe(MENSAJE_REFERENCIA_PAGO_REQUERIDA);
    expect(validarReferenciaPago(MetodoPago.ZELLE, '   ')).toBe(MENSAJE_REFERENCIA_PAGO_REQUERIDA);
    expect(validarReferenciaPago(MetodoPago.ZELLE, 'abc')).toBe(MENSAJE_REFERENCIA_PAGO_INVALIDA);
    expect(validarReferenciaPago(MetodoPago.ZELLE, 'abcd')).toBeNull();
    expect(validarReferenciaPago(MetodoPago.ZELLE, 'a'.repeat(64))).toBeNull();
    expect(validarReferenciaPago(MetodoPago.ZELLE, 'a'.repeat(65))).toBe(MENSAJE_REFERENCIA_PAGO_INVALIDA);

    expect(validarReferenciaPago(MetodoPago.EFECTIVO_USD, '')).toBeNull();
    expect(validarReferenciaPago(MetodoPago.EFECTIVO_USD, 'ab')).toBe(MENSAJE_REFERENCIA_PAGO_INVALIDA);
  });

  it('P4: las 3 constantes son cadenas no vacías y distintas entre sí', () => {
    expect(typeof MENSAJE_REFERENCIA_PAGO_REQUERIDA).toBe('string');
    expect(MENSAJE_REFERENCIA_PAGO_REQUERIDA.trim().length).toBeGreaterThan(0);

    expect(typeof MENSAJE_REFERENCIA_PAGO_INVALIDA).toBe('string');
    expect(MENSAJE_REFERENCIA_PAGO_INVALIDA.trim().length).toBeGreaterThan(0);

    expect(typeof TEXTO_RECHAZO_SIN_MOTIVO).toBe('string');
    expect(TEXTO_RECHAZO_SIN_MOTIVO.trim().length).toBeGreaterThan(0);

    expect(MENSAJE_REFERENCIA_PAGO_REQUERIDA).not.toBe(MENSAJE_REFERENCIA_PAGO_INVALIDA);
    expect(MENSAJE_REFERENCIA_PAGO_REQUERIDA).not.toBe(TEXTO_RECHAZO_SIN_MOTIVO);
    expect(MENSAJE_REFERENCIA_PAGO_INVALIDA).not.toBe(TEXTO_RECHAZO_SIN_MOTIVO);
  });
});
