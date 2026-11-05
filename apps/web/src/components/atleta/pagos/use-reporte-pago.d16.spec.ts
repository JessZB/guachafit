// @vitest-environment happy-dom
/**
 * D16 / Ítem 22: Caracterización de comportamiento de useReportePago frente a ausencia o fallo de tasa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { EstadoCuota, MetodoPago, Moneda } from '@guachafit/shared';
import type { CuotaDetalleDTO } from '@guachafit/shared';

const mockUser = {
  id: 'alumno-1',
  email: 'alumno@example.com',
  rol: 'alumno',
};

vi.mock('../../../context/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    isDemoMode: false,
  }),
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '../../../lib/api-client';
import { useReportePago, type OpcionesReportePago } from './use-reporte-pago';

const cuotaBase: CuotaDetalleDTO = {
  id: 'cuota-1',
  clienteId: 'alumno-1',
  entrenadorId: 'coach-1',
  planId: 'plan-1',
  periodo: '2026-11',
  montoTotalUsd: '40.00',
  montoAbonadoUsd: '0.00',
  saldoPendienteUsd: '40.00',
  saldoAFavorAplicadoUsd: '0.00',
  fechaEmisionUtc: '2026-11-01T00:00:00.000Z',
  fechaCorteUtc: '2026-11-15T23:59:59.999Z',
  estado: EstadoCuota.EMITIDA,
  createdAtUtc: '2026-11-01T00:00:00.000Z',
  updatedAtUtc: '2026-11-01T00:00:00.000Z',
};

function opcionesConTasa(sobrescribir: Partial<OpcionesReportePago> = {}): OpcionesReportePago {
  return {
    cuota: cuotaBase,
    tasa: null,
    tasaError: false,
    alReportarExito: vi.fn(),
    ...sobrescribir,
  };
}

describe('useReportePago · D16 / Ítem 22 (Aviso y bloqueo por falta de tasa)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('moneda VES, tasa null, tasaError: false → pagoVesSinTasa es true y handleReportarPago no llama al API', async () => {
    const { result } = renderHook(() =>
      useReportePago(opcionesConTasa({ tasa: null, tasaError: false }))
    );

    expect(result.current.moneda).toBe(Moneda.VES);
    expect(result.current.pagoVesSinTasa).toBe(true);

    act(() => {
      result.current.setMontoOriginal('1500');
      result.current.setReferenciaBancaria('984521');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).not.toHaveBeenCalled();
  });

  it('moneda VES, tasa null, tasaError: true → pagoVesSinTasa es false y el envío sí llega al API', async () => {
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'tx-reportada',
    });

    const { result } = renderHook(() =>
      useReportePago(opcionesConTasa({ tasa: null, tasaError: true }))
    );

    expect(result.current.moneda).toBe(Moneda.VES);
    expect(result.current.pagoVesSinTasa).toBe(false);

    act(() => {
      result.current.setMontoOriginal('1500');
      result.current.setReferenciaBancaria('984521');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(1);
    const [endpoint, opciones] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(endpoint).toBe('/finanzas/cuotas/cuota-1/reportar-pago');
    expect(opciones.method).toBe('POST');
  });
});
