// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  EstadoCuota,
  type CuotaDetalleDTO,
  type TasaCambioVigenteDTO,
} from '@guachafit/shared';

const mockUser = vi.hoisted(() => ({
  id: 'alumno-1',
  email: 'alumno@guachafit.com',
  rol: 'alumno',
}));

vi.mock('../../../context/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    isDemoMode: false,
  }),
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

vi.mock('../../../lib/comprobante-pago', () => ({
  prepararComprobanteParaSubida: vi.fn(),
  subirComprobantePago: vi.fn(),
}));

import { apiClient } from '../../../lib/api-client';
import { prepararComprobanteParaSubida, subirComprobantePago } from '../../../lib/comprobante-pago';
import { useReportePago, type OpcionesReportePago } from './use-reporte-pago';

const cuotaBase: CuotaDetalleDTO = {
  id: 'cuota-1',
  clienteId: 'alumno-1',
  entrenadorId: 'coach-1',
  planId: 'plan-1',
  periodo: '2026-10',
  montoTotalUsd: '40.00',
  montoAbonadoUsd: '0.00',
  saldoPendienteUsd: '40.00',
  saldoAFavorAplicadoUsd: '0.00',
  fechaEmisionUtc: '2026-10-01T00:00:00.000Z',
  fechaCorteUtc: '2026-10-10T03:59:59.999Z',
  estado: EstadoCuota.EMITIDA,
  createdAtUtc: '2026-10-01T00:00:00.000Z',
  updatedAtUtc: '2026-10-01T00:00:00.000Z',
};

const tasaBase: TasaCambioVigenteDTO = {
  entrenadorId: 'coach-1',
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
};

function opcionesBase(overrides: Partial<OpcionesReportePago> = {}): OpcionesReportePago {
  return {
    cuota: cuotaBase,
    tasa: tasaBase,
    tasaError: false,
    alReportarExito: vi.fn(),
    ...overrides,
  };
}

describe('useReportePago · REVUX (G1a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockReset();
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockReset();
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('R2: ante error de red ambiguo, cambiar o quitar el comprobante renueva X-Idempotency-Key y reenviar sin cambios reutiliza la misma clave', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    const archivo1 = new File(['dummy-1'], 'recibo-1.png', { type: 'image/png' });
    const archivo2 = new File(['dummy-2'], 'recibo-2.png', { type: 'image/png' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo1);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/recibo-1.webp'
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo1] } } as any);
      result.current.setReferenciaBancaria('987654');
      result.current.setMontoOriginal('40.00');
    });

    // 1. Primer envío: fallo ambiguo de red (TypeError)
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(1);
    const llamada1 = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const key1 = (llamada1[1] as any).idempotencyKey ?? JSON.parse((llamada1[1] as any).body).idempotencyKey;
    expect(key1).toBeDefined();

    // 2. Reenviar sin tocar nada reutiliza la misma clave (idempotencia legítima)
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(2);
    const llamada2 = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const key2 = (llamada2[1] as any).idempotencyKey ?? JSON.parse((llamada2[1] as any).body).idempotencyKey;
    expect(key2).toBe(key1);

    // 3. Cambiar el archivo adjunto genera una clave X-Idempotency-Key DISTINTA
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo2);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/recibo-2.webp'
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo2] } } as any);
    });

    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(3);
    const llamada3 = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[2];
    const key3 = (llamada3[1] as any).idempotencyKey ?? JSON.parse((llamada3[1] as any).body).idempotencyKey;
    expect(key3).toBeDefined();
    expect(key3).not.toBe(key1);

    // 4. Quitar el comprobante genera otra clave X-Idempotency-Key DISTINTA
    act(() => {
      result.current.handleRemoveFile();
    });

    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'tx-ok' });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(4);
    const llamada4 = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[3];
    const key4 = (llamada4[1] as any).idempotencyKey ?? JSON.parse((llamada4[1] as any).body).idempotencyKey;
    expect(key4).toBeDefined();
    expect(key4).not.toBe(key3);
    expect(key4).not.toBe(key1);
  });
});
