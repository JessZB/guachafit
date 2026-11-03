// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const INSTANTE_FALSO = '2026-11-03T12:00:00-04:00';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-11-03T12:00:00.000Z',
};

type TransaccionResumen = ResumenFinancieroAlumnoDTO['transacciones'][number];

const txNueva: TransaccionResumen = {
  id: 'tx-nueva-01',
  cuotaId: 'cuota-1',
  montoUsd: '40.00',
  metodoPago: MetodoPago.PAGO_MOVIL,
  referencia: 'REF-REVUX-123456',
  estado: EstadoConciliacion.PENDIENTE,
  motivoReversion: null,
  createdAtUtc: '2026-11-03T12:00:00.000Z',
};

function resumenInicial(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: ALUMNO_ID,
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '0.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-11',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-11-10T03:59:59.999Z',
    },
    transaccionesTotal: 0,
    transacciones: [],
  };
}

function resumenConPagoNuevo(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: ALUMNO_ID,
    saldoPendienteTotalUsd: '0.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '40.00',
    totalPagadoMesActualUsd: '40.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-11',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '40.00',
      saldoPendienteUsd: '0.00',
      estado: 'pagada',
      fechaVencimiento: '2026-11-10T03:59:59.999Z',
    },
    transaccionesTotal: 1,
    transacciones: [txNueva],
  };
}

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'a1111111-1111-4111-8111-111111111111',
    email: 'alumno@example.com',
    rol: 'alumno',
    entrenadorId: 'e1111111-1111-4111-8111-111111111111',
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: authDemo.usuario,
    isDemoMode: authDemo.modoDemo,
  }),
}));

vi.mock('../../lib/comprobante-pago', () => ({
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
import { PagosPage } from './PagosPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

let reporteCompletado = false;

function esEndpointReporte(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/reportar-pago');
}

function esEndpointHistorial(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.includes(`/finanzas/clientes/${ALUMNO_ID}/historial`);
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (esEndpointHistorial(endpoint)) {
    return Promise.resolve(reporteCompletado ? resumenConPagoNuevo() : resumenInicial());
  }
  return Promise.resolve(null);
}

describe('PagosPage · REVUX (G1a, G1b)', () => {
  beforeEach(() => {
    authDemo.modoDemo = false;
    reporteCompletado = false;
    Element.prototype.scrollIntoView = vi.fn();

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'POST' && esEndpointReporte(endpoint)) {
        reporteCompletado = true;
        return Promise.resolve({ id: 'tx-nueva-01' });
      }
      return respuestaGet(endpoint);
    });
    mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
    mockApi.post.mockImplementation((endpoint: string) => {
      if (esEndpointReporte(endpoint)) {
        reporteCompletado = true;
        return Promise.resolve({ id: 'tx-nueva-01' });
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('R6: tras un envío exitoso, antes del cambio de vista, la confirmación está en un role="status" y contiene el mensaje de éxito', async () => {
    render(<PagosPage />);

    // Abrir formulario
    const botonReportar = await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/i });
    fireEvent.click(botonReportar);
    await screen.findByText('Reportar Abono o Cuota');

    // Escribir monto
    const inputMonto = Array.from(document.querySelectorAll('input')).find(
      (i) => i.getAttribute('inputmode') === 'decimal'
    ) as HTMLInputElement;
    fireEvent.change(inputMonto, { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia Bancaria/), { target: { value: '987654' } });

    // Enviar formulario
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar Comprobante de Pago/i }));
    });

    // Antes de los 1800 ms, la confirmación está en un role="status"
    const status = screen.getByRole('status');
    expect(status).not.toBeNull();
    expect(status.textContent).toContain('¡Pago reportado con éxito! Tu entrenador lo revisará pronto.');
  });

  it('R1: tras reportar pago con éxito y avanzar 1800 ms, se recarga el historial y el nuevo pago aparece en pantalla', async () => {
    render(<PagosPage />);

    // Esperar carga inicial
    const botonReportar = await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/i });

    const contarLlamadasHistorial = () =>
      mockApi.mock.calls.filter(([ep]) => esEndpointHistorial(ep)).length +
      mockApi.get.mock.calls.filter(([ep]) => esEndpointHistorial(ep)).length;

    const llamadasAntes = contarLlamadasHistorial();
    expect(llamadasAntes).toBeGreaterThan(0);

    // Abrir formulario
    fireEvent.click(botonReportar);
    await screen.findByText('Reportar Abono o Cuota');

    // Escribir monto y referencia
    const inputMonto = Array.from(document.querySelectorAll('input')).find(
      (i) => i.getAttribute('inputmode') === 'decimal'
    ) as HTMLInputElement;
    fireEvent.change(inputMonto, { target: { value: '40.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia Bancaria/), { target: { value: '987654' } });

    vi.useFakeTimers();
    vi.clearAllTimers();

    // Enviar pago
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar Comprobante de Pago/i }));
    });

    expect(screen.getByRole('status')).not.toBeNull();

    // Avanzar temporizador 1800 ms para detonar alReportarExito (cambio a historial + cargarDatos)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    vi.useRealTimers();

    // El endpoint de historial se volvió a llamar (más llamadas que antes)
    const llamadasDespues = contarLlamadasHistorial();
    expect(llamadasDespues).toBeGreaterThan(llamadasAntes);

    // Con la nueva respuesta, el pago aparece en el historial
    expect(await screen.findByText(/REF-REVUX-123456/)).not.toBeNull();
  });
});
