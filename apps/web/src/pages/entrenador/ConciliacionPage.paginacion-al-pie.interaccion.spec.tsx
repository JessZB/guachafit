// @vitest-environment jsdom
/**
 * Lote UX-07a · Contrato D: Paginación al pie en ConciliacionPage (COB-12).
 *
 * Requisito:
 * Con dos pagos en la bandeja, el control de paginación aparece DESPUÉS de la última
 * tarjeta en el orden del documento (`compareDocumentPosition`), y DESPUÉS de los filtros.
 * Existe exactamente un solo control de paginación.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type BandejaConciliacionDTO,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';

const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

function txItem(overrides: Partial<TransaccionPagoDetalleDTO> = {}): TransaccionPagoDetalleDTO {
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
    metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
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
let totalActual: number | null = null;
const matchMediaOriginal = typeof window !== 'undefined' ? window.matchMedia : undefined;
const clientesConsulta: QueryClient[] = [];

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint.startsWith('/finanzas/conciliacion/bandeja?')) {
    const bandeja: BandejaConciliacionDTO = {
      items: itemsActuales,
      total: totalActual ?? itemsActuales.length,
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
  totalActual = null;
  itemsActuales = [
    txItem({ id: 'tx-1', clienteNombre: 'Carlos Mendoza' }),
    txItem({ id: 'tx-2', clienteNombre: 'Ana Pérez' }),
  ];
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (matchMediaOriginal) {
    window.matchMedia = matchMediaOriginal;
  } else {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  }
  onlineManager.setOnline(true);
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

describe('ConciliacionPage · Contrato D (COB-12: paginación al pie)', () => {
  it('D · la paginación aparece después de los filtros y después de la última tarjeta en el orden del documento', async () => {
    montarPagina();

    await screen.findByText('Carlos Mendoza');
    await screen.findByText('Ana Pérez');

    const controlesPaginacion = screen.getAllByRole('navigation', { name: 'Paginación' });
    expect(controlesPaginacion).toHaveLength(1);
    const paginacion = controlesPaginacion[0];

    const buscadorFiltros = screen.getByRole('searchbox', {
      name: 'Buscar pago por alumno o referencia',
    });
    const contenedorFiltros = buscadorFiltros.closest('div.rounded-3xl');
    expect(contenedorFiltros).not.toBeNull();

    const encabezadoAna = screen.getByText('Ana Pérez');
    const tarjetaAna = encabezadoAna.closest('div.rounded-3xl');
    expect(tarjetaAna).not.toBeNull();

    // En el orden del DOM, la paginación debe seguir a los filtros
    const sigueAFiltros = Boolean(
      contenedorFiltros!.compareDocumentPosition(paginacion) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(sigueAFiltros).toBe(true);

    // En el orden del DOM, la paginación debe seguir a la última tarjeta (Ana Pérez)
    const sigueAUltimaTarjeta = Boolean(
      tarjetaAna!.compareDocumentPosition(paginacion) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(sigueAUltimaTarjeta).toBe(true);
  });

  it('D2 · pulsar página siguiente llama a scrollIntoView con smooth y cambiar tamaño no lo llama', async () => {
    totalActual = 60;
    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;

    montarPagina();
    await screen.findByText('Carlos Mendoza');

    const botonSiguiente = screen.getByRole('button', { name: 'Página siguiente' });
    fireEvent.click(botonSiguiente);

    expect(scrollMock).toHaveBeenCalledTimes(1);
    expect(scrollMock).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'smooth',
    });

    scrollMock.mockClear();

    const selectorFilas = screen.getByRole('button', { name: /Filas por página/i });
    selectorFilas.focus();
    fireEvent.keyDown(selectorFilas, { key: 'ArrowDown', code: 'ArrowDown' });

    const opcion50 = await screen.findByRole('menuitemradio', { name: '50' });
    fireEvent.click(opcion50);

    expect(scrollMock).not.toHaveBeenCalled();
  });

  it('D3 · con prefers-reduced-motion: reduce el cambio de página llama a scrollIntoView con auto', async () => {
    totalActual = 60;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;

    montarPagina();
    await screen.findByText('Carlos Mendoza');

    const botonSiguiente = screen.getByRole('button', { name: 'Página siguiente' });
    fireEvent.click(botonSiguiente);

    expect(scrollMock).toHaveBeenCalledTimes(1);
    expect(scrollMock).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'auto',
    });
  });
});
