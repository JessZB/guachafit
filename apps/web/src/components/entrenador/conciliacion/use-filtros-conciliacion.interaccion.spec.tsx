// @vitest-environment jsdom
/**
 * 01 · UX-09b · useFiltrosConciliacion con búsqueda inicial (Contrato C2).
 *
 * C2: useFiltrosConciliacion(transacciones, busquedaInicial?)
 * - Con 'Carlos', busqueda empieza en 'Carlos' y visibles solo contiene las transacciones de Carlos.
 * - Sin segundo argumento, empieza en ''.
 * - limpiarFiltros() la deja en ''.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { useFiltrosConciliacion } from './use-filtros-conciliacion';

function fixtureTx(parcial: Partial<TransaccionPagoDetalleDTO> = {}): TransaccionPagoDetalleDTO {
  return {
    id: 'tx-1',
    cuotaId: 'cuota-1',
    clienteId: 'cli-1',
    entrenadorId: 'coach-1',
    registradoPor: 'cli-1',
    montoOriginal: '50.00',
    monedaOriginal: Moneda.USD,
    tasaCambioFijada: '1.0000',
    montoEquivalenteUsd: '50.00',
    excedenteUsd: '0.00',
    metodoPago: MetodoPago.EFECTIVO_USD,
    referenciaBancaria: '445566',
    fechaOperacion: '2026-10-09',
    comprobanteStorageKey: null,
    comprobanteUrl: null,
    estadoConciliacion: EstadoConciliacion.PENDIENTE,
    fechaReporteUtc: '2026-10-09T12:00:00.000Z',
    createdAtUtc: '2026-10-09T12:00:00.000Z',
    updatedAtUtc: '2026-10-09T12:00:00.000Z',
    clienteNombre: 'Carlos Mendoza',
    saldoPendienteCuotaUsd: '60.00',
    ...parcial,
  };
}

describe('Contrato C2 · useFiltrosConciliacion con búsqueda inicial', () => {
  const txCarlos = fixtureTx({ id: 'tx-carlos', clienteNombre: 'Carlos Mendoza' });
  const txAna = fixtureTx({ id: 'tx-ana', clienteNombre: 'Ana Torres' });
  const transacciones = [txCarlos, txAna];

  it('con "Carlos", busqueda empieza en "Carlos" y visibles solo contiene las transacciones de Carlos', () => {
    const { result } = renderHook(() =>
      (useFiltrosConciliacion as unknown as (txs: TransaccionPagoDetalleDTO[], q?: string) => ReturnType<typeof useFiltrosConciliacion>)(
        transacciones,
        'Carlos'
      )
    );

    expect(result.current.busqueda).toBe('Carlos');
    expect(result.current.visibles).toHaveLength(1);
    expect(result.current.visibles[0].clienteNombre).toBe('Carlos Mendoza');
  });

  it('sin segundo argumento, empieza en "" y visibles contiene todas las transacciones', () => {
    const { result } = renderHook(() => useFiltrosConciliacion(transacciones));

    expect(result.current.busqueda).toBe('');
    expect(result.current.visibles).toHaveLength(2);
  });

  it('limpiarFiltros() deja la búsqueda en "" incluso si empezó con búsqueda inicial', () => {
    const { result } = renderHook(() =>
      (useFiltrosConciliacion as unknown as (txs: TransaccionPagoDetalleDTO[], q?: string) => ReturnType<typeof useFiltrosConciliacion>)(
        transacciones,
        'Carlos'
      )
    );

    act(() => {
      result.current.limpiarFiltros();
    });

    expect(result.current.busqueda).toBe('');
    expect(result.current.visibles).toHaveLength(2);
  });
});
