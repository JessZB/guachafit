// @vitest-environment jsdom
/**
 * 01 · UX-09b · ConciliacionPage con búsqueda inicial desde ?q= (Contrato C3).
 *
 * C3: Con la entrada /coach/conciliacion?q=Carlos, el campo de búsqueda de la bandeja
 * tiene el valor 'Carlos' y solo se listan las transacciones de Carlos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

let itemsActuales: TransaccionPagoDetalleDTO[];
const clientesConsulta: QueryClient[] = [];

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint.startsWith('/finanzas/conciliacion/bandeja?')) {
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
  itemsActuales = [
    txPendiente({ id: 'tx-1', clienteNombre: 'Carlos Mendoza' }),
    txPendiente({ id: 'tx-2', clienteNombre: 'Mariana Pérez', metodoPago: MetodoPago.PAGO_MOVIL }),
  ];

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

function SondaUbicacion() {
  const location = useLocation();
  return <div data-testid="sonda-ubicacion">{location.search}</div>;
}

function montarPagina(entrada = '/coach/conciliacion?q=Carlos'): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[entrada]}>
        <SondaUbicacion />
        <ConciliacionPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Contrato C3–C6 · ConciliacionPage con búsqueda inicial desde URL (?q=)', () => {
  it('C3 · con /coach/conciliacion?q=Carlos inicializa el input en "Carlos" y solo lista transacciones de Carlos', async () => {
    montarPagina('/coach/conciliacion?q=Carlos');

    const inputBusqueda = (await screen.findByLabelText(
      'Buscar pago por alumno o referencia'
    )) as HTMLInputElement;

    expect(inputBusqueda.value).toBe('Carlos');
    expect(await screen.findByText('Carlos Mendoza')).toBeTruthy();
    expect(screen.queryByText('Mariana Pérez')).toBeNull();
  });

  it('C4 · con /coach/conciliacion?q=Carlos&otro=1 tras montar input tiene "Carlos", solo lista Carlos y location.search es "?otro=1"', async () => {
    montarPagina('/coach/conciliacion?q=Carlos&otro=1');

    const inputBusqueda = (await screen.findByLabelText(
      'Buscar pago por alumno o referencia'
    )) as HTMLInputElement;

    expect(inputBusqueda.value).toBe('Carlos');
    expect(await screen.findByText('Carlos Mendoza')).toBeTruthy();
    expect(screen.queryByText('Mariana Pérez')).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('sonda-ubicacion').textContent).toBe('?otro=1');
    });
  });

  it('C5 · con la misma entrada, tras pulsar "Limpiar filtros" el campo queda vacío y location.search no contiene q', async () => {
    montarPagina('/coach/conciliacion?q=Carlos&otro=1');

    const inputBusqueda = (await screen.findByLabelText(
      'Buscar pago por alumno o referencia'
    )) as HTMLInputElement;

    expect(inputBusqueda.value).toBe('Carlos');

    const botonLimpiar = await screen.findByRole('button', { name: 'Limpiar filtros' });
    fireEvent.click(botonLimpiar);

    expect(inputBusqueda.value).toBe('');
    expect(await screen.findByText('Carlos Mendoza')).toBeTruthy();
    expect(await screen.findByText('Mariana Pérez')).toBeTruthy();

    await waitFor(() => {
      const search = screen.getByTestId('sonda-ubicacion').textContent;
      expect(search).not.toContain('q');
      expect(search).toBe('?otro=1');
    });
  });

  it('C6 · sin ?q=, location.search no cambia', async () => {
    montarPagina('/coach/conciliacion?otro=1');

    await screen.findByLabelText('Buscar pago por alumno o referencia');

    expect(screen.getByTestId('sonda-ubicacion').textContent).toBe('?otro=1');
  });
});
