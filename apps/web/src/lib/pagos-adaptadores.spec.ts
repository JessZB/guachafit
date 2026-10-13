/**
 * Specs de `lib/pagos-adaptadores.ts` (fase B, prompt 54): lógica pura extraída
 * tal cual de `PagosPage.tsx`. Fijan el mapeo real → DTO que la vista renderiza.
 */
import { describe, expect, it } from 'vitest';
import { EstadoConciliacion, Moneda, type ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import {
  adaptarCuotaDesdeResumen,
  adaptarTransaccionesHistorial,
  COMPROBANTE_DEMO_URL,
  crearTransaccionesDemoPagos,
} from './pagos-adaptadores';

function resumenBase(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: 'alumno-1',
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '60.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-10-10T03:59:59.999Z',
    },
    transaccionesTotal: 2,
    transacciones: [
      {
        id: 'tx-1',
        cuotaId: 'cuota-1',
        montoUsd: '20.00',
        montoBs: '1300.00',
        metodoPago: 'pago_movil',
        referencia: 'REF-1',
        estado: 'aprobado',
        createdAtUtc: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'tx-2',
        cuotaId: 'cuota-1',
        montoUsd: '40.00',
        metodoPago: 'efectivo_usd',
        estado: 'revertido',
        motivoReversion: 'Cobro duplicado',
        createdAtUtc: '2026-09-15T10:00:00.000Z',
      },
    ],
  };
}

describe('pagos-adaptadores', () => {
  it('el fixture demo trae 1 transacción aprobada en VES con la tasa 65.0000', () => {
    const txs = crearTransaccionesDemoPagos(null);
    expect(txs).toHaveLength(1);
    expect(txs[0].estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
    expect(txs[0].monedaOriginal).toBe(Moneda.VES);
    expect(txs[0].tasaCambioFijada).toBe('65.0000');
    expect(txs[0].clienteId).toBe('demo-alumno');
  });

  it('el fixture demo usa los ids del usuario cuando hay sesión', () => {
    const txs = crearTransaccionesDemoPagos({
      id: 'alumno-9',
      entrenadorId: 'coach-9',
    } as Parameters<typeof crearTransaccionesDemoPagos>[0]);
    expect(txs[0].clienteId).toBe('alumno-9');
    expect(txs[0].entrenadorId).toBe('coach-9');
  });

  it('adapta el historial VES calculando la tasa montoBs/montoUsd y la fecha local', () => {
    const adaptadas = adaptarTransaccionesHistorial(resumenBase().transacciones, {
      clienteId: 'alumno-1',
      entrenadorId: 'coach-1',
    });
    expect(adaptadas).toHaveLength(2);
    expect(adaptadas[0].monedaOriginal).toBe(Moneda.VES);
    expect(adaptadas[0].tasaCambioFijada).toBe((1300 / 20).toFixed(4));
    expect(adaptadas[0].montoOriginal).toBe('1300.00');
    expect(adaptadas[0].referenciaBancaria).toBe('REF-1');
    expect(adaptadas[0].fechaOperacion).toBe('2026-10-01');
    expect(adaptadas[0].excedenteUsd).toBe('0.00');
  });

  it('adapta el historial USD con tasa 1.0000 y conserva el motivo de reversión', () => {
    const adaptadas = adaptarTransaccionesHistorial(resumenBase().transacciones, {
      clienteId: 'alumno-1',
      entrenadorId: 'coach-1',
    });
    expect(adaptadas[1].monedaOriginal).toBe(Moneda.USD);
    expect(adaptadas[1].tasaCambioFijada).toBe('1.0000');
    expect(adaptadas[1].referenciaBancaria).toBeNull();
    expect(adaptadas[1].estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
    expect(adaptadas[1].motivoReversion).toBe('Cobro duplicado');
  });

  it('adapta la cuota del resumen con los saldos reales y el nombre del periodo', () => {
    const cuota = adaptarCuotaDesdeResumen(resumenBase(), 'coach-1');
    expect(cuota).not.toBeNull();
    expect(cuota?.planNombre).toBe('Cuota del periodo 2026-10');
    expect(cuota?.saldoPendienteUsd).toBe('40.00');
    expect(cuota?.montoAbonadoUsd).toBe('0.00');
    expect(cuota?.saldoAFavorAplicadoUsd).toBe('0.00');
    expect(cuota?.entrenadorId).toBe('coach-1');
    expect(cuota?.transacciones).toHaveLength(2);
  });

  it('devuelve null cuando el resumen no trae cuota del mes', () => {
    expect(adaptarCuotaDesdeResumen({ ...resumenBase(), cuotaMesActual: null }, 'c')).toBeNull();
  });

  it('la URL demo de comprobante es la fixture interna conocida', () => {
    expect(COMPROBANTE_DEMO_URL).toContain('images.unsplash.com');
  });
});
