// @vitest-environment happy-dom
/**
 * RF-007 (lote web): confirmación antes de aprobar en la bandeja de conciliación
 * (`ConciliacionPage`).
 *
 * Fija el contrato: `Aprobar y Descontar Saldo` (tarjeta y visor del comprobante) no llama al API
 * hasta confirmar en un diálogo con el nombre del alumno, el detalle del monto a descontar (más el
 * aviso de excedente cuando aplica) y los botones `Aprobar pago` / `Cancelar`; el PATCH
 * `…/conciliar` sale solo al confirmar, con `{ accion: 'aprobar' }`, una única vez, y mientras el
 * envío está en vuelo el botón queda deshabilitado y el diálogo no se cierra (ni con Escape ni con
 * clic en el fondo).
 *
 * Montaje: mismo patrón que `ConciliacionPage.saldo-favor.interaccion.spec.tsx`
 * (QueryClientProvider + MemoryRouter; el GET de la bandeja devuelve un pago pendiente
 * configurable y el PATCH de conciliación una respuesta o una promesa controlada por test).
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
const TITULO_CONFIRMACION = '¿Aprobar el pago de Carlos Mendoza?';
const DETALLE_BASE = 'Se descontarán 50.00 USD de su cuota.';
const AVISO_EXCEDENTE =
  'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.';

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
    ...overrides,
  };
}

// `vi.hoisted`: modo demo configurable por test; el usuario se mantiene estable entre renders.
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

// Configurables por test: la transacción de la bandeja y la promesa del PATCH (null = resuelve al
// momento con la aprobación por defecto).
let txActual: TransaccionPagoDetalleDTO;
let respuestaPatchPendiente: Promise<unknown> | null;
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

/** Respuesta del PATCH de aprobar: la transacción aprobada sin excedente. */
function respuestaAprobacion(): Record<string, unknown> {
  return {
    transaccion: txPendiente({ estadoConciliacion: EstadoConciliacion.APROBADO }),
    cuota: null,
    mensaje: 'Transacción aprobada y saldo de cuota liquidado exitosamente.',
  };
}

/** Respuesta del PATCH configurada por test o, por defecto, la de aprobación. */
function respuestaPatchActual(): Promise<unknown> {
  return respuestaPatchPendiente ?? Promise.resolve(respuestaAprobacion());
}

/** Cuerpo JSON normalizado (la página puede enviarlo como objeto o como string serializado). */
function cuerpoNormalizado(cuerpo: unknown): unknown {
  if (typeof cuerpo !== 'string') return cuerpo;
  try {
    return JSON.parse(cuerpo);
  } catch {
    return cuerpo;
  }
}

/** PATCH registrados contra el endpoint de conciliación, vengan por `apiClient` o `apiClient.patch`. */
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
  for (const llamada of mockApi.patch.mock.calls) {
    const [endpoint, cuerpo] = llamada as [string, unknown];
    if (endpoint === ENDPOINT_CONCILIAR) {
      resultado.push({ endpoint, cuerpo: cuerpoNormalizado(cuerpo) });
    }
  }
  return resultado;
}

/** Diálogo de confirmación de aprobación (el que titula con el nombre del alumno). */
function dialogoDeAprobacion(): HTMLElement | null {
  return (
    screen
      .queryAllByRole('dialog')
      .find((dialogo) => dialogo.textContent?.includes('¿Aprobar el pago de')) ?? null
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  txActual = txPendiente({ saldoPendienteCuotaUsd: '60.00' });
  respuestaPatchPendiente = null;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation(
    (endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PATCH' && endpoint === ENDPOINT_CONCILIAR) {
        return respuestaPatchActual();
      }
      return respuestaGet(endpoint);
    }
  );
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation((endpoint: string) =>
    endpoint === ENDPOINT_CONCILIAR ? respuestaPatchActual() : Promise.resolve(null)
  );
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

async function esperarTarjeta(): Promise<void> {
  await screen.findByText('Carlos Mendoza');
}

describe('ConciliacionPage · RF-007: confirmar antes de aprobar (contratos 4-6)', () => {
  it('4a · pulsar "Aprobar y Descontar Saldo" en la tarjeta no llama al API y abre el diálogo', async () => {
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));

    // El contrato es explícito: aprobar NO llama al API hasta confirmar en el diálogo.
    expect(llamadasPatch()).toHaveLength(0);
    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());
    const dialogo = dialogoDeAprobacion()!;
    expect(dialogo.textContent).toContain(TITULO_CONFIRMACION);
    expect(dialogo.textContent).toContain(DETALLE_BASE);
    expect(dialogo.textContent).not.toContain('excede la deuda de la cuota');
    within(dialogo).getByRole('button', { name: 'Aprobar pago' });
    within(dialogo).getByRole('button', { name: 'Cancelar' });
  });

  it('4b · con excedente el detalle del diálogo agrega el aviso de saldo a favor', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));

    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());
    expect(dialogoDeAprobacion()!.textContent).toContain(DETALLE_BASE);
    expect(dialogoDeAprobacion()!.textContent).toContain(AVISO_EXCEDENTE);
  });

  it('4c · pulsar "Aprobar y Descontar Saldo" en el visor tampoco llama al API y abre el diálogo', async () => {
    txActual = txPendiente({ comprobanteUrl: 'https://example.com/comprobante.png' });
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: /^Ver comprobante/ }));
    const visor = await screen.findByRole('dialog');
    fireEvent.click(within(visor).getByRole('button', { name: 'Aprobar este pago' }));

    expect(llamadasPatch()).toHaveLength(0);
    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());
    expect(dialogoDeAprobacion()!.textContent).toContain(TITULO_CONFIRMACION);
  });

  it('5a · "Aprobar pago" hace el PATCH con { accion: "aprobar" } y muestra el éxito actual', async () => {
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());

    fireEvent.click(within(dialogoDeAprobacion()!).getByRole('button', { name: 'Aprobar pago' }));

    await waitFor(() => expect(llamadasPatch()).toHaveLength(1));
    expect(llamadasPatch()[0]).toEqual({
      endpoint: ENDPOINT_CONCILIAR,
      cuerpo: { accion: 'aprobar' },
    });
    expect(await screen.findByText('Pago aprobado y descontado de la cuota.')).toBeTruthy();
  });

  it('5b · "Cancelar" cierra el diálogo sin llamar al API', async () => {
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());

    fireEvent.click(within(dialogoDeAprobacion()!).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(dialogoDeAprobacion()).toBeNull());
    expect(llamadasPatch()).toHaveLength(0);
  });

  it('6 · mientras el PATCH está en vuelo el botón de confirmar queda deshabilitado', async () => {
    let resolver!: (valor: unknown) => void;
    respuestaPatchPendiente = new Promise((res) => {
      resolver = res;
    });
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());
    const dialogo = dialogoDeAprobacion()!;

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));

    const confirmar = within(dialogo).getByRole('button', {
      name: 'Aprobar pago',
    }) as HTMLButtonElement;
    await waitFor(() => expect(confirmar.disabled).toBe(true));

    // Se resuelve el envío para no dejar la promesa en vuelo al desmontar.
    resolver(respuestaAprobacion());
    expect(await screen.findByText('Pago aprobado y descontado de la cuota.')).toBeTruthy();
  });

  it('6b · Escape y clic en el fondo durante el PATCH en vuelo no cierran el diálogo', async () => {
    let resolver!: (valor: unknown) => void;
    respuestaPatchPendiente = new Promise((res) => {
      resolver = res;
    });
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    await waitFor(() => expect(dialogoDeAprobacion()).not.toBeNull());
    const dialogo = dialogoDeAprobacion()!;

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));
    await waitFor(() =>
      expect(
        (within(dialogo).getByRole('button', { name: 'Aprobar pago' }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialogoDeAprobacion()).not.toBeNull();

    fireEvent.click(dialogo.parentElement as HTMLElement);
    expect(dialogoDeAprobacion()).not.toBeNull();
    expect(llamadasPatch()).toHaveLength(1);

    // Se resuelve el envío para no dejar la promesa en vuelo al desmontar.
    resolver(respuestaAprobacion());
    expect(await screen.findByText('Pago aprobado y descontado de la cuota.')).toBeTruthy();
  });
});
