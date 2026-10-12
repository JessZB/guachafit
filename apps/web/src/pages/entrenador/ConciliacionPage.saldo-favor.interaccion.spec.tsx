// @vitest-environment jsdom
/**
 * RF-006 RN-05 (lote web, prompt 01): excedente en la bandeja de conciliación
 * (`ConciliacionPage`).
 *
 * Fija el contrato de la bandeja: la tarjeta avisa del excedente antes de aprobar
 * (`saldoPendienteCuotaUsd`, con `role="note"`), el éxito usa el excedente real del API
 * (`mensajeConExcedente('Pago aprobado y descontado de la cuota.', respuesta.transaccion.excedenteUsd)`)
 * y una respuesta sin `transaccion` (o `null`) cae al mensaje base sin errores.
 *
 * Montaje: `usePaginacionServidor` usa TanStack Query, así que la página se monta dentro de un
 * `QueryClientProvider`; el GET de la bandeja devuelve un pago pendiente configurable por test y
 * el PATCH de conciliación una respuesta configurable (el excedente que traerá el API).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

// Configurables por test: la transacción de la bandeja, el excedente del PATCH y la respuesta
// completa del PATCH. `respuestaPatchAprobacion` en `undefined` = respuesta por defecto, que se
// calcula al momento del PATCH (leyendo `excedenteAprobacion`); `{}` o `null` cubren las
// respuestas sin `transaccion`.
let txActual: TransaccionPagoDetalleDTO;
let excedenteAprobacion: string;
let respuestaPatchAprobacion: Record<string, unknown> | null | undefined;
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

/** Respuesta del PATCH de aprobar: la transacción aprobada con su excedente real. */
function respuestaAprobacion(): Record<string, unknown> {
  return {
    transaccion: txPendiente({
      estadoConciliacion: EstadoConciliacion.APROBADO,
      excedenteUsd: excedenteAprobacion,
    }),
    cuota: null,
    mensaje: 'Transacción aprobada y saldo de cuota liquidado exitosamente.',
  };
}

/** La respuesta configurada por test o, por defecto, la de aprobación calculada en el momento. */
function respuestaPatchActual(): Record<string, unknown> | null {
  return respuestaPatchAprobacion === undefined ? respuestaAprobacion() : respuestaPatchAprobacion;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
  excedenteAprobacion = '0.00';
  respuestaPatchAprobacion = undefined;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PATCH' && endpoint === ENDPOINT_CONCILIAR) {
      return Promise.resolve(respuestaPatchActual());
    }
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation((endpoint: string) =>
    endpoint === ENDPOINT_CONCILIAR ? Promise.resolve(respuestaPatchActual()) : Promise.resolve(null)
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

describe('ConciliacionPage · contrato 6: excedente antes de aprobar y en el éxito', () => {
  it('6a · la tarjeta avisa del excedente antes de aprobar cuando el pago excede la cuota', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
    montarPagina();

    expect(
      await screen.findByText(
        'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.'
      )
    ).toBeTruthy();
  });

  it('6b · sin excedente la tarjeta no muestra el aviso', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '60.00' });
    montarPagina();

    await esperarTarjeta();
    expect(screen.queryByText(/excede la deuda de la cuota/)).toBeNull();
  });

  it('6c · al aprobar con excedente el éxito lo agrega y desaparece el texto anterior', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
    excedenteAprobacion = '10.00';
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y Descontar Saldo' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    expect(
      await screen.findByText(
        'Pago aprobado y descontado de la cuota. 10.00 USD quedaron como saldo a favor del alumno.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Saldo deducido de la deuda maestra/)).toBeNull();
  });

  it('6d · al aprobar sin excedente el éxito es solo el mensaje base', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '60.00' });
    excedenteAprobacion = '0.00';
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y Descontar Saldo' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    expect(await screen.findByText('Pago aprobado y descontado de la cuota.')).toBeTruthy();
    expect(screen.queryByText(/quedaron como saldo a favor/)).toBeNull();
  });

  it('6e · el aviso del excedente es una nota (role="note")', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
    montarPagina();

    const nota = await screen.findByRole('note');
    expect(nota.textContent).toContain(
      'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.'
    );
  });

  it('6f · aprobar sin transaccion en la respuesta deja el mensaje base sin errores', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '60.00' });
    respuestaPatchAprobacion = {};
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y Descontar Saldo' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    expect(await screen.findByText('Pago aprobado y descontado de la cuota.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('6g · aprobar con respuesta null deja el mensaje base sin errores', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '60.00' });
    respuestaPatchAprobacion = null;
    montarPagina();
    await esperarTarjeta();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y Descontar Saldo' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    expect(await screen.findByText('Pago aprobado y descontado de la cuota.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('6h · modo demo: la bandeja no inventa aviso de excedente ni saldo a favor', async () => {
    authDemo.modoDemo = true;
    montarPagina();

    expect(await screen.findByText('Carlos Mendoza')).toBeTruthy();
    expect(screen.queryByText(/excede la deuda de la cuota/)).toBeNull();
    expect(screen.queryByText(/saldo a favor/)).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
    // La cola demo sale del fixture local: la bandeja no llama al API. Aprobar/rechazar en demo
    // sí llama hoy (H6, seguimiento aparte), por eso este test no pulsa esos botones.
    expect(mockApi).not.toHaveBeenCalled();
  });
});
