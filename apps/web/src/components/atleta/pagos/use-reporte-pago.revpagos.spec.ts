// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { EstadoConciliacion, EstadoCuota, MetodoPago, Moneda } from '@guachafit/shared';
import type {
  CuotaDetalleDTO,
  TasaCambioVigenteDTO,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';

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
import * as pagosMontosModule from '../../../lib/pagos-montos';

const { MENSAJE_REFERENCIA_PAGO_REQUERIDA } = pagosMontosModule as unknown as {
  MENSAJE_REFERENCIA_PAGO_REQUERIDA: string;
};

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

const txBase: TransaccionPagoDetalleDTO = {
  id: 'tx-1',
  cuotaId: 'cuota-1',
  clienteId: 'alumno-1',
  entrenadorId: 'coach-1',
  registradoPor: 'alumno-1',
  montoOriginal: '40.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.0000',
  montoEquivalenteUsd: '40.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.ZELLE,
  referenciaBancaria: 'ZELLE-1234',
  fechaOperacion: '2026-10-05',
  estadoConciliacion: EstadoConciliacion.RECHAZADO,
  fechaReporteUtc: '2026-10-05T12:00:00.000Z',
  createdAtUtc: '2026-10-05T12:00:00.000Z',
  updatedAtUtc: '2026-10-05T12:00:00.000Z',
};

function opcionesBase(): OpcionesReportePago {
  return {
    cuota: cuotaBase,
    tasa: tasaBase,
    tasaError: false,
    alReportarExito: vi.fn(),
  };
}

describe('components/atleta/pagos/use-reporte-pago · D11, D15 y validación de referencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockReset();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-nueva' });
  });

  afterEach(() => {
    cleanup();
  });

  it('P15: la moneda se ajusta automáticamente al cambiar método y el estado inicial es PAGO_MOVIL/VES', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    expect(result.current.metodoPago).toBe(MetodoPago.PAGO_MOVIL);
    expect(result.current.moneda).toBe(Moneda.VES);

    act(() => {
      result.current.setMetodoPago(MetodoPago.ZELLE);
    });
    expect(result.current.metodoPago).toBe(MetodoPago.ZELLE);
    expect(result.current.moneda).toBe(Moneda.USD);

    act(() => {
      result.current.setMetodoPago(MetodoPago.PAGO_MOVIL);
    });
    expect(result.current.metodoPago).toBe(MetodoPago.PAGO_MOVIL);
    expect(result.current.moneda).toBe(Moneda.VES);

    act(() => {
      result.current.setMetodoPago(MetodoPago.EFECTIVO_USD);
    });
    expect(result.current.metodoPago).toBe(MetodoPago.EFECTIVO_USD);
    expect(result.current.moneda).toBe(Moneda.USD);
  });

  it('P16: cambio manual de moneda se respeta hasta que se cambia de nuevo el método de pago', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setMetodoPago(MetodoPago.ZELLE);
    });
    expect(result.current.moneda).toBe(Moneda.USD);

    act(() => {
      result.current.setMoneda(Moneda.VES);
    });
    expect(result.current.moneda).toBe(Moneda.VES);

    act(() => {
      result.current.setMetodoPago(MetodoPago.BINANCE_USDT);
    });
    expect(result.current.moneda).toBe(Moneda.USD);
  });

  it('P17: iniciarCorreccionPago conserva el método y la moneda de cada transacción sin forzar la sugerida', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    const tx1: TransaccionPagoDetalleDTO = {
      ...txBase,
      metodoPago: MetodoPago.ZELLE,
      monedaOriginal: Moneda.USD,
    };

    act(() => {
      result.current.iniciarCorreccionPago(tx1);
    });
    expect(result.current.metodoPago).toBe(MetodoPago.ZELLE);
    expect(result.current.moneda).toBe(Moneda.USD);

    const tx2: TransaccionPagoDetalleDTO = {
      ...txBase,
      metodoPago: MetodoPago.PAGO_MOVIL,
      monedaOriginal: Moneda.VES,
    };

    act(() => {
      result.current.iniciarCorreccionPago(tx2);
    });
    expect(result.current.metodoPago).toBe(MetodoPago.PAGO_MOVIL);
    expect(result.current.moneda).toBe(Moneda.VES);
  });

  it('P18: método no efectivo con referencia vacía bloquea handleReportarPago, asigna errorReferencia y al editarla vuelve a null', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setMetodoPago(MetodoPago.ZELLE);
      result.current.setMontoOriginal('50.00');
      result.current.setReferenciaBancaria('');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect((result.current as any).errorReferencia).toBe(MENSAJE_REFERENCIA_PAGO_REQUERIDA);
    expect(apiClient).not.toHaveBeenCalled();

    act(() => {
      result.current.setReferenciaBancaria('98765');
    });

    expect((result.current as any).errorReferencia).toBeNull();
  });

  it('P19: efectivo con referencia vacía procede con POST y método no efectivo envía referenciaBancaria recortada', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    // 1. Efectivo con referencia vacía
    act(() => {
      result.current.setMetodoPago(MetodoPago.EFECTIVO_USD);
      result.current.setMontoOriginal('40.00');
      result.current.setReferenciaBancaria('');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalled();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockClear();

    // 2. No efectivo con espacios alrededor
    act(() => {
      result.current.setMetodoPago(MetodoPago.PAGO_MOVIL);
      result.current.setMontoOriginal('1200.00');
      result.current.setReferenciaBancaria('  98765 ');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalled();
    const llamada = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(llamada[1].body);
    expect(body.referenciaBancaria).toBe('98765');
  });

  it('P20: iniciarCorreccionPago fija motivoRechazoCorreccion con el texto recortado o null, e iniciarNuevoPago lo resetea a null', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    const txConMotivo: TransaccionPagoDetalleDTO = {
      ...txBase,
      motivoRechazo: '  Comprobante borroso  ',
    };

    act(() => {
      result.current.iniciarCorreccionPago(txConMotivo);
    });
    expect((result.current as any).motivoRechazoCorreccion).toBe('Comprobante borroso');

    const txSinMotivo: TransaccionPagoDetalleDTO = {
      ...txBase,
      motivoRechazo: null,
    };

    act(() => {
      result.current.iniciarCorreccionPago(txSinMotivo);
    });
    expect((result.current as any).motivoRechazoCorreccion).toBeNull();

    act(() => {
      result.current.iniciarCorreccionPago(txConMotivo);
    });
    expect((result.current as any).motivoRechazoCorreccion).toBe('Comprobante borroso');

    act(() => {
      result.current.iniciarNuevoPago();
    });
    expect((result.current as any).motivoRechazoCorreccion).toBeNull();
  });

  it('P26: método no efectivo con referencia vacía genera errorReferencia y al cambiar a EFECTIVO_USD vuelve a null', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setMetodoPago(MetodoPago.PAGO_MOVIL);
      result.current.setMontoOriginal('50.00');
      result.current.setReferenciaBancaria('');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect((result.current as any).errorReferencia).toBe(MENSAJE_REFERENCIA_PAGO_REQUERIDA);

    act(() => {
      result.current.setMetodoPago(MetodoPago.EFECTIVO_USD);
    });

    expect((result.current as any).errorReferencia).toBeNull();
  });
});

