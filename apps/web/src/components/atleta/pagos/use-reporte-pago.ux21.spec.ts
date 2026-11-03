// @vitest-environment jsdom
/**
 * Specs de comportamiento UX-21: hook de reporte de pago (`use-reporte-pago.ts`).
 * Contratos C1 y C6: monto vacío inicial, validación de monto, normalización en POST y corrección de pagos rechazados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { EstadoConciliacion, EstadoCuota, MetodoPago, Moneda } from '@guachafit/shared';
import type { CuotaDetalleDTO, TasaCambioVigenteDTO, TransaccionPagoDetalleDTO } from '@guachafit/shared';

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
  periodo: '2026-10',
  montoTotalUsd: '40.00',
  montoAbonadoUsd: '0.00',
  saldoPendienteUsd: '40.00',
  saldoAFavorAplicadoUsd: '0.00',
  fechaEmisionUtc: '2026-10-01T00:00:00.000Z',
  fechaCorteUtc: '2026-10-10T03:59:59.999Z',
  estado: ((EstadoCuota as any).PENDIENTE ?? EstadoCuota.EMITIDA) as EstadoCuota,
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

function opcionesBase(): OpcionesReportePago {
  return {
    cuota: cuotaBase,
    tasa: tasaBase,
    tasaError: false,
    alReportarExito: vi.fn(),
  };
}

describe('useReportePago · UX-21 (C1, C6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockReset();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-nueva' });
  });

  afterEach(() => {
    cleanup();
  });

  it('C1 · montoOriginal arranca vacío (\'\') y nunca con \'1300.00\', y errorMonto arranca en null', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    expect(result.current.montoOriginal).toBe('');
    expect((result.current as any).errorMonto).toBeNull();
  });

  it('C1 · handleReportarPago con monto vacío asigna MENSAJE_MONTO_PAGO_INVALIDO a errorMonto y no invoca apiClient', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect((result.current as any).errorMonto).toBe('Ingresa un monto válido mayor a 0.');
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('C1 · handleReportarPago con monto \'0\' o inválido asigna errorMonto y no invoca apiClient', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setMontoOriginal('0');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect((result.current as any).errorMonto).toBe('Ingresa un monto válido mayor a 0.');
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('C1 · setMontoOriginal limpia errorMonto a null tras un intento inválido', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setMontoOriginal('');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    act(() => {
      result.current.setMontoOriginal('25.00');
    });

    expect((result.current as any).errorMonto).toBeNull();
  });

  it('C1 · handleReportarPago con coma decimal envía el monto normalizado con punto y 2 decimales en el POST', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setReferenciaBancaria('987654');
      result.current.setMontoOriginal('35,5');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalled();
    const llamada = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(llamada[1].body);
    expect(body.montoOriginal).toBe('35.50');
  });

  it('C6 · iniciarCorreccionPago precarga metodo, moneda, monto, referencia y fecha de la transacción rechazada', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));
    const txRechazada: TransaccionPagoDetalleDTO = {
      id: 'tx-rechazada-1',
      cuotaId: 'cuota-1',
      entrenadorId: 'coach-1',
      montoOriginal: '45.00',
      monedaOriginal: Moneda.USD,
      montoEquivalenteUsd: '45.00',
      tasaCambioFijada: '1.0000',
      metodoPago: MetodoPago.ZELLE,
      referenciaBancaria: 'ZELLE-987654',
      fechaOperacion: '2026-10-05T14:30:00.000Z',
      comprobanteUrl: null,
      comprobanteStorageKey: null,
      estadoConciliacion: EstadoConciliacion.RECHAZADO,
      motivoRechazo: 'Referencia no encontrada',
      motivoReversion: null,
      clienteId: 'alumno-1',
      registradoPor: 'alumno-1',
      excedenteUsd: '0.00',
      fechaReporteUtc: '2026-10-05T14:35:00.000Z',
      createdAtUtc: '2026-10-05T14:35:00.000Z',
      updatedAtUtc: '2026-10-05T14:35:00.000Z',
    };

    act(() => {
      (result.current as any).iniciarCorreccionPago(txRechazada);
    });

    expect(result.current.metodoPago).toBe(MetodoPago.ZELLE);
    expect(result.current.moneda).toBe(Moneda.USD);
    expect(result.current.montoOriginal).toBe('45.00');
    expect(result.current.referenciaBancaria).toBe('ZELLE-987654');
    expect(result.current.fechaOperacion).toBe('2026-10-05');
  });

  it('C6 · iniciarCorreccionPago maneja referenciaBancaria nula (asigna \'\') y limpia errores previos', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));
    const txRechazada: TransaccionPagoDetalleDTO = {
      id: 'tx-rechazada-2',
      cuotaId: 'cuota-1',
      entrenadorId: 'coach-1',
      montoOriginal: '20.00',
      monedaOriginal: Moneda.USD,
      montoEquivalenteUsd: '20.00',
      tasaCambioFijada: '1.0000',
      metodoPago: MetodoPago.EFECTIVO_USD,
      referenciaBancaria: null,
      fechaOperacion: '2026-10-08T10:00:00.000Z',
      comprobanteUrl: null,
      comprobanteStorageKey: null,
      estadoConciliacion: EstadoConciliacion.RECHAZADO,
      motivoRechazo: 'Billete deteriorado',
      motivoReversion: null,
      clienteId: 'alumno-1',
      registradoPor: 'alumno-1',
      excedenteUsd: '0.00',
      fechaReporteUtc: '2026-10-08T10:00:00.000Z',
      createdAtUtc: '2026-10-08T10:00:00.000Z',
      updatedAtUtc: '2026-10-08T10:00:00.000Z',
    };

    act(() => {
      (result.current as any).iniciarCorreccionPago(txRechazada);
    });

    expect(result.current.referenciaBancaria).toBe('');
    expect((result.current as any).errorMonto).toBeNull();
    expect(result.current.formError).toBeNull();
  });

  it('V2 · tras un envío exitoso (handleReportarPago), montoOriginal y referenciaBancaria se resetean a \'\'', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setMontoOriginal('50.00');
      result.current.setReferenciaBancaria('REF-123456');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.montoOriginal).toBe('');
    expect(result.current.referenciaBancaria).toBe('');
    expect(result.current.formSuccess).toBe('¡Pago reportado con éxito! Tu entrenador lo revisará pronto.');
  });

  it('V3 · iniciarNuevoPago() restablece un formulario previamente cargado con iniciarCorreccionPago(tx)', () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));
    const txRechazada: TransaccionPagoDetalleDTO = {
      id: 'tx-rechazada-v3',
      cuotaId: 'cuota-1',
      entrenadorId: 'coach-1',
      montoOriginal: '75.00',
      monedaOriginal: Moneda.USD,
      montoEquivalenteUsd: '75.00',
      tasaCambioFijada: '1.0000',
      metodoPago: MetodoPago.ZELLE,
      referenciaBancaria: 'ZELLE-112233',
      fechaOperacion: '2026-10-01T12:00:00.000Z',
      comprobanteUrl: null,
      comprobanteStorageKey: null,
      estadoConciliacion: EstadoConciliacion.RECHAZADO,
      motivoRechazo: 'Referencia errónea',
      motivoReversion: null,
      clienteId: 'alumno-1',
      registradoPor: 'alumno-1',
      excedenteUsd: '0.00',
      fechaReporteUtc: '2026-10-01T12:05:00.000Z',
      createdAtUtc: '2026-10-01T12:05:00.000Z',
      updatedAtUtc: '2026-10-01T12:05:00.000Z',
    };

    act(() => {
      result.current.iniciarCorreccionPago(txRechazada);
    });

    expect(result.current.metodoPago).toBe(MetodoPago.ZELLE);
    expect(result.current.moneda).toBe(Moneda.USD);
    expect(result.current.montoOriginal).toBe('75.00');
    expect(result.current.referenciaBancaria).toBe('ZELLE-112233');

    act(() => {
      result.current.iniciarNuevoPago();
    });

    expect(result.current.metodoPago).toBe(MetodoPago.PAGO_MOVIL);
    expect(result.current.moneda).toBe(Moneda.VES);
    expect(result.current.montoOriginal).toBe('');
    expect(result.current.referenciaBancaria).toBe('');
    expect(result.current.errorMonto).toBeNull();
    expect(result.current.errorFecha).toBeNull();
    expect(result.current.errorArchivo).toBeNull();
    expect(result.current.formError).toBeNull();
  });

  it('V4 · cuando formError tiene un mensaje tras un fallo del POST, tanto escribir en setMontoOriginal como reintentar handleReportarPago con un monto inválido limpian formError a null', async () => {
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Error de red al reportar pago')
    );

    const { result } = renderHook(() => useReportePago(opcionesBase()));

    act(() => {
      result.current.setReferenciaBancaria('987654');
      result.current.setMontoOriginal('15.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe('Error de red al reportar pago');

    // 1. Escribir en setMontoOriginal limpia formError a null
    act(() => {
      result.current.setMontoOriginal('25.00');
    });
    expect(result.current.formError).toBeNull();

    // Provocamos nuevo error en el POST
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });
    expect(result.current.formError).toBe('Error de red al reportar pago');

    // 2. Reintentar handleReportarPago con monto inválido limpia formError a null y activa errorMonto
    act(() => {
      result.current.setMontoOriginal('0');
    });
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });
    expect(result.current.formError).toBeNull();
    expect(result.current.errorMonto).toBe('Ingresa un monto válido mayor a 0.');
  });

  it('V5 · si primero se selecciona un archivo válido y después se selecciona un archivo inválido (> 5 MB o MIME no permitido), selectedFile y previewUrl pasan a null, errorArchivo se activa y handleReportarPago bloquea el envío sin llamar a apiClient', async () => {
    const { result } = renderHook(() => useReportePago(opcionesBase()));

    const archivoValido = new File(['contenido-valido'], 'recibo.png', { type: 'image/png' });
    act(() => {
      result.current.handleFileChange({ target: { files: [archivoValido] } } as any);
    });

    expect(result.current.selectedFile).not.toBeNull();
    expect(result.current.previewUrl).toBe('blob:mock-url');
    expect(result.current.errorArchivo).toBeNull();

    // Archivo con MIME no permitido (PDF)
    const archivoInvalidoMime = new File(['pdf-content'], 'recibo.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.handleFileChange({ target: { files: [archivoInvalidoMime] } } as any);
    });

    expect(result.current.selectedFile).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.errorArchivo).toBe('Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.');

    act(() => {
      result.current.setMontoOriginal('30.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).not.toHaveBeenCalled();

    // Archivo con tamaño > 5MB
    const archivoPesado = new File(['x'.repeat(10)], 'pesado.jpg', { type: 'image/jpeg' });
    Object.defineProperty(archivoPesado, 'size', { value: 6 * 1024 * 1024 });

    // Seleccionar válido primero de nuevo
    act(() => {
      result.current.handleFileChange({ target: { files: [archivoValido] } } as any);
    });
    expect(result.current.selectedFile).not.toBeNull();
    expect(result.current.errorArchivo).toBeNull();

    // Luego el archivo pesado > 5MB
    act(() => {
      result.current.handleFileChange({ target: { files: [archivoPesado] } } as any);
    });

    expect(result.current.selectedFile).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.errorArchivo).toBe('El archivo excede el límite máximo de 5 MB.');

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).not.toHaveBeenCalled();
  });
});
