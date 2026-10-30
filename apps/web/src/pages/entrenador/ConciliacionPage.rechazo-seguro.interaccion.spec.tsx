// @vitest-environment jsdom
/**
 * Lote UX-06 · Rechazo seguro en Bandeja de Conciliación (COB-02, COB-03 y COB-06).
 *
 * Contratos:
 * - 1: Quién y cuánto (dialogo contiene nombre del alumno y monto USD).
 * - 2: Etiqueta asociada ('Motivo del rechazo' asociado al textarea; clases text-base sm:text-sm).
 * - 3: Motivo limpio al cancelar (limpia motivoRechazo entre pagos).
 * - 4: Motivo limpio desde el visor (rechazarDesdeVisor no retiene motivo previo).
 * - 5: En vuelo (procesando: botones deshabilitados, Escape bloqueado, prevención de doble envío).
 * - 6: Error dentro del modal (role="alert" dentro del diálogo; exactamente un alert en toda la página).
 * - 7: Reintento limpio (tras fallo en modal, segundo intento exitoso cierra y notifica).
 * - 8: Área táctil y tipos (type="button", min-h-11 en botones y min-w-11 en botón cerrar).
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
const ENDPOINT_CONCILIAR_CARLOS = '/finanzas/transacciones/tx-1/conciliar';
const ENDPOINT_CONCILIAR_ANA = '/finanzas/transacciones/tx-2/conciliar';

const TX_CARLOS: TransaccionPagoDetalleDTO = {
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
  comprobanteStorageKey: 'comprobantes/tx-1.png',
  comprobanteUrl: 'https://example.com/comprobante-carlos.png',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-10-09T12:00:00.000Z',
  createdAtUtc: '2026-10-09T12:00:00.000Z',
  updatedAtUtc: '2026-10-09T12:00:00.000Z',
  clienteNombre: 'Carlos Mendoza',
  saldoPendienteCuotaUsd: '60.00',
};

const TX_ANA: TransaccionPagoDetalleDTO = {
  id: 'tx-2',
  cuotaId: 'cuota-2',
  clienteId: 'cli-2',
  entrenadorId: COACH_ID,
  registradoPor: 'cli-2',
  montoOriginal: '35.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.0000',
  montoEquivalenteUsd: '35.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
  referenciaBancaria: '778899',
  fechaOperacion: '2026-10-09',
  comprobanteStorageKey: 'comprobantes/tx-2.png',
  comprobanteUrl: 'https://example.com/comprobante-ana.png',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-10-09T12:30:00.000Z',
  createdAtUtc: '2026-10-09T12:30:00.000Z',
  updatedAtUtc: '2026-10-09T12:30:00.000Z',
  clienteNombre: 'Ana Pérez',
  saldoPendienteCuotaUsd: '35.00',
};

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
let fallaPatch: string | null;
let promesaPatchPendiente: Promise<null> | null;
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
    if (typeof endpoint === 'string' && endpoint.includes('/conciliar') && opciones?.method === 'PATCH') {
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

function tarjetaDe(nombre: string): HTMLElement {
  const elemento = screen.getByText(nombre);
  const tarjeta = elemento.closest('article');
  if (!tarjeta) throw new Error(`No se encontró la tarjeta para ${nombre}`);
  return tarjeta as HTMLElement;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  itemsActuales = [TX_CARLOS, TX_ANA];
  fallaPatch = null;
  promesaPatchPendiente = null;
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PATCH' && typeof endpoint === 'string' && endpoint.includes('/conciliar')) {
      if (promesaPatchPendiente) return promesaPatchPendiente;
      if (fallaPatch) return Promise.reject(new Error(fallaPatch));
      return Promise.resolve({ transaccion: { excedenteUsd: '0.00' } });
    }
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation((endpoint: string) => {
    if (promesaPatchPendiente) return promesaPatchPendiente;
    if (fallaPatch) return Promise.reject(new Error(fallaPatch));
    return Promise.resolve({ transaccion: { excedenteUsd: '0.00' } });
  });
  mockApi.post.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

async function abrirRechazoCarlos(): Promise<HTMLElement> {
  montarPagina();
  await screen.findByText('Carlos Mendoza');
  await screen.findByText('Ana Pérez');
  const tarjeta = tarjetaDe('Carlos Mendoza');
  fireEvent.click(within(tarjeta).getByRole('button', { name: 'Rechazar pago de Carlos Mendoza' }));
  await waitFor(() => expect(dialogoDeRechazo()).not.toBeNull());
  return dialogoDeRechazo()!;
}

describe('ConciliacionPage · rechazo seguro (COB-02, COB-03 y COB-06)', () => {
  it('1 · quién y cuánto: el diálogo contiene el nombre del alumno (Carlos Mendoza) y el monto en USD', async () => {
    const dialogo = await abrirRechazoCarlos();
    expect(dialogo.textContent).toContain('Carlos Mendoza');
    expect(dialogo.textContent).toContain('$50,00 USD');
  });

  it('2 · etiqueta asociada: getByLabelText("Motivo del rechazo") devuelve el textarea y tiene clases text-base y sm:text-sm', async () => {
    const dialogo = await abrirRechazoCarlos();
    const textarea = within(dialogo).getByLabelText('Motivo del rechazo') as HTMLTextAreaElement;
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
    expect(textarea.className).toContain('text-base');
    expect(textarea.className).toContain('sm:text-sm');
  });

  it('3 · motivo limpio al cancelar: motivo escrito en un pago no aparece en el rechazo de otro pago', async () => {
    const dialogoCarlos = await abrirRechazoCarlos();
    const textareaCarlos = within(dialogoCarlos).getByPlaceholderText(/La referencia bancaria no coincide/);
    fireEvent.change(textareaCarlos, { target: { value: 'Referencia equivocada' } });
    fireEvent.click(within(dialogoCarlos).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(dialogoDeRechazo()).toBeNull());

    const tarjetaAna = tarjetaDe('Ana Pérez');
    fireEvent.click(within(tarjetaAna).getByRole('button', { name: 'Rechazar pago de Ana Pérez' }));
    await waitFor(() => expect(dialogoDeRechazo()).not.toBeNull());
    const dialogoAna = dialogoDeRechazo()!;

    const textareaAna = within(dialogoAna).getByPlaceholderText(/La referencia bancaria no coincide/) as HTMLTextAreaElement;
    expect(textareaAna.value).toBe('');
    const botonConfirmar = within(dialogoAna).getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement;
    expect(botonConfirmar.disabled).toBe(true);
  });

  it('4 · motivo limpio desde el visor: motivo escrito y cancelado no se filtra al rechazar desde el visor de otro pago', async () => {
    // Abrir rechazo de Carlos, escribir motivo y cancelar
    const dialogoCarlos = await abrirRechazoCarlos();
    const textareaCarlos = within(dialogoCarlos).getByPlaceholderText(/La referencia bancaria no coincide/);
    fireEvent.change(textareaCarlos, { target: { value: 'Comprobante ilegible' } });
    fireEvent.click(within(dialogoCarlos).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(dialogoDeRechazo()).toBeNull());

    // Abrir visor de Ana Pérez y pulsar Rechazar Pago en el visor
    const tarjetaAna = tarjetaDe('Ana Pérez');
    fireEvent.click(within(tarjetaAna).getByRole('button', { name: /^Ver comprobante/ }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar este pago' }));

    // Diálogo de rechazo abierto para Ana
    await waitFor(() => expect(dialogoDeRechazo()).not.toBeNull());
    const dialogoAna = dialogoDeRechazo()!;

    const textareaAna = within(dialogoAna).getByPlaceholderText(/La referencia bancaria no coincide/) as HTMLTextAreaElement;
    expect(textareaAna.value).toBe('');
    const botonConfirmar = within(dialogoAna).getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement;
    expect(botonConfirmar.disabled).toBe(true);
  });

  it('5 · en vuelo (procesando): mientras el PATCH viaja, botones deshabilitados, Escape no cierra y no hay doble envío', async () => {
    let resolverPatch: () => void = () => {};
    promesaPatchPendiente = new Promise<null>((resolve) => {
      resolverPatch = () => resolve(null);
    });

    const dialogo = await abrirRechazoCarlos();
    const textarea = within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/);
    fireEvent.change(textarea, { target: { value: 'Motivo en vuelo' } });

    const botonConfirmar = within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement;
    const botonCancelar = within(dialogo).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement;
    const botonCerrar = within(dialogo).getByRole('button', { name: 'Cerrar rechazo de pago' }) as HTMLButtonElement;

    fireEvent.click(botonConfirmar);

    // 1. Botones deshabilitados en vuelo
    expect(botonConfirmar.disabled).toBe(true);
    expect(botonCancelar.disabled).toBe(true);
    expect(botonCerrar.disabled).toBe(true);

    // 2. Escape no cierra el diálogo mientras viaja
    fireEvent.keyDown(dialogo, { key: 'Escape', code: 'Escape' });
    expect(dialogoDeRechazo()).not.toBeNull();

    // 3. Clic repetido no dispara un segundo PATCH
    fireEvent.click(botonConfirmar);
    expect(llamadasPatch()).toHaveLength(1);

    resolverPatch();
  });

  it('6 · error dentro del modal: fallo del PATCH muestra role="alert" dentro del diálogo, sin duplicar alerta en la página', async () => {
    fallaPatch = 'Fallo al rechazar';
    const dialogo = await abrirRechazoCarlos();
    const textarea = within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/);
    fireEvent.change(textarea, { target: { value: 'Referencia falsa' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => expect(llamadasPatch()).toHaveLength(1));

    expect(dialogoDeRechazo()).not.toBeNull();

    // Error dentro del diálogo
    const alertaModal = within(dialogo).getByRole('alert');
    expect(alertaModal.textContent).toContain('Fallo al rechazar');

    // Un único role="alert" en toda la página
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    // Botón vuelve a estar habilitado y el motivo se conserva
    const botonConfirmar = within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement;
    expect(botonConfirmar.disabled).toBe(false);
    expect((within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/) as HTMLTextAreaElement).value).toBe('Referencia falsa');
  });

  it('7 · reintento limpio: tras fallo en diálogo, un segundo intento exitoso cierra el modal, limpia la alerta y notifica éxito', async () => {
    fallaPatch = 'Fallo al rechazar';
    const dialogo = await abrirRechazoCarlos();
    const textarea = within(dialogo).getByPlaceholderText(/La referencia bancaria no coincide/);
    fireEvent.change(textarea, { target: { value: 'Motivo para reintentar' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => expect(llamadasPatch()).toHaveLength(1));

    expect(dialogoDeRechazo()).not.toBeNull();
    const alertaModal = within(dialogo).getByRole('alert');
    expect(alertaModal.textContent).toContain('Fallo al rechazar');

    // Segundo intento exitoso
    fallaPatch = null;
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => expect(llamadasPatch()).toHaveLength(2));
    await waitFor(() => expect(dialogoDeRechazo()).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      await screen.findByText('Transacción rechazada con observaciones notificadas al alumno.')
    ).toBeTruthy();
  });

  it('8 · área táctil y tipos: botones del diálogo tienen type="button", min-h-11 y cerrar tiene min-w-11', async () => {
    const dialogo = await abrirRechazoCarlos();
    const botonCancelar = within(dialogo).getByRole('button', { name: 'Cancelar' });
    const botonConfirmar = within(dialogo).getByRole('button', { name: 'Confirmar rechazo' });
    const botonCerrar = within(dialogo).getByRole('button', { name: 'Cerrar rechazo de pago' });

    expect(botonCancelar.getAttribute('type')).toBe('button');
    expect(botonCancelar.className).toContain('min-h-11');

    expect(botonConfirmar.getAttribute('type')).toBe('button');
    expect(botonConfirmar.className).toContain('min-h-11');

    expect(botonCerrar.getAttribute('type')).toBe('button');
    expect(botonCerrar.className).toContain('min-h-11');
    expect(botonCerrar.className).toContain('min-w-11');
  });
});
