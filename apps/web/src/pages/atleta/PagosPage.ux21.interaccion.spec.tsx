// @vitest-environment jsdom
/**
 * Specs de integración UX-21: `PagosPage.tsx`.
 * Cubre contratos C5 (selector accesible), C6 (corregir y reenviar), C7 (type="button") y C1/C3 (integración).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const INSTANTE_FALSO = '2026-10-11T12:00:00-04:00';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
};

type TransaccionResumen = ResumenFinancieroAlumnoDTO['transacciones'][number];

const txRechazadaBase: TransaccionResumen = {
  id: 'tx-rechazada-01',
  cuotaId: 'cuota-1',
  montoUsd: '75.00',
  metodoPago: MetodoPago.ZELLE,
  referencia: 'ZELLE-778899',
  estado: EstadoConciliacion.RECHAZADO,
  motivoReversion: null,
  createdAtUtc: '2026-10-09T14:00:00.000Z',
};

function resumenConTxRechazada(tx: TransaccionResumen = txRechazadaBase): ResumenFinancieroAlumnoDTO {
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
    transaccionesTotal: 1,
    transacciones: [tx],
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

let txHistorialPersonalizada: TransaccionResumen | null = null;
let alHacerPostReporte: () => Promise<unknown>;

function esEndpointReporte(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/reportar-pago');
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (endpoint.startsWith(`/finanzas/clientes/${ALUMNO_ID}/historial`)) {
    return Promise.resolve(
      txHistorialPersonalizada ? resumenConTxRechazada(txHistorialPersonalizada) : resumenConTxRechazada()
    );
  }
  return Promise.resolve(null);
}

function llamadasPostReporte(): unknown[][] {
  const viaHelper = mockApi.post.mock.calls.filter(([endpoint]) => esEndpointReporte(endpoint));
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      esEndpointReporte(endpoint) &&
      (opciones as { method?: string } | undefined)?.method === 'POST'
  );
  return [...viaHelper, ...viaCallable];
}

function montarPagina(): void {
  render(<PagosPage />);
}

describe('PagosPage · UX-21 (C1, C3, C5, C6, C7)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_FALSO));
    authDemo.modoDemo = false;
    txHistorialPersonalizada = null;
    Element.prototype.scrollIntoView = vi.fn();
    alHacerPostReporte = () => Promise.resolve({ id: 'tx-nueva' });

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'POST' && esEndpointReporte(endpoint)) return alHacerPostReporte();
      return respuestaGet(endpoint);
    });
    mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
    mockApi.post.mockImplementation((endpoint: string) =>
      esEndpointReporte(endpoint) ? alHacerPostReporte() : Promise.resolve(null)
    );
    mockApi.patch.mockImplementation(() => Promise.resolve(null));
    mockApi.delete.mockImplementation(() => Promise.resolve(null));
    mockApi.put.mockImplementation(() => Promise.resolve(null));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('C5 · SelectorAccionesPagos: \'Reportar un nuevo abono o pago\' se activa con la tecla Espacio', async () => {
    montarPagina();
    const boton = await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/i });
    fireEvent.keyDown(boton, { key: ' ' });

    expect(await screen.findByText('Reportar Abono o Cuota')).toBeTruthy();
  });

  it('C5 · SelectorAccionesPagos: \'Ver recibos e historial\' se activa con la tecla Espacio', async () => {
    montarPagina();
    const boton = await screen.findByRole('button', { name: /Ver recibos e historial/i });
    fireEvent.keyDown(boton, { key: ' ' });

    expect(await screen.findByText('Historial de Pagos y Recibos')).toBeTruthy();
  });

  it('C7 · PestanaReportePago: el botón \'Volver a opciones de pago\' tiene type="button"', async () => {
    montarPagina();
    fireEvent.click(await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/i }));

    const botonVolver = await screen.findByRole('button', { name: /Volver a opciones de pago/i });
    expect(botonVolver.getAttribute('type')).toBe('button');
  });

  it('C7 · PestanaHistorialPagos: los botones \'Volver a opciones de pago\' y \'Nuevo Abono\' tienen type="button"', async () => {
    montarPagina();
    fireEvent.click(await screen.findByRole('button', { name: /Ver recibos e historial/i }));

    const botonVolver = await screen.findByRole('button', { name: /Volver a opciones de pago/i });
    const botonNuevoAbono = await screen.findByRole('button', { name: /Nuevo Abono/i });

    expect(botonVolver.getAttribute('type')).toBe('button');
    expect(botonNuevoAbono.getAttribute('type')).toBe('button');
  });

  it('C3 · PestanaReportePago: cuando hay error de envío/API (formError), el contenedor tiene role="alert"', async () => {
    alHacerPostReporte = () => Promise.reject(new Error('Error de conexión bancaria'));
    montarPagina();
    fireEvent.click(await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/i }));

    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') ?? inputs[0];
    fireEvent.change(inputMonto, { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Referencia Bancaria/), { target: { value: '987654' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Error de conexión bancaria');
  });

  it('C6 · FilaTransaccionPago + PagosPage: pulsar \'Corregir y Reenviar\' en un pago rechazado conmuta a \'nuevo-pago\' y prellena el monto', async () => {
    montarPagina();
    fireEvent.click(await screen.findByRole('button', { name: /Ver recibos e historial/i }));

    const botonCorregir = await screen.findByRole('button', { name: 'Corregir y Reenviar' });
    fireEvent.click(botonCorregir);

    expect(await screen.findByText('Reportar Abono o Cuota')).toBeTruthy();

    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    expect(inputMonto.value).toBe('75.00');
  });

  it('C6 · Integración PagosPage: \'Corregir y Reenviar\' prellena método, moneda, monto, referencia y fecha en el formulario', async () => {
    txHistorialPersonalizada = {
      ...txRechazadaBase,
      metodoPago: MetodoPago.BINANCE_USDT,
      montoUsd: '120.50',
      referencia: 'BINANCE-998877',
      createdAtUtc: '2026-10-08T15:00:00.000Z',
    };

    montarPagina();
    fireEvent.click(await screen.findByRole('button', { name: /Ver recibos e historial/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir y Reenviar' }));

    await screen.findByText('Reportar Abono o Cuota');

    const selectMetodo = document.querySelectorAll('select')[0] as HTMLSelectElement;
    const selectMoneda = document.querySelectorAll('select')[1] as HTMLSelectElement;
    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    const inputRef = Array.from(inputs).find((i) => i.getAttribute('placeholder')?.includes('Ej:')) as HTMLInputElement;
    const inputFecha = document.querySelector('input[type="date"]') as HTMLInputElement;

    expect(selectMetodo.value).toBe(MetodoPago.BINANCE_USDT);
    expect(selectMoneda.value).toBe(Moneda.USD);
    expect(inputMonto.value).toBe('120.50');
    expect(inputRef.value).toBe('BINANCE-998877');
    expect(inputFecha.value).toBe('2026-10-08');
  });

  it('C1 · Integración PagosPage: el formulario arranca con monto vacío (\'\') y bloquea el envío sin llamar a la API', async () => {
    montarPagina();
    fireEvent.click(await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/i }));

    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') as HTMLInputElement;
    expect(inputMonto.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));

    expect(await screen.findByText('Ingresa un monto válido mayor a 0.')).toBeTruthy();
    expect(llamadasPostReporte()).toHaveLength(0);
  });
});
