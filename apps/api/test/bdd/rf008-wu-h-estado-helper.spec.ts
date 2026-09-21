import { describe, it, expect } from 'vitest';
import { EstadoCuota } from '@guachafit/shared';
import {
  calcularEstadoBarrido,
  CuotaParaBarrido,
} from '../../src/modules/finanzas/cuota-estado.helper';

/**
 * WU-H (RF-008 §4.A): máquina de estados REAL extraída a helper puro.
 * Estas pruebas fijan el contrato que el barrido diario usa en producción.
 */
describe('RF-008 WU-H: máquina de estados de la cuota (helper puro)', () => {
  const fechaCorte = new Date('2026-09-15T23:59:59Z');

  function cuota(overrides: Partial<CuotaParaBarrido> = {}): CuotaParaBarrido {
    return {
      estado: EstadoCuota.EMITIDA,
      saldoPendienteUsd: '60.00',
      fechaCorteUtc: fechaCorte,
      ...overrides,
    };
  }

  it('transiciona a VENCIDA cuando la fecha de corte ya pasó con saldo pendiente', () => {
    const resultado = calcularEstadoBarrido(cuota(), new Date('2026-09-16T10:00:00Z'));

    expect(resultado.estado).toBe(EstadoCuota.VENCIDA);
    expect(resultado.cambio).toBe(true);
    expect(resultado.motivo).toBe('mora');
  });

  it('transiciona a POR_VENCER cuando faltan entre 5 y 0 días para el corte', () => {
    // Exactamente 5 días antes: entra en la ventana.
    const cincoDiasAntes = new Date(fechaCorte.getTime() - 5 * 24 * 60 * 60 * 1000);
    expect(calcularEstadoBarrido(cuota(), cincoDiasAntes)).toEqual({
      estado: EstadoCuota.POR_VENCER,
      cambio: true,
      motivo: 'por_vencer',
    });

    // Día del corte (aún no pasó la hora exacta): sigue POR_VENCER.
    const diaDelCorte = new Date('2026-09-15T09:00:00Z');
    expect(calcularEstadoBarrido(cuota(), diaDelCorte).estado).toBe(EstadoCuota.POR_VENCER);
  });

  it('NO transiciona a POR_VENCER cuando faltan más de 5 días', () => {
    const seisDiasAntes = new Date(fechaCorte.getTime() - 6 * 24 * 60 * 60 * 1000);
    const resultado = calcularEstadoBarrido(cuota(), seisDiasAntes);

    expect(resultado.estado).toBe(EstadoCuota.EMITIDA);
    expect(resultado.cambio).toBe(false);
    expect(resultado.motivo).toBe('sin_cambio');
  });

  it('PAUSA el barrido en PENDIENTE_REVISION aunque el corte ya haya pasado (RF-008 Gherkin 2)', () => {
    const resultado = calcularEstadoBarrido(
      cuota({ estado: EstadoCuota.PENDIENTE_REVISION }),
      new Date('2026-09-20T10:00:00Z')
    );

    expect(resultado.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
    expect(resultado.cambio).toBe(false);
    expect(resultado.motivo).toBe('pausa_revision');
  });

  it('marca AL_DIA toda cuota con saldo $0.00, sin importar su estado persistido', () => {
    const resultado = calcularEstadoBarrido(
      cuota({ estado: EstadoCuota.ABONADA_PARCIAL, saldoPendienteUsd: '0.00' }),
      new Date('2026-09-20T10:00:00Z')
    );

    expect(resultado.estado).toBe(EstadoCuota.AL_DIA);
    expect(resultado.cambio).toBe(true);
    expect(resultado.motivo).toBe('saldada');
  });

  it('mantiene VENCIDA (no retrocede a POR_VENCER) mientras conserve saldo', () => {
    const resultado = calcularEstadoBarrido(
      cuota({ estado: EstadoCuota.VENCIDA }),
      new Date('2026-09-10T10:00:00Z') // aún antes del corte
    );

    expect(resultado.estado).toBe(EstadoCuota.VENCIDA);
    expect(resultado.cambio).toBe(false);
  });

  it('NUNCA toca una cuota ANULADA (estado terminal)', () => {
    const anulada = cuota({ estado: EstadoCuota.ANULADA, saldoPendienteUsd: '0.00' });
    const resultado = calcularEstadoBarrido(anulada, new Date('2027-01-01T00:00:00Z'));

    expect(resultado.estado).toBe(EstadoCuota.ANULADA);
    expect(resultado.cambio).toBe(false);
    expect(resultado.motivo).toBe('anulada');
  });

  it('respeta ABONADA_PARCIAL dentro de la ventana de 5 días (no la degrada a VENCIDA)', () => {
    const resultado = calcularEstadoBarrido(
      cuota({ estado: EstadoCuota.ABONADA_PARCIAL, saldoPendienteUsd: '30.00' }),
      new Date(fechaCorte.getTime() - 2 * 24 * 60 * 60 * 1000)
    );

    expect(resultado.estado).toBe(EstadoCuota.POR_VENCER);
    expect(resultado.cambio).toBe(true);
  });
});
