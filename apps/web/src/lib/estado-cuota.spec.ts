import { describe, expect, it } from 'vitest';
import { EstadoCuota } from '@guachafit/shared';
import { badgeEstadoCuota, type ResumenParaBadge } from './estado-cuota';

/** Resumen mínimo con una cuota del mes en el estado/saldo indicados. */
function resumenCon(
  estado: EstadoCuota,
  saldoPendienteUsd = '0.00',
  saldoPendienteTotalUsd = saldoPendienteUsd
): ResumenParaBadge {
  return {
    cuotaMesActual: {
      id: 'cuota-2026-09',
      periodo: '2026-09',
      montoTotalUsd: '50.00',
      montoPagadoUsd: '50.00',
      saldoPendienteUsd,
      estado,
      fechaVencimiento: '2026-09-30T00:00:00.000Z',
    },
    saldoPendienteTotalUsd,
  };
}

describe('badgeEstadoCuota (WU12b: verdad de datos del badge de cuota)', () => {
  it('sin resumen (cargando o error) devuelve null: el llamador omite el badge', () => {
    expect(badgeEstadoCuota(null)).toBeNull();
    expect(badgeEstadoCuota(undefined)).toBeNull();
  });

  it('sin cuota emitida muestra neutro "Sin cuota vigente"', () => {
    expect(badgeEstadoCuota({ cuotaMesActual: null, saldoPendienteTotalUsd: '0.00' })).toEqual({
      texto: 'Sin cuota vigente',
      tono: 'neutral',
    });
  });

  it('AL_DIA con deuda cero (mes y total) muestra verde "Al día"', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.AL_DIA, '0.00', '0.00'))).toEqual({
      texto: 'Al día',
      tono: 'success',
    });
  });

  it('AL_DIA con saldo en el mes muestra ámbar "Saldo pendiente" (nunca verde)', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.AL_DIA, '15.00', '15.00'))).toEqual({
      texto: 'Saldo pendiente',
      tono: 'warning',
    });
  });

  it('AL_DIA con deuda de periodos anteriores (total > 0) no se pinta verde', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.AL_DIA, '0.00', '40.00'))).toEqual({
      texto: 'Saldo pendiente',
      tono: 'warning',
    });
  });

  it('ABONADA_PARCIAL muestra ámbar "Abono parcial"', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.ABONADA_PARCIAL, '30.00', '30.00'))).toEqual({
      texto: 'Abono parcial',
      tono: 'warning',
    });
  });

  it('EMITIDA (cuota del mes sin abonos) muestra ámbar "Pendiente"', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.EMITIDA, '50.00', '50.00'))).toEqual({
      texto: 'Pendiente',
      tono: 'warning',
    });
  });

  it('PENDIENTE_REVISION (pago reportado sin conciliar) muestra info "Pago en revisión"', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.PENDIENTE_REVISION, '50.00', '50.00'))).toEqual({
      texto: 'Pago en revisión',
      tono: 'info',
    });
  });

  it('VENCIDA muestra rojo "Vencida"', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.VENCIDA, '50.00', '50.00'))).toEqual({
      texto: 'Vencida',
      tono: 'danger',
    });
  });

  it('ANULADA no se muestra como cuota vigente', () => {
    expect(badgeEstadoCuota(resumenCon(EstadoCuota.ANULADA, '50.00'))).toEqual({
      texto: 'Sin cuota vigente',
      tono: 'neutral',
    });
  });

  it('un estado desconocido cae en neutro "Sin dato" (jamás verde)', () => {
    expect(badgeEstadoCuota(resumenCon('estado_futuro' as EstadoCuota, '50.00'))).toEqual({
      texto: 'Sin dato',
      tono: 'neutral',
    });
  });

  it('mapea todos los estados del enum sin caer en el fallback "Sin dato"', () => {
    for (const estado of Object.values(EstadoCuota)) {
      const badge = badgeEstadoCuota(resumenCon(estado));
      expect(badge, `estado ${estado} sin mapeo`).not.toBeNull();
      expect(badge?.texto, `estado ${estado} cayó en el fallback`).not.toBe('Sin dato');
    }
  });

  it('invariante anti-falso "Al día": ningún estado con deuda puede pintar verde', () => {
    for (const estado of Object.values(EstadoCuota)) {
      const badge = badgeEstadoCuota(resumenCon(estado, '30.00', '30.00'));
      expect(badge?.tono, `estado ${estado} mostró verde con deuda`).not.toBe('success');
    }
  });
});
