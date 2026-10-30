// @vitest-environment jsdom
/**
 * Characterization: rejection flow of the conciliation tray (`ConciliacionPage`).
 *
 * Pins the CURRENT behavior: opening the rejection dialog from the card, the
 * required reason (confirm stays disabled while empty), the PATCH payload
 * `{ accion: 'rechazar', motivoRechazo }`, the success copy, and the honest
 * error path (alert, dialog stays open) when the PATCH fails.
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
const ENDPOINT_CONCILIAR = '/finanzas/transacciones/tx-1/conciliar';
const MOTIVO = 'La referencia no coincide con el extracto.';

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

let txActual: TransaccionPagoDetalleDTO;
let fallaPatch: string | null;
const clientesConsulta: QueryClient[] = [];

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint.startsWith('/finanzas/conciliacion/bandeja?')) {
    const bandeja: BandejaConciliacionDTO = {
      items: [txActual],
      total: 1,
      limit: 25,
      offset: 0,
    };
    return Promise.resolve(bandeja);
  }
  return Promise.resolve(null);
}

function cuerpoNormalizado(cuerpo: unknown): unknown {
  if (typeof cuerpo !== 'string') return cuerpo;
  try {
    return JSON.parse(cuerpo);
  } catch {
    return cuerpo;
  }
}

function llamadasPatch(): Array<{ endpoint: string; cuerpo: unknown }> {
  const resultado: Array<{ endpoint: string; cuerpo: unknown }> = [];
  for (const llamada of mockApi.mock.calls) {
    const [endpoint, opciones] = llamada as [
      string,
      { method?: string; body?: unknown } | undefined,
    ];
    if (endpoint === ENDPOINT_CONCILIAR && opciones?.method === 'PATCH') {
      resultado.push({ endpoint, cuerpo: cuerpoNormalizado(opciones.body) });
    }
  }
  return resultado;
}

function dialogoDeRechazo(): HTMLElement | null {
  return (
    screen
      .queryAllByRole('dialog')
      .find((dialogo) => dialogo.textContent?.includes('Rechazar pago')) ?? null
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  txActual = txPendiente();
  fallaPatch = null;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PATCH' && endpoint === ENDPOINT_CONCILIAR) {
      return fallaPatch ? Promise.reject(new Error(fallaPatch)) : Promise.resolve(null);
    }
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

async function abrirRechazo(): Promise<HTMLElement> {
  montarPagina();
  await screen.findByText('Carlos Mendoza');
  fireEvent.click(screen.getByRole('button', { name: 'Rechazar pago de Carlos Mendoza' }));
  await waitFor(() => expect(dialogoDeRechazo()).not.toBeNull());
  return dialogoDeRechazo()!;
}

describe('ConciliacionPage · caracterizacion: rechazo con motivo', () => {
  it('r1 · "Rechazar con Motivo" abre el dialogo sin llamar al API', async () => {
    const dialogo = await abrirRechazo();
    expect(llamadasPatch()).toHaveLength(0);
    expect(dialogo.textContent).toContain('Rechazar pago');
    within(dialogo).getByRole('button', { name: 'Confirmar rechazo' });
    within(dialogo).getByRole('button', { name: 'Cancelar' });
  });

  it('r2 · "Confirmar Rechazo" empieza deshabilitado y se habilita con motivo', async () => {
    const dialogo = await abrirRechazo();
    const confirmar = within(dialogo).getByRole('button', {
      name: 'Confirmar rechazo',
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(
      within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/),
      { target: { value: MOTIVO } }
    );
    expect(
      (within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('r3 · confirmar hace el PATCH con accion rechazar y muestra el exito actual', async () => {
    const dialogo = await abrirRechazo();
    fireEvent.change(
      within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/),
      { target: { value: MOTIVO } }
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => expect(llamadasPatch()).toHaveLength(1));
    expect(llamadasPatch()[0]).toEqual({
      endpoint: ENDPOINT_CONCILIAR,
      cuerpo: { accion: 'rechazar', motivoRechazo: MOTIVO },
    });
    expect(
      await screen.findByText('Transacción rechazada con observaciones notificadas al alumno.')
    ).toBeTruthy();
    await waitFor(() => expect(dialogoDeRechazo()).toBeNull());
  });

  it('r4 · "Cancelar" cierra el dialogo sin llamar al API', async () => {
    const dialogo = await abrirRechazo();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(dialogoDeRechazo()).toBeNull());
    expect(llamadasPatch()).toHaveLength(0);
  });

  it('r5 · si el PATCH falla muestra alerta honesta y el dialogo sigue abierto', async () => {
    fallaPatch = 'Fallo al rechazar';
    const dialogo = await abrirRechazo();
    fireEvent.change(
      within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/),
      { target: { value: MOTIVO } }
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('Fallo al rechazar');
    expect(dialogoDeRechazo()).not.toBeNull();
  });
});
