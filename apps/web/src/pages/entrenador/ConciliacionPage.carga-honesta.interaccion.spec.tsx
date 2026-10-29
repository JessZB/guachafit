// @vitest-environment jsdom
/**
 * Lote UX-05 · Contrato B: Conciliación honesta (carga, vacío, errores, recarga y afirmaciones).
 *
 * Requisitos:
 * - B1: Carga inicial honesta (role="status" 'Cargando la bandeja de pagos', sin 'Bandeja al Día', sin chip '... en cola').
 * - B2: Vacío real ('Bandeja al Día' y '0 transacciones en cola').
 * - B3: Error sin datos (role="alert" con 'No pudimos cargar la bandeja', mensaje de red y Reintentar de 44px).
 * - B4: Recarga fallida con datos (conserva tarjetas, role="alert" con aviso honesto de recarga y Reintentar).
 * - B5: Sin conexión con datos (conserva tarjetas, no pinta alerta de recarga, muestra AvisoDatosOffline).
 * - B6: Sin afirmaciones falsas (no contiene 'comprobante verificado' con o sin comprobante).
 * - B7: ErrorBandejaConciliacion.tsx eliminada (import.meta.glob retorna 0 claves).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type BandejaConciliacionDTO,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

function txPendiente(overrides: Partial<TransaccionPagoDetalleDTO> = {}): TransaccionPagoDetalleDTO {
  return {
    id: 'tx-1',
    cuotaId: 'cuota-1',
    clienteId: 'cli-1',
    entrenadorId: COACH_ID,
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
    ...overrides,
  };
}

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'e1111111-1111-4111-8111-111111111111',
    email: 'coach@example.com',
    rol: 'entrenador',
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
import { ConciliacionPage } from './ConciliacionPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

let itemsActuales: TransaccionPagoDetalleDTO[];
let bandejaError: string | null;
let bandejaPromesaPendiente: Promise<unknown> | null;
const clientesConsulta: QueryClient[] = [];

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => enLinea,
  });
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint.startsWith('/finanzas/conciliacion/bandeja?')) {
    if (bandejaPromesaPendiente) return bandejaPromesaPendiente;
    if (bandejaError) return Promise.reject(new Error(bandejaError));
    const bandeja: BandejaConciliacionDTO = {
      items: itemsActuales,
      total: itemsActuales.length,
      limit: 25,
      offset: 0,
    };
    return Promise.resolve(bandeja);
  }
  return Promise.resolve(null);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  itemsActuales = [txPendiente()];
  bandejaError = null;
  bandejaPromesaPendiente = null;
  simularConexion(true);
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PATCH' || (typeof endpoint === 'string' && endpoint.includes('/conciliar'))) {
      return Promise.resolve({ transaccion: { excedenteUsd: '0.00' } });
    }
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation(() => Promise.resolve({ transaccion: { excedenteUsd: '0.00' } }));
  mockApi.post.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  simularConexion(true);
  onlineManager.setOnline(true);
  window.dispatchEvent(new Event('online'));
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

function montarPagina(): void {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'always' } },
  });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/conciliacion']}>
        <ConciliacionPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ConciliacionPage · Carga honesta (Contrato B)', () => {
  it('B1 · carga inicial: estado honesto sin Bandeja al Día ni contador de cola ficticio', () => {
    bandejaPromesaPendiente = new Promise(() => {});
    montarPagina();

    // 1. Hay un role="status" con texto/nombre 'Cargando la bandeja de pagos'
    const estados = screen.queryAllByRole('status');
    const estadoCarga = estados.find((el) => /Cargando la bandeja de pagos/i.test(el.textContent ?? ''));
    expect(estadoCarga).toBeTruthy();

    // 2. No aparece 'Bandeja al Día'
    expect(screen.queryByText(/Bandeja al Día/i)).toBeNull();

    // 3. No muestra ningún texto "... en cola"
    expect(screen.queryByText(/en cola/i)).toBeNull();
  });

  it('B2 · vacío real: con respuesta vacía aparece "Bandeja al Día" y "0 transacciones en cola"', async () => {
    itemsActuales = [];
    montarPagina();

    expect(await screen.findByText('Bandeja al Día')).toBeTruthy();
    expect(await screen.findByText('0 transacciones en cola')).toBeTruthy();
  });

  it('B3 · error sin datos: alerta accesible con reintento de 44px que vuelve a pedir la bandeja', async () => {
    bandejaError = 'Fallo de red';
    montarPagina();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No pudimos cargar la bandeja');
    expect(alerta.textContent).toContain('Fallo de red');

    const botonReintentar = within(alerta).getByRole('button', { name: 'Reintentar' });
    expect(botonReintentar).toBeTruthy();
    const clasesBoton = (botonReintentar.getAttribute('class') ?? '').split(/\s+/);
    expect(clasesBoton).toContain('min-h-11');

    expect(screen.queryByText(/Bandeja al Día/i)).toBeNull();

    // Al pulsar Reintentar vuelve a solicitar la bandeja
    bandejaError = null;
    itemsActuales = [txPendiente({ clienteNombre: 'Carlos Mendoza' })];
    fireEvent.click(botonReintentar);

    expect(await screen.findByText('Carlos Mendoza')).toBeTruthy();
  });

  it('B4 · recarga fallida con datos: conserva tarjetas y muestra alerta de recarga con reintento', async () => {
    itemsActuales = [txPendiente({ clienteNombre: 'Carlos Mendoza' })];
    montarPagina();

    await screen.findByText('Carlos Mendoza');

    // Provocar recarga fallida tras aprobar pago
    bandejaError = 'Fallo al recargar bandeja';
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));

    // Conserva la tarjeta visible
    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeTruthy();
    });

    // Muestra alerta accesible de recarga
    const alertas = await screen.findAllByRole('alert');
    const alertaRecarga = alertas.find((a) =>
      a.textContent?.includes('No se pudo actualizar la bandeja. Los pagos mostrados pueden estar desactualizados.')
    );
    expect(alertaRecarga).toBeTruthy();
    if (alertaRecarga) {
      expect(within(alertaRecarga).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    }
  });

  it('B5 · sin conexión con datos: conserva tarjetas, omite alerta de recarga y muestra AvisoDatosOffline', async () => {
    itemsActuales = [txPendiente({ clienteNombre: 'Carlos Mendoza' })];
    montarPagina();

    await screen.findByText('Carlos Mendoza');

    // Desconectar antes de la recarga
    simularConexion(false);
    window.dispatchEvent(new Event('offline'));

    bandejaError = 'Fallo de red';
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));

    // Tarjeta se conserva
    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeTruthy();
    });

    // No debe aparecer la alerta de fallo de recarga en offline
    expect(screen.queryByText(/No se pudo actualizar la bandeja/i)).toBeNull();

    // Debe aparecer AvisoDatosOffline (role="status" con "Sin conexión" y "datos guardados")
    const estados = await screen.findAllByRole('status');
    const avisoOffline = estados.find(
      (el) => el.textContent?.includes('Sin conexión') && el.textContent?.includes('datos guardados')
    );
    expect(avisoOffline).toBeTruthy();
  });

  it('B6 · sin afirmaciones falsas: el texto "comprobante verificado" no aparece en ninguna tarjeta', async () => {
    itemsActuales = [
      txPendiente({ id: 'tx-1', clienteNombre: 'Carlos Mendoza', comprobanteUrl: 'https://example.com/comprobante.png' }),
      txPendiente({ id: 'tx-2', clienteNombre: 'Mariana Pérez', comprobanteUrl: null }),
    ];
    montarPagina();

    await screen.findByText('Carlos Mendoza');
    await screen.findByText('Mariana Pérez');

    const textoPagina = (document.body.textContent ?? '').toLowerCase();
    expect(textoPagina).not.toContain('comprobante verificado');
  });

  it('B7 · ErrorBandejaConciliacion ya no existe en el proyecto (copia eliminada)', () => {
    const archivos = import.meta.glob('../../components/entrenador/conciliacion/ErrorBandejaConciliacion.tsx');
    expect(Object.keys(archivos)).toHaveLength(0);
  });

  it('B8 · sin conexión y sin datos: muestra AvisoDatosOffline "sin-datos" y no el error genérico', async () => {
    simularConexion(false);
    bandejaError = 'Fallo de red';
    montarPagina();

    await waitFor(async () => {
      const estados = await screen.findAllByRole('status');
      const avisoSinDatos = estados.find((el) =>
        el.textContent?.includes('Sin conexión y sin datos guardados')
      );
      expect(avisoSinDatos).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/No pudimos cargar la bandeja/i)).toBeNull();
  });
});
