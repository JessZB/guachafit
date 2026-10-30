// @vitest-environment jsdom
/**
 * 01 · UX-08 · ConciliacionPage: feedback y avisos de aprobación/rechazo (Contrato D).
 *
 * Requisitos:
 * - D1: Éxito anunciado: mensaje de éxito en role="status", botón "Cerrar aviso" (min-h-11) lo retira.
 * - D2: Tiempo de vida:
 *       - sin excedente: sigue visible a los 3 s y desaparece pasados 8 s.
 *       - con excedente: sigue visible a los 10 s y solo se va con "Cerrar aviso".
 * - D3: Sin temporizadores huérfanos: desmontar la página con éxito visible y avanzar timers
 *       no produce avisos de React sobre setState en unmounted.
 * - D4: Error viejo limpio: tras aprobación fallida, abrir rechazo retira la alerta;
 *       aprobación correcta posterior no coexiste con la alerta vieja.
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
let itemsBandeja: TransaccionPagoDetalleDTO[] | null = null;
let excedenteAprobacion: string;
let respuestaPatchAprobacion: Record<string, unknown> | null | undefined;
const clientesConsulta: QueryClient[] = [];

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint.startsWith('/finanzas/conciliacion/bandeja?')) {
    const items = itemsBandeja ?? [txActual];
    const bandeja: BandejaConciliacionDTO = {
      items,
      total: items.length,
      limit: 25,
      offset: 0,
    };
    return Promise.resolve(bandeja);
  }
  return Promise.resolve(null);
}

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

function respuestaPatchActual(): Record<string, unknown> | null {
  return respuestaPatchAprobacion === undefined ? respuestaAprobacion() : respuestaPatchAprobacion;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
  itemsBandeja = null;
  excedenteAprobacion = '0.00';
  respuestaPatchAprobacion = undefined;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PATCH' && endpoint.endsWith('/conciliar')) {
      return Promise.resolve(respuestaPatchActual());
    }
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation((endpoint: string) =>
    endpoint.endsWith('/conciliar') ? Promise.resolve(respuestaPatchActual()) : Promise.resolve(null)
  );
  mockApi.post.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

function montarPagina() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  const resultado = render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/conciliacion']}>
        <ConciliacionPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return resultado;
}

describe('ConciliacionPage · Contrato D: feedback de conciliación (COB-11 y UX-06)', () => {
  it('D1 · éxito anunciado: mensaje está en role="status" y botón "Cerrar aviso" (min-h-11) lo retira', async () => {
    txActual = txPendiente();
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    const textoExito = await screen.findByText(/Pago aprobado y descontado de la cuota/);
    const statusExito = textoExito.closest('[role="status"]');
    expect(statusExito).not.toBeNull();

    const botonCerrar = screen.getByRole('button', { name: 'Cerrar aviso' });
    expect(botonCerrar.className).toContain('min-h-11');

    fireEvent.click(botonCerrar);
    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).toBeNull();
  });

  it('D2a · tiempo de vida sin excedente: visible a los 5000 ms y desaparece pasados 8500 ms', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '60.00' });
    excedenteAprobacion = '0.00';
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    vi.useFakeTimers();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));
    await vi.advanceTimersByTimeAsync(0);

    // Con el nuevo temporizador de 8 s: a los 5000 ms sigue visible.
    // Con el código actual (3 s): a los 5000 ms ya desapareció -> FALLA hoy como se espera.
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).not.toBeNull();

    // Pasados 8500 ms totales (3500 ms adicionales) desaparece con el nuevo temporizador de 8 s.
    await vi.advanceTimersByTimeAsync(3500);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).toBeNull();
  });

  it('D2b · tiempo de vida con excedente: sigue visible a los 10 s y solo se va con "Cerrar aviso"', async () => {
    txActual = txPendiente({ saldoPendienteCuotaUsd: '40.00' });
    excedenteAprobacion = '10.00';
    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    vi.useFakeTimers();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));
    await vi.advanceTimersByTimeAsync(0);

    // A los 10 s sigue visible
    await vi.advanceTimersByTimeAsync(10000);
    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).not.toBeNull();

    // Solo se va con el botón Cerrar aviso
    const botonCerrar = screen.getByRole('button', { name: 'Cerrar aviso' });
    fireEvent.click(botonCerrar);
    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).toBeNull();
  });

  it('D3 · sin temporizadores huérfanos: al desmontar con éxito visible no queda ningún temporizador activo', async () => {
    txActual = txPendiente();
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clientesConsulta.push(cliente);
    const { unmount } = render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter initialEntries={['/coach/conciliacion']}>
          <ConciliacionPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    vi.useFakeTimers();
    vi.clearAllTimers();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar pago' }));
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).not.toBeNull();

    unmount();
    cliente.clear();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('D4 · error viejo limpio: tras aprobación fallida, abrir rechazo retira la alerta; aprobación correcta posterior no coexiste con la alerta', async () => {
    txActual = txPendiente();
    // Simular fallo en el primer PATCH de aprobación
    let debeFallarPatch = true;
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PATCH' && endpoint === ENDPOINT_CONCILIAR) {
        if (debeFallarPatch) {
          debeFallarPatch = false;
          return Promise.reject(new Error('Fallo al aprobar transacción'));
        }
        return Promise.resolve(respuestaPatchActual());
      }
      return respuestaGet(endpoint);
    });

    montarPagina();
    await screen.findByText('Carlos Mendoza');

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    // Alerta visible en la página
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Fallo al aprobar transacción');

    // Abrir el rechazo de la transacción retira la alerta de la página
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar pago de Carlos Mendoza' }));
    expect(screen.queryByRole('alert')).toBeNull();

    // Cerrar el modal de rechazo
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    // Aprobación correcta posterior: no quedan a la vez la alerta vieja y el éxito nuevo
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    await screen.findByText('Pago aprobado y descontado de la cuota.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('D5 · una aprobación correcta (éxito visible) y luego otra que falla: queda role="alert" y no el éxito', async () => {
    const tx1 = txPendiente({ id: 'tx-1', clienteNombre: 'Carlos Mendoza' });
    const tx2 = txPendiente({ id: 'tx-2', clienteNombre: 'Mariana Pérez' });
    itemsBandeja = [tx1, tx2];

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PATCH') {
        if (endpoint.includes('tx-2')) {
          return Promise.reject(new Error('Fallo al aprobar segunda transacción'));
        }
        return Promise.resolve(respuestaPatchActual());
      }
      return respuestaGet(endpoint);
    });

    montarPagina();
    await screen.findByText('Carlos Mendoza');
    await screen.findByText('Mariana Pérez');

    // Primera aprobación correcta: éxito visible
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    await screen.findByText('Pago aprobado y descontado de la cuota.');
    expect(screen.queryByRole('alert')).toBeNull();

    // Segunda aprobación que falla
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Mariana Pérez' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Fallo al aprobar segunda transacción');
    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).toBeNull();
  });

  it('D6 · con el éxito visible, abrir el rechazo de otro pago retira el éxito', async () => {
    const tx1 = txPendiente({ id: 'tx-1', clienteNombre: 'Carlos Mendoza' });
    const tx2 = txPendiente({ id: 'tx-2', clienteNombre: 'Mariana Pérez' });
    itemsBandeja = [tx1, tx2];

    montarPagina();
    await screen.findByText('Carlos Mendoza');
    await screen.findByText('Mariana Pérez');

    // Primera aprobación correcta: éxito visible
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar pago de Carlos Mendoza' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar pago' })
    );

    await screen.findByText('Pago aprobado y descontado de la cuota.');

    // Abrir el rechazo de otro pago retira el éxito
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar pago de Mariana Pérez' }));
    await screen.findByRole('dialog');

    expect(screen.queryByText(/Pago aprobado y descontado de la cuota/)).toBeNull();
  });
});
