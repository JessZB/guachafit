/**
 * RF-006 RN-05 (lote web, prompt 01): contrato A del módulo puro `saldo-a-favor`.
 *
 * Fija el contrato de los cuatro helpers que la web usa para mostrar el saldo a favor y avisar
 * del excedente: montos comparados en centavos, aviso previo solo con el saldo de la cuota,
 * mensaje de éxito con el excedente del API y texto del saldo con la tasa opcional.
 */
import { describe, expect, it } from 'vitest';
import {
  avisoExcedenteAprobacion,
  mensajeConExcedente,
  textoSaldoAFavor,
  tieneSaldoAFavor,
} from './saldo-a-favor';

describe('saldo-a-favor · contrato A (helpers puros)', () => {
  describe('contrato 1 · tieneSaldoAFavor', () => {
    it('solo es true con un monto mayor que 0', () => {
      expect(tieneSaldoAFavor('10.00')).toBe(true);
      expect(tieneSaldoAFavor('0.01')).toBe(true);
      expect(tieneSaldoAFavor('0.00')).toBe(false);
      expect(tieneSaldoAFavor(null)).toBe(false);
      expect(tieneSaldoAFavor(undefined)).toBe(false);
    });
  });

  describe('contrato 2 · avisoExcedenteAprobacion', () => {
    it('sin saldoPendienteCuotaUsd (null o undefined) no hay aviso', () => {
      expect(avisoExcedenteAprobacion('50.00', null)).toBeNull();
      expect(avisoExcedenteAprobacion('50.00', undefined)).toBeNull();
    });

    it('si el monto no excede el saldo de la cuota no hay aviso', () => {
      expect(avisoExcedenteAprobacion('40.00', '40.00')).toBeNull();
      expect(avisoExcedenteAprobacion('30.00', '40.00')).toBeNull();
    });

    it('con excedente avisa el monto exacto en centavos que quedará a favor', () => {
      expect(avisoExcedenteAprobacion('50.00', '40.00')).toBe(
        'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.'
      );
      expect(avisoExcedenteAprobacion('30.00', '0.00')).toBe(
        'Este pago excede la deuda de la cuota en 30.00 USD; quedarán como saldo a favor del alumno.'
      );
    });
  });

  describe('contrato 3 · mensajeConExcedente', () => {
    it('sin excedente devuelve el mensaje base intacto', () => {
      const base = 'Pago aprobado y descontado de la cuota.';
      expect(mensajeConExcedente(base, null)).toBe(base);
      expect(mensajeConExcedente(base, undefined)).toBe(base);
      expect(mensajeConExcedente(base, '0.00')).toBe(base);
    });

    it('con excedente agrega la parte que quedó como saldo a favor', () => {
      expect(mensajeConExcedente('Pago aprobado y descontado de la cuota.', '10.00')).toBe(
        'Pago aprobado y descontado de la cuota. 10.00 USD quedaron como saldo a favor del alumno.'
      );
    });
  });

  describe('contrato 4 · textoSaldoAFavor', () => {
    it('sin tasa muestra solo el saldo en USD', () => {
      expect(textoSaldoAFavor('10.00')).toBe('Saldo a favor: 10.00 USD');
      expect(textoSaldoAFavor('10.00', null)).toBe('Saldo a favor: 10.00 USD');
      expect(textoSaldoAFavor('10.00', undefined)).toBe('Saldo a favor: 10.00 USD');
    });

    it('con tasa agrega la proyección a Bs. con 2 decimales', () => {
      expect(textoSaldoAFavor('10.00', '65.0000')).toBe(
        'Saldo a favor: 10.00 USD (≈ Bs. 650.00)'
      );
      expect(textoSaldoAFavor('12.34', '65.0000')).toBe(
        'Saldo a favor: 12.34 USD (≈ Bs. 802.10)'
      );
    });
  });
});
