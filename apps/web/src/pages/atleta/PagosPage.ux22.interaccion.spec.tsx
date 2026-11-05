// @vitest-environment happy-dom
/**
 * Specs de integración UX-22: `PagosPage.tsx`.
 * Contratos:
 * - C1 (ALU-07a): Reutilización de comprobante subido en reintentos ante fallo del POST en `/app/pagos`.
 * - C2 + C4 (ALU-07c, D8): Fallo de red ambiguo (TypeError) muestra MENSAJE_ERROR_RED_AMBIGUO_PAGO en role="alert",
 *   y al reintentar se envía la misma idempotencyKey.
 * - C3 (ALU-07b): Desmontaje de PagosPage tras envío exitoso antes de 1800 ms limpia el temporizador sin callbacks huérfanos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type ResumenFinancieroAlumnoDTO,
  type TasaCambioVigenteDTO,
} from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

const MENSAJE_ERROR_RED_AMBIGUO_ESPERADO =
  'No se pudo confirmar el envío; revisa tu historial antes de repetirlo.';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
};

function resumenConCuota(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: ALUMNO_ID,
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '0.00',
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
    transaccionesTotal: 0,
    transacciones: [],
  };
}

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'a1111111-1111-4111-8111-111111111111',
    email: 'alumno@example.com',
    rol: 'alumno',
    entrenadorId: 'e1111111-1111-4111-8111-111111111111',
    zonaHoraria: 'America/Caracas',
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: authDemo.usuario,
    isDemoMode: authDemo.modoDemo,
  }),
}));

vi.mock('../../lib/comprobante-pago', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/comprobante-pago')>()),
  prepararComprobanteParaSubida: vi.fn(),
  subirComprobantePago: vi.fn(),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { prepararComprobanteParaSubida, subirComprobantePago } from '../../lib/comprobante-pago';
import { PagosPage } from './PagosPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

interface LlamadaReporte {
  endpoint: string;
  opciones: any;
}

let llamadasPostReporteRegistradas: LlamadaReporte[] = [];
let alHacerPostReporte: (endpoint: string, opciones?: any) => Promise<unknown>;

function esEndpointReporte(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/reportar-pago');
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (endpoint.startsWith(`/finanzas/clientes/${ALUMNO_ID}/historial`)) {
    return Promise.resolve(resumenConCuota());
  }
  return Promise.resolve(null);
}

describe('PagosPage · UX-22 (ALU-07, D8)', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    authDemo.modoDemo = false;
    Element.prototype.scrollIntoView = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    llamadasPostReporteRegistradas = [];
    alHacerPostReporte = () => Promise.resolve({ id: 'tx-nueva' });

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();

    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockReset();
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockReset();

    mockApi.mockImplementation((endpoint: string, opciones?: any) => {
      if (opciones?.method === 'POST' && esEndpointReporte(endpoint)) {
        llamadasPostReporteRegistradas.push({ endpoint, opciones });
        return alHacerPostReporte(endpoint, opciones);
      }
      return respuestaGet(endpoint);
    });

    mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
    mockApi.post.mockImplementation((endpoint: string, body?: any, opciones?: any) => {
      if (esEndpointReporte(endpoint)) {
        llamadasPostReporteRegistradas.push({ endpoint, opciones: { ...opciones, body } });
        return alHacerPostReporte(endpoint, { ...opciones, body });
      }
      return Promise.resolve(null);
    });
    mockApi.patch.mockImplementation(() => Promise.resolve(null));
    mockApi.delete.mockImplementation(() => Promise.resolve(null));
    mockApi.put.mockImplementation(() => Promise.resolve(null));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
  });

  it('C4 + C2 · fallo de red ambiguo (TypeError) muestra el banner role="alert" con MENSAJE_ERROR_RED_AMBIGUO_PAGO y reintentar envía la misma idempotencyKey', async () => {
    alHacerPostReporte = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ id: 'tx-exito' });

    render(<PagosPage />);

    // Navegar al formulario de reporte
    fireEvent.click(await screen.findByRole('button', { name: /Reportar pago/i }));
    await screen.findByRole('heading', { name: 'Reportar pago' });

    // Ingresar monto válido
    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    fireEvent.change(inputMonto, { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia bancaria/), { target: { value: '987654' } });

    // Primer envío: falla por red ambigua
    const botonEnviar = screen.getByRole('button', { name: /Enviar comprobante de pago|Informar Pago/i });
    fireEvent.click(botonEnviar);

    // Debe mostrar exactamente el mensaje de red ambigua en el alert
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe(MENSAJE_ERROR_RED_AMBIGUO_ESPERADO);
    expect(llamadasPostReporteRegistradas).toHaveLength(1);

    const llamada1 = llamadasPostReporteRegistradas[0].opciones;
    const body1 = JSON.parse(llamada1.body);
    const key1 = llamada1.idempotencyKey ?? body1.idempotencyKey;
    expect(typeof key1).toBe('string');
    expect(key1.length).toBeGreaterThanOrEqual(8);

    // Segundo envío (el usuario pulsa de nuevo "Enviar comprobante de pago" / "Informar Pago")
    fireEvent.click(screen.getByRole('button', { name: /Enviar comprobante de pago|Informar Pago/i }));

    await screen.findByText(/¡Pago reportado con éxito!/i);
    expect(llamadasPostReporteRegistradas).toHaveLength(2);

    const llamada2 = llamadasPostReporteRegistradas[1].opciones;
    const body2 = JSON.parse(llamada2.body);
    const key2 = llamada2.idempotencyKey ?? body2.idempotencyKey;

    expect(key2).toBe(key1);
    expect(body2.idempotencyKey).toBe(body1.idempotencyKey);
  });

  it('C1 · reintento con comprobante adjunto cuando falla el POST /reportar-pago: la imagen se sube una sola vez a R2', async () => {
    const archivo = new File(['mock-img'], 'recibo.png', { type: 'image/png' });
    (prepararComprobanteParaSubida as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(archivo);
    (subirComprobantePago as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'comprobantes/alumno-1/recibo-1.webp'
    );

    alHacerPostReporte = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fallo temporal 503 en el servidor'))
      .mockResolvedValueOnce({ id: 'tx-ok' });

    render(<PagosPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Reportar pago/i }));
    await screen.findByRole('heading', { name: 'Reportar pago' });

    // Monto
    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    fireEvent.change(inputMonto, { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia bancaria/), { target: { value: '987654' } });

    // Archivo adjunto
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [archivo] } });

    // Primer intento: sube comprobante y falla el POST
    fireEvent.click(screen.getByRole('button', { name: /Enviar comprobante de pago|Informar Pago/i }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Fallo temporal 503');
    expect(prepararComprobanteParaSubida).toHaveBeenCalledTimes(1);
    expect(subirComprobantePago).toHaveBeenCalledTimes(1);

    // Segundo intento (reintento del usuario): NO debe volver a subir la imagen
    fireEvent.click(screen.getByRole('button', { name: /Enviar comprobante de pago|Informar Pago/i }));

    await screen.findByText(/¡Pago reportado con éxito!/i);

    expect(prepararComprobanteParaSubida).toHaveBeenCalledTimes(1);
    expect(subirComprobantePago).toHaveBeenCalledTimes(1);
    expect(llamadasPostReporteRegistradas).toHaveLength(2);

    const body2 = JSON.parse(llamadasPostReporteRegistradas[1].opciones.body);
    expect(body2.comprobanteStorageKey).toBe('comprobantes/alumno-1/recibo-1.webp');
  });

  it('C3 · al desmontar PagosPage tras un envío exitoso antes de 1800 ms, el temporizador se limpia sin errores ni callbacks huérfanos', async () => {
    alHacerPostReporte = vi.fn().mockResolvedValue({ id: 'tx-limpia' });

    const { unmount } = render(<PagosPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Reportar pago/i }));
    await screen.findByRole('heading', { name: 'Reportar pago' });

    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    fireEvent.change(inputMonto, { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia bancaria/), { target: { value: '987654' } });

    vi.useFakeTimers();
    vi.clearAllTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar comprobante de pago|Informar Pago/i }));
    });

    expect(screen.queryByText(/¡Pago reportado con éxito!/i)).not.toBeNull();

    // Avanzar a 500 ms (el temporizador original dura 1800 ms)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Desmontar el componente antes de los 1800 ms
    unmount();

    // El temporizador debe haber sido cancelado (clearTimeout) en el cleanup del componente/hook
    expect(vi.getTimerCount()).toBe(0);

    // Avanzar el tiempo más allá de los 1800 ms: no deben ejecutarse callbacks huérfanos
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
  });

  // =========================================================================
  // V2 · Test de Corrección F2 (UX-22 Validación)
  // =========================================================================
  it('V2 (F2 · RELIABILITY-BLOCK-02) · tras envío exitoso, pulsar "Volver a opciones de pago" antes de 1800 ms cancela el temporizador y la vista permanece en el Hub', async () => {
    alHacerPostReporte = vi.fn().mockResolvedValue({ id: 'tx-exito' });

    render(<PagosPage />);

    // 1. Ir a la vista de reporte desde el Hub
    const botonReportar = await screen.findByRole('button', { name: /Reportar pago/i });
    fireEvent.click(botonReportar);
    await screen.findByRole('heading', { name: 'Reportar pago' });

    // 2. Ingresar monto
    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    fireEvent.change(inputMonto, { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia bancaria/), { target: { value: '987654' } });

    vi.useFakeTimers();
    vi.clearAllTimers();

    // 3. Enviar pago exitoso
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar comprobante de pago|Informar Pago/i }));
    });

    expect(screen.queryByText(/¡Pago reportado con éxito!/i)).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    // 4. A los 400 ms, el alumno pulsa "Volver a opciones de pago" antes de que transcurran los 1800 ms
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const botonVolver = screen.getByRole('button', { name: /Volver a opciones de pago/i });
    await act(async () => {
      fireEvent.click(botonVolver);
    });

    // 5. Regresa al Hub y el temporizador de 1800 ms queda cancelado
    expect(vi.getTimerCount()).toBe(0);

    // 6. Al avanzar el tiempo más allá de los 1800 ms, la vista permanece en el Hub (no cambia a Historial)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: /Reportar pago/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Historial', level: 2 })).toBeNull();
  });
});
