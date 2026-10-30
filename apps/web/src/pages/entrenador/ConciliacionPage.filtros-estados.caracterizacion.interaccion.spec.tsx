// @vitest-environment jsdom
/**
 * Characterization: tray filters, honest states, and receipt viewer (`ConciliacionPage`).
 *
 * Pins the CURRENT behavior: header copy and queue count, search + method chips
 * with the "on this page" scope note, clearing filters, the empty-tray and error
 * with retry states, and the receipt viewer (details bar, original link, actions
 * back into approve/reject, honest placeholder without a digital capture).
 *
 * Mounting mirrors the existing specs (QueryClientProvider + MemoryRouter).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type BandejaConciliacionDTO,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';

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

// Per-test tray contents; `bandejaError` forces the GET to reject (honest error state).
let itemsActuales: TransaccionPagoDetalleDTO[];
let bandejaError: string | null;
const clientesConsulta: QueryClient[] = [];

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint.startsWith('/finanzas/conciliacion/bandeja?')) {
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

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PATCH') return Promise.resolve(null);
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation(() => Promise.resolve(null));
  mockApi.post.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

function montarPagina(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/conciliacion']}>
        <ConciliacionPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function dosMetodos(): TransaccionPagoDetalleDTO[] {
  return [
    txPendiente(),
    txPendiente({
      id: 'tx-2',
      clienteNombre: 'Mariana Pérez',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: 'ZEL-998811',
    }),
  ];
}

describe('ConciliacionPage · caracterizacion: filtros, estados honestos y visor', () => {
  it('f1 · el encabezado y la insignia cuentan la cola actual', async () => {
    montarPagina();
    expect(await screen.findByText('Pagos por validar')).toBeTruthy();
    expect(await screen.findByText('Aprueba o rechaza los pagos que reportan tus alumnos.')).toBeTruthy();
    expect((await screen.findAllByText('1 transacción en cola')).length).toBeGreaterThan(0);
  });

  it('f2 · buscar por alumno filtra la lista y declara el alcance en esta pagina', async () => {
    itemsActuales = dosMetodos();
    montarPagina();
    await screen.findByText('Carlos Mendoza');
    await screen.findByText('Mariana Pérez');

    fireEvent.change(screen.getByLabelText('Buscar pago por alumno o referencia'), {
      target: { value: 'mariana' },
    });

    await waitFor(() => expect(screen.queryByText('Carlos Mendoza')).toBeNull());
    expect(screen.getByText('Mariana Pérez')).toBeTruthy();
    expect(screen.getByText(/en esta página/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy();
  });

  it('f3 · el chip de metodo filtra por metodo y limpiar restaura la lista', async () => {
    itemsActuales = dosMetodos();
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: 'Pago móvil' }));
    await waitFor(() => expect(screen.queryByText('Carlos Mendoza')).toBeNull());
    expect(screen.getByText('Mariana Pérez')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(screen.getByText('Carlos Mendoza')).toBeTruthy());
    expect(screen.getByText('Mariana Pérez')).toBeTruthy();
  });

  it('f4 · sin coincidencias muestra el vacio de filtros con su accion de limpiar', async () => {
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.change(screen.getByLabelText('Buscar pago por alumno o referencia'), {
      target: { value: 'nadie-coincide' },
    });

    expect(await screen.findByText('Sin resultados')).toBeTruthy();
    expect(
      screen.getByText('Ningún pago en cola coincide con la búsqueda o el método seleccionado.')
    ).toBeTruthy();
    const limpiar = screen.getAllByRole('button', { name: 'Limpiar filtros' });
    fireEvent.click(limpiar[limpiar.length - 1]);
    await waitFor(() => expect(screen.getByText('Carlos Mendoza')).toBeTruthy());
  });

  it('f5 · bandeja vacia muestra el estado al dia actual', async () => {
    itemsActuales = [];
    montarPagina();
    expect(await screen.findByText('No hay pagos por validar')).toBeTruthy();
    expect(
      screen.getByText('Cuando un alumno reporte un pago, aparecerá aquí.')
    ).toBeTruthy();
  });

  it('f6 · error de carga muestra el mensaje con reintento que vuelve a pedir la bandeja', async () => {
    bandejaError = 'Fallo de red';
    montarPagina();
    expect(await screen.findByText('Fallo de red')).toBeTruthy();
    const llamadasAntes = mockApi.mock.calls.length;

    bandejaError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Carlos Mendoza');
    expect(mockApi.mock.calls.length).toBeGreaterThan(llamadasAntes);
  });

  it('f7 · "Ver Comprobante" abre el visor con la barra de detalle y el enlace original', async () => {
    itemsActuales = [txPendiente({ comprobanteUrl: 'https://example.com/comprobante.png' })];
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: /^Ver comprobante/ }));
    const visor = await screen.findByRole('dialog');
    expect(visor.textContent).toContain('Comprobante de pago');
    expect(visor.textContent).toContain('Monto declarado');
    expect(visor.textContent).toContain('445566');
    within(visor).getByRole('link', { name: /^Abrir original/ });
    within(visor).getByRole('button', { name: 'Rechazar este pago' });
    within(visor).getByRole('button', { name: 'Aprobar este pago' });
  });

  it('f8 · sin captura digital el visor es honesto y no inventa imagen', async () => {
    montarPagina();
    await screen.findByText('Carlos Mendoza');
    expect(screen.queryByRole('button', { name: 'Ver Comprobante' })).toBeNull();
    expect(screen.getByText('Sin captura digital')).toBeTruthy();
  });

  it('f9 · "Rechazar este pago" del visor cierra el visor y abre el rechazo', async () => {
    itemsActuales = [txPendiente({ comprobanteUrl: 'https://example.com/comprobante.png' })];
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: /^Ver comprobante/ }));
    const visor = await screen.findByRole('dialog');
    fireEvent.click(within(visor).getByRole('button', { name: 'Rechazar este pago' }));

    await waitFor(() =>
      expect(
        screen
          .queryAllByRole('dialog')
          .find((dialogo) => dialogo.textContent?.includes('Rechazar pago'))
      ).not.toBeNull()
    );
    expect(screen.queryByText('Comprobante de pago')).toBeNull();
  });
});
