// @vitest-environment jsdom
/**
 * Specs de comportamiento UX-22 (ALU-07, D8): hook `useReportePago`.
 * Contratos:
 * - C1 (ALU-07a): Reutilización de finalStorageKey en reintentos con mismo archivo y descarte al cambiarlo.
 * - C2 (ALU-07 + D8): Clave de idempotencia estable en reintentos y renovada tras éxito o nuevo flujo.
 * - C3 (ALU-07b): Limpieza del temporizador post-éxito de 1800 ms (unmount y nuevo pago).
 * - C4 (ALU-07c): Mensaje honesto ante fallo ambiguo de red o timeout vs error determinista de la API.
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

vi.mock('../../../lib/comprobante-pago', () => ({
  prepararComprobanteParaSubida: vi.fn(),
  subirComprobantePago: vi.fn(),
}));

import { apiClient } from '../../../lib/api-client';
import { prepararComprobanteParaSubida, subirComprobantePago } from '../../../lib/comprobante-pago';
import * as pagosMontos from '../../../lib/pagos-montos';
import { useReportePago, type OpcionesReportePago } from './use-reporte-pago';

const MENSAJE_ERROR_RED_AMBIGUO_ESPERADO =
  'No se pudo confirmar el envío; revisa tu historial antes de repetirlo.';

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

function opcionesBase(overrides: Partial<OpcionesReportePago> = {}): OpcionesReportePago {
  return {
    cuota: cuotaBase,
    tasa: tasaBase,
    tasaError: false,
    alReportarExito: vi.fn(),
    ...overrides,
  };
}

describe('useReportePago · UX-22 (ALU-07, D8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockReset();
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-nueva' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockReset();
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // =========================================================================
  // C1 · Reutilización de finalStorageKey en reintentos (ALU-07a)
  // =========================================================================
  it('C1 · al reintentar handleReportarPago tras fallo del POST con el mismo archivo, no vuelve a subir el comprobante y reutiliza finalStorageKey', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    const archivo = new File(['dummy-bytes'], 'recibo-1.png', { type: 'image/png' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/recibo-1.webp'
    );
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Fallo transitorio en base de datos')
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo] } } as any);
      result.current.setMontoOriginal('40.00');
    });

    // Primer intento: falla el POST
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(prepararComprobanteParaSubida).toHaveBeenCalledTimes(1);
    expect(subirComprobantePago).toHaveBeenCalledTimes(1);
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(result.current.formError).toBe('Fallo transitorio en base de datos');

    // Segundo intento con el mismo archivo: éxito en POST
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'tx-confirmada' });
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    // NO debe haberse vuelto a preparar ni subir la imagen
    expect(prepararComprobanteParaSubida).toHaveBeenCalledTimes(1);
    expect(subirComprobantePago).toHaveBeenCalledTimes(1);
    expect(apiClient).toHaveBeenCalledTimes(2);

    const llamada2 = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const body2 = JSON.parse(llamada2[1].body);
    expect(body2.comprobanteStorageKey).toBe('comprobantes/alumno-1/recibo-1.webp');
  });

  it('C1 · al cambiar o quitar el archivo, o invocar iniciarNuevoPago / iniciarCorreccionPago, la clave en caché se descarta y vuelve a subir', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    const archivo1 = new File(['dummy-1'], 'recibo-1.png', { type: 'image/png' });
    const archivo2 = new File(['dummy-2'], 'recibo-2.png', { type: 'image/png' });

    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo1);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/recibo-1.webp'
    );
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Fallo transitorio')
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo1] } } as any);
      result.current.setMontoOriginal('40.00');
    });

    // Intento 1 con archivo 1
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });
    expect(subirComprobantePago).toHaveBeenCalledTimes(1);

    // Cambiar a archivo 2
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo2);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/recibo-2.webp'
    );
    act(() => {
      result.current.handleFileChange({ target: { files: [archivo2] } } as any);
    });

    // Intento 2 con archivo 2: debe subir el nuevo archivo
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'tx-2' });
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(subirComprobantePago).toHaveBeenCalledTimes(2);
    const llamada2 = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const body2 = JSON.parse(llamada2[1].body);
    expect(body2.comprobanteStorageKey).toBe('comprobantes/alumno-1/recibo-2.webp');
  });

  // =========================================================================
  // C2 · Clave de idempotencia estable en reintentos y renovada tras éxito o nuevo flujo
  // =========================================================================
  it('C2 · la llamada a apiClient incluye idempotencyKey (string >= 8 caracteres) en options y en body JSON', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(1);
    const [endpoint, opts] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(endpoint).toBe('/finanzas/cuotas/cuota-1/reportar-pago');

    expect(typeof (opts as any).idempotencyKey).toBe('string');
    expect((opts as any).idempotencyKey.length).toBeGreaterThanOrEqual(8);

    const body = JSON.parse((opts as any).body);
    expect(body.idempotencyKey).toBe((opts as any).idempotencyKey);
  });

  it('C2 · al reintentar tras fallo, el segundo POST lleva exactamente la misma idempotencyKey que el primero', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Error de red simulado')
    );

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    // Primer intento fallido
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [_, opts1] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const key1 = (opts1 as any)?.idempotencyKey;
    const bodyKey1 = JSON.parse((opts1 as any).body)?.idempotencyKey;

    // Segundo intento (reintento del alumno tras ver el error)
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'tx-ok' });
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).toHaveBeenCalledTimes(2);
    const [__, opts2] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const key2 = (opts2 as any)?.idempotencyKey;
    const bodyKey2 = JSON.parse((opts2 as any).body)?.idempotencyKey;

    expect(key1).toBeDefined();
    expect(key2).toBe(key1);
    expect(bodyKey2).toBe(bodyKey1);
  });

  it('C2 · tras un pago confirmado con éxito, el siguiente pago utiliza una idempotencyKey distinta', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    // Primer pago: resuelve 201
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [_, opts1] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const key1 = (opts1 as any)?.idempotencyKey;

    // Siguiente reporte de pago
    act(() => {
      result.current.setMontoOriginal('20.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [__, opts2] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const key2 = (opts2 as any)?.idempotencyKey;

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key2).not.toBe(key1);
  });

  it('C2 · iniciarNuevoPago o iniciarCorreccionPago renuevan la clave de idempotencia', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Fallo inicial')
    );

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [_, opts1] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const key1 = (opts1 as any)?.idempotencyKey;

    // El usuario decide cancelar ese intento e iniciar un nuevo pago desde cero
    act(() => {
      result.current.iniciarNuevoPago();
    });

    act(() => {
      result.current.setMontoOriginal('15.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [__, opts2] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const key2 = (opts2 as any)?.idempotencyKey;

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key2).not.toBe(key1);
  });

  // =========================================================================
  // C3 · Limpieza del temporizador post-éxito de 1800 ms (ALU-07b)
  // =========================================================================
  it('C3 · al desmontar el hook antes de 1800 ms tras éxito, alReportarExito NO se invoca al avanzar los temporizadores', async () => {
    vi.useFakeTimers();
    const alReportarExito = vi.fn();
    const opciones = opcionesBase({ alReportarExito });
    const { result, unmount } = renderHook(() => useReportePago(opciones));

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formSuccess).toBe(
      '¡Pago reportado con éxito! Tu entrenador lo revisará pronto.'
    );
    expect(alReportarExito).not.toHaveBeenCalled();

    // Desmontar a los 500 ms (antes de los 1800 ms)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    unmount();

    // Avanzar el tiempo más allá de los 1800 ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(alReportarExito).not.toHaveBeenCalled();
  });

  it('C3 · si se invoca iniciarNuevoPago antes de 1800 ms, el temporizador pendiente se cancela y no dispara alReportarExito', async () => {
    vi.useFakeTimers();
    const alReportarExito = vi.fn();
    const opciones = opcionesBase({ alReportarExito });
    const { result } = renderHook(() => useReportePago(opciones));

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(alReportarExito).not.toHaveBeenCalled();

    // A los 400 ms el usuario inicia otro pago
    act(() => {
      vi.advanceTimersByTime(400);
      result.current.iniciarNuevoPago();
    });

    // Avanzar el tiempo más allá del temporizador original de 1800 ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(alReportarExito).not.toHaveBeenCalled();
  });

  // =========================================================================
  // C4 · Mensaje honesto ante fallo ambiguo de red o timeout vs error determinista (ALU-07c)
  // =========================================================================
  it('C4 · exporta MENSAJE_ERROR_RED_AMBIGUO_PAGO en pagos-montos con el texto exacto requerido', () => {
    expect((pagosMontos as any).MENSAJE_ERROR_RED_AMBIGUO_PAGO).toBe(
      MENSAJE_ERROR_RED_AMBIGUO_ESPERADO
    );
  });

  it('C4 · fallo ambiguo de red (TypeError) o timeout (ErrorDeConexion/ErrorTiempoAgotado) en el POST asigna MENSAJE_ERROR_RED_AMBIGUO_PAGO a formError', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    // Caso 1: TypeError ('Failed to fetch')
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);

    // Caso 2: Error con name 'ErrorDeConexion'
    const errConexion = new Error('No hay conexión a internet');
    errConexion.name = 'ErrorDeConexion';
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(errConexion);

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);

    // Caso 3: Error con name 'ErrorTiempoAgotado'
    const errTimeout = new Error('Tiempo de espera agotado');
    errTimeout.name = 'ErrorTiempoAgotado';
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(errTimeout);

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);
  });

  it('C4 · error HTTP determinista del servidor muestra el mensaje del API y no el de red ambigua', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    const mensajeServidor =
      'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.';
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error(mensajeServidor)
    );

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe(mensajeServidor);
    expect(result.current.formError).not.toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);
  });

  it('C4 · si la subida previa del comprobante falla por red, formError muestra el error de subida y no el de revisar historial', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    const archivo = new File(['bytes'], 'recibo.png', { type: 'image/png' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Error de conexión al subir el comprobante')
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo] } } as any);
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(apiClient).not.toHaveBeenCalled();
    expect(result.current.formError).not.toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);
    expect(result.current.formError).not.toContain('revisa tu historial');
    expect(result.current.formError).toContain('comprobante');
  });

  // =========================================================================
  // V1..V5 · Tests de Correcciones F1..F5 (UX-22 Validación)
  // =========================================================================
  it('V1 (F1 · RELIABILITY-BLOCK-01) · invocación concurrente a handleReportarPago es bloqueada síncronamente por enVueloRef y ejecuta apiClient una sola vez', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    let resolverPrimerLlamado: ((val: any) => void) | undefined;
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPrimerLlamado = resolve;
        })
    );

    // Lanzar dos llamadas concurrentes seguidas antes de que resuelva la primera
    act(() => {
      void result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
      void result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    // Resolver la primera llamada
    await act(async () => {
      resolverPrimerLlamado?.({ id: 'tx-concurrente' });
    });

    expect(apiClient).toHaveBeenCalledTimes(1);
  });

  it('V3 (F3 · RSK-01 + RELIABILITY-WARN-04) [1/2] · si tras un fallo del POST el alumno modifica datos del pago, el siguiente envío utiliza una idempotencyKey distinta', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Fallo del POST')
    );

    act(() => {
      result.current.setMontoOriginal('40.00');
      result.current.setReferenciaBancaria('111111');
    });

    // Primer intento fallido
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [_, opts1] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const key1 = (opts1 as any)?.idempotencyKey;

    // Modificar monto a '45.00'
    act(() => {
      result.current.setMontoOriginal('45.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [__, opts2] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const key2 = (opts2 as any)?.idempotencyKey;

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key2).not.toBe(key1);

    // Modificar referencia a '999999' tras el fallo
    act(() => {
      result.current.setReferenciaBancaria('999999');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [___, opts3] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[2];
    const key3 = (opts3 as any)?.idempotencyKey;

    expect(key3).toBeDefined();
    expect(key3).not.toBe(key2);
    expect(key3).not.toBe(key1);
  });

  it('V3 (F3 · RSK-01 + RELIABILITY-WARN-04) [2/2] · invocar iniciarCorreccionPago renueva idempotencyKey, descarta comprobante en caché y cancela temporizador pendiente', async () => {
    vi.useFakeTimers();
    const alReportarExito = vi.fn();
    const opciones = opcionesBase({ alReportarExito });
    const { result } = renderHook(() => useReportePago(opciones));

    const archivo1 = new File(['archivo-previo'], 'previo.png', { type: 'image/png' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo1);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/previo.webp'
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo1] } } as any);
      result.current.setMontoOriginal('40.00');
    });

    // Envío exitoso que agenda temporizador a 1800 ms
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    const [_, opts1] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const key1 = (opts1 as any)?.idempotencyKey;
    expect(subirComprobantePago).toHaveBeenCalledTimes(1);

    // Antes de los 1800 ms, invocar iniciarCorreccionPago
    const txRechazada: TransaccionPagoDetalleDTO = {
      id: 'tx-rechazada-1',
      cuotaId: 'cuota-1',
      clienteId: 'alumno-1',
      entrenadorId: 'coach-1',
      registradoPor: 'alumno-1',
      montoOriginal: '35.00',
      monedaOriginal: Moneda.VES,
      tasaCambioFijada: '1.0000',
      montoEquivalenteUsd: '35.00',
      excedenteUsd: '0.00',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: 'REF-RECHAZADA',
      fechaOperacion: '2026-10-02T10:00:00.000Z',
      fechaReporteUtc: '2026-10-02T10:00:00.000Z',
      estadoConciliacion: EstadoConciliacion.RECHAZADO,
      motivoRechazo: 'Comprobante borroso',
      createdAtUtc: '2026-10-02T10:00:00.000Z',
      updatedAtUtc: '2026-10-02T10:00:00.000Z',
    };

    act(() => {
      vi.advanceTimersByTime(400);
      result.current.iniciarCorreccionPago(txRechazada);
    });

    // Verificar que el temporizador de éxito previo quedó cancelado
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(alReportarExito).not.toHaveBeenCalled();

    // Comprobante en caché descartado: al seleccionar otro archivo debe volver a subir
    const archivo2 = new File(['archivo-nuevo'], 'nuevo.png', { type: 'image/png' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo2);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/nuevo.webp'
    );

    act(() => {
      result.current.handleFileChange({ target: { files: [archivo2] } } as any);
    });

    (apiClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'tx-corregida' });
    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(subirComprobantePago).toHaveBeenCalledTimes(2);

    const [__, opts2] = (apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    const key2 = (opts2 as any)?.idempotencyKey;
    const body2 = JSON.parse((opts2 as any).body);

    expect(body2.comprobanteStorageKey).toBe('comprobantes/alumno-1/nuevo.webp');
    expect(key2).toBeDefined();
    expect(key2).not.toBe(key1);
  });

  it('V4 (F4 · RELIABILITY-WARN-02) · cuando cuota es null, handleReportarPago asigna formError sin llamar a prepararComprobanteParaSubida ni subirComprobantePago', async () => {
    const opciones = opcionesBase({ cuota: null });
    const { result } = renderHook(() => useReportePago(opciones));

    const archivo = new File(['bytes-dummy'], 'recibo.png', { type: 'image/png' });
    act(() => {
      result.current.handleFileChange({ target: { files: [archivo] } } as any);
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe(
      'No tienes una cuota vigente para reportar el pago. Contacta a tu entrenador.'
    );
    expect(prepararComprobanteParaSubida).not.toHaveBeenCalled();
    expect(subirComprobantePago).not.toHaveBeenCalled();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('V5 (F5 · RSK-04) · cuando apiClient rechaza con HTTP 504, formError muestra exactamente MENSAJE_ERROR_RED_AMBIGUO_PAGO', async () => {
    const opciones = opcionesBase();
    const { result } = renderHook(() => useReportePago(opciones));

    const error504 = Object.assign(new Error('Gateway Timeout'), {
      name: 'ApiError',
      status: 504,
    });
    (apiClient as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error504);

    act(() => {
      result.current.setMontoOriginal('40.00');
    });

    await act(async () => {
      await result.current.handleReportarPago({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.formError).toBe((pagosMontos as any).MENSAJE_ERROR_RED_AMBIGUO_PAGO);
    expect(result.current.formError).toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);
  });
});
