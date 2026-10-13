import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EstadoCuota, MetodoPago } from '@guachafit/shared';
import {
  addDecimals,
  aplicarSaldoAFavorACuota,
  assertBalanceInvariant,
  divideDecimalsBankers,
  esFechaPagoFutura,
  esMetodoEfectivo,
  estadoCuotaTrasRetirarAbono,
  formatearFechaCorta,
  fromCents,
  mensajeCobroConExcedente,
  mensajePagoAprobado,
  multiplyDecimals,
  repartirAbono,
  roundHalfToEven,
  subtractDecimals,
  toCents,
  toIsoSafe,
  zonaDelAlumno,
} from './finanzas-reglas';

describe('finanzas-reglas (lógica pura RNF-002)', () => {
  it('toCents/fromCents son inversos', () => {
    expect(toCents('10.50')).toBe(1050);
    expect(toCents('0.00')).toBe(0);
    expect(toCents('-3.25')).toBe(-325);
    expect(fromCents(1050)).toBe('10.50');
    expect(fromCents(-325)).toBe('-3.25');
    expect(fromCents(toCents('77.77'))).toBe('77.77');
  });

  it('roundHalfToEven redondea el .5 al par', () => {
    expect(roundHalfToEven(2.5, 0)).toBe('2');
    expect(roundHalfToEven(3.5, 0)).toBe('4');
    expect(roundHalfToEven(2.675, 2)).toBe('2.68');
  });

  it('addDecimals/subtractDecimals operan en centavos', () => {
    expect(addDecimals('10.10', '0.20')).toBe('10.30');
    expect(subtractDecimals('10.10', '0.20')).toBe('9.90');
  });

  it('multiplyDecimals usa redondeo bancario', () => {
    expect(multiplyDecimals('10.00', '2')).toBe('20.00');
  });

  it('divideDecimalsBankers rechaza tasa <= 0', () => {
    expect(() => divideDecimalsBankers('100', '0')).toThrow(BadRequestException);
    expect(() => divideDecimalsBankers('100', '-1')).toThrow(BadRequestException);
    expect(divideDecimalsBankers('100', '2')).toBe('50.00');
  });

  it('toIsoSafe normaliza fechas', () => {
    const iso = '2026-10-01T12:00:00.000Z';
    expect(toIsoSafe(iso)).toBe(iso);
    expect(toIsoSafe(new Date(iso))).toBe(iso);
    expect(typeof toIsoSafe(null)).toBe('string');
  });

  it('assertBalanceInvariant acepta el invariante y rechaza la violación', () => {
    expect(() => assertBalanceInvariant('10.00', '4.00', '6.00')).not.toThrow();
    expect(() => assertBalanceInvariant('10.00', '4.00', '5.00')).toThrow(
      /Invariante Contable/
    );
  });

  it('repartirAbono aplica hasta la deuda y devuelve excedente', () => {
    expect(repartirAbono('10.00', '4.00')).toEqual({ aplicadoUsd: '4.00', excedenteUsd: '0.00' });
    expect(repartirAbono('10.00', '15.00')).toEqual({
      aplicadoUsd: '10.00',
      excedenteUsd: '5.00',
    });
  });

  it('aplicarSaldoAFavorACuota cubre la cuota y marca AL_DIA', () => {
    const r = aplicarSaldoAFavorACuota('10.00', '10.00', false);
    expect(r).toMatchObject({ aplicadoUsd: '10.00', saldoPendienteUsd: '0.00', estado: EstadoCuota.AL_DIA });
  });

  it('aplicarSaldoAFavorACuota con becado no consume saldo', () => {
    const r = aplicarSaldoAFavorACuota('10.00', '5.00', true);
    expect(r).toMatchObject({
      aplicadoUsd: '0.00',
      saldoAFavorRestanteUsd: '5.00',
      estado: EstadoCuota.AL_DIA,
    });
  });

  it('aplicarSaldoAFavorACuota parcial marca ABONADA_PARCIAL', () => {
    const r = aplicarSaldoAFavorACuota('10.00', '4.00', false);
    expect(r.estado).toBe(EstadoCuota.ABONADA_PARCIAL);
  });

  it('aplicarSaldoAFavorACuota sin saldo marca EMITIDA', () => {
    const r = aplicarSaldoAFavorACuota('10.00', '0.00', false);
    expect(r.estado).toBe(EstadoCuota.EMITIDA);
  });

  it('mensajeCobroConExcedente distingue sin/con excedente total', () => {
    expect(mensajeCobroConExcedente('Cobro de 10.00 USD', '10.00', '0.00')).toContain('aplicado a tu cuota');
    expect(mensajeCobroConExcedente('Cobro de 10.00 USD', '10.00', '10.00')).toContain('saldo a favor');
    expect(mensajeCobroConExcedente('Cobro de 15.00 USD', '15.00', '5.00')).toContain('10.00 USD se aplicaron');
  });

  it('mensajePagoAprobado devuelve la base sin excedente', () => {
    expect(mensajePagoAprobado('Aprobado.', '0.00')).toBe('Aprobado.');
    expect(mensajePagoAprobado('Aprobado.', '5.00')).toContain('saldo a favor');
  });

  it('estadoCuotaTrasRetirarAbono prioriza otras pendientes', () => {
    const base = {
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '10.00',
      fechaCorteUtc: new Date('2026-09-01T00:00:00.000Z'),
      hayOtrasPendientes: true,
      ahora: new Date('2026-10-13T00:00:00.000Z'),
    };
    expect(estadoCuotaTrasRetirarAbono(base)).toBe(EstadoCuota.PENDIENTE_REVISION);
    expect(estadoCuotaTrasRetirarAbono({ ...base, hayOtrasPendientes: false, saldoPendienteUsd: '0.00' })).toBe(
      EstadoCuota.AL_DIA
    );
    expect(
      estadoCuotaTrasRetirarAbono({
        ...base,
        hayOtrasPendientes: false,
        montoAbonadoUsd: '2.00',
      })
    ).toBe(EstadoCuota.ABONADA_PARCIAL);
    expect(estadoCuotaTrasRetirarAbono({ ...base, hayOtrasPendientes: false })).toBe(
      EstadoCuota.VENCIDA
    );
    expect(
      estadoCuotaTrasRetirarAbono({
        ...base,
        hayOtrasPendientes: false,
        fechaCorteUtc: new Date('2026-12-01T00:00:00.000Z'),
      })
    ).toBe(EstadoCuota.EMITIDA);
  });

  it('esFechaPagoFutura usa UTC+14 como referencia', () => {
    const ahora = new Date('2026-10-13T12:00:00.000Z');
    expect(esFechaPagoFutura('2026-10-20', ahora)).toBe(true);
    expect(esFechaPagoFutura('2026-10-01', ahora)).toBe(false);
  });

  it('esMetodoEfectivo solo cubre efectivo', () => {
    expect(esMetodoEfectivo(MetodoPago.EFECTIVO_USD)).toBe(true);
    expect(esMetodoEfectivo(MetodoPago.EFECTIVO_VES)).toBe(true);
    expect(esMetodoEfectivo(MetodoPago.TRANSFERENCIA_BANCARIA)).toBe(false);
  });

  it('formatearFechaCorta y zonaDelAlumno', () => {
    expect(formatearFechaCorta('2026-10-13')).toBe('13/10/2026');
    expect(zonaDelAlumno({ zonaHoraria: 'America/Caracas' })).toBe('America/Caracas');
    expect(zonaDelAlumno({ zonaHoraria: null as unknown as string })).toBeTruthy();
  });
});
