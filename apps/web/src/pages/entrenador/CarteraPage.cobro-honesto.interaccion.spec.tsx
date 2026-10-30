// @vitest-environment jsdom
/**
 * 01 · UX-08 · useCobroCartera vía CarteraPage: cobro en efectivo honesto (Contrato B).
 *
 * Requisitos:
 * - B1: Al abrir, monto viene con saldo ('50.00') y moneda es USD.
 * - B2: D1: al cambiar moneda a Bs., monto queda vacío (''). Al volver a USD sigue vacío.
 * - B3: Resumen en Bs.: con Bs. y monto '1825', antes del botón hay un role="status"
 *       con texto exactamente "Se registrarán Bs. 1.825,00 (≈ $50,00 USD)".
 * - B4: Resumen en USD: con USD y '50', texto es "Se registrarán $50,00 USD".
 * - B5: Sin resumen inválido: con monto vacío o '0', no hay resumen;
 *       con Bs. y sin tasa vigente, opción Bs. está deshabilitada.
 * - B6: El POST no cambia: al registrar en Bs. con 1825 lleva montoOriginal='1825' y monedaOriginal='VES'.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoCuota,
  MetodoPago,
  Moneda,
  type CarteraDTO,
  type FilaCarteraDTO,
} from '@guachafit/shared';

const FILA_A: FilaCarteraDTO = {
  alumnoUsuarioId: 'u-001',
  alumnoPerfilId: 'al-001',
  alumnoNombre: 'Carlos Mendoza',
  cuotaId: 'cuota-1',
  estadoCuota: EstadoCuota.VENCIDA,
  fechaCorteUtc: '2026-10-01T23:59:59.000Z',
  saldoPendienteUsd: '50.00',
  saldoPendienteBs: null,
  tasaAplicada: null,
  diasAtraso: 8,
  diasRestantes: null,
  ultimaGestionUtc: null,
  planNombre: 'Plan Fuerza',
  periodo: '2026-10',
  pagoId: null,
  montoReportado: null,
  monedaOriginal: null,
  metodoPago: null,
  referenciaBancaria: null,
  comprobanteUrl: null,
  fechaReporteUtc: null,
  diasEspera: null,
  telefonoWhatsapp: null,
  proximoCorte: null,
  saldoAFavorUsd: '0.00',
};

let tasaVigenteCartera: string | null = '36.50';

function respuestaCartera(): CarteraDTO {
  return {
    items: [FILA_A],
    total: 1,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '0.00',
      totalEnMoraUsd: '50.00',
      alumnosEnMora: 1,
      totalPorVencerUsd: '0.00',
      proximosAVencer: 0,
      pagosPorValidar: 0,
      contadores: { enMora: 1, porVencer: 0, revision: 0, alDia: 0 },
      tasaVigente: tasaVigenteCartera,
    },
  };
}

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: false,
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
import { CarteraPage } from './CarteraPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

let respuestasPost: Array<Error | Record<string, unknown>> = [];
const clientesConsulta: QueryClient[] = [];

function esEndpointCobro(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/cobro-directo-inteligente');
}

function consumirPost(): Promise<unknown> {
  const siguiente = respuestasPost.shift();
  if (siguiente instanceof Error) return Promise.reject(siguiente);
  return Promise.resolve(siguiente ?? { id: 'tx-nueva' });
}

function cuerpoDeLlamada(llamada: unknown[]): Record<string, unknown> {
  const segundo = llamada[1];
  if (typeof segundo === 'string') return JSON.parse(segundo) as Record<string, unknown>;
  if (segundo && typeof segundo === 'object') {
    const conBody = segundo as { body?: unknown };
    if (typeof conBody.body === 'string') {
      return JSON.parse(conBody.body) as Record<string, unknown>;
    }
    return segundo as Record<string, unknown>;
  }
  return {};
}

function llamadasPostCobro(): Array<{ llamada: unknown[] }> {
  const viaHelper = mockApi.post.mock.calls
    .filter(([endpoint]) => esEndpointCobro(endpoint))
    .map((llamada) => ({ llamada }));
  const viaCallable = mockApi.mock.calls
    .filter(
      ([endpoint, opciones]) =>
        esEndpointCobro(endpoint) &&
        (opciones as { method?: string } | undefined)?.method === 'POST'
    )
    .map((llamada) => ({ llamada }));
  return [...viaHelper, ...viaCallable];
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  tasaVigenteCartera = '36.50';
  respuestasPost = [{ id: 'tx-nueva' }];

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST') {
      return esEndpointCobro(endpoint) ? consumirPost() : Promise.resolve(null);
    }
    if (endpoint.startsWith('/finanzas/cartera?')) return Promise.resolve(respuestaCartera());
    return Promise.resolve(null);
  });
  mockApi.post.mockImplementation((endpoint: string) =>
    esEndpointCobro(endpoint) ? consumirPost() : Promise.resolve(null)
  );
  mockApi.patch.mockImplementation(() => Promise.resolve(null));
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
      <MemoryRouter initialEntries={['/coach/cartera']}>
        <Routes>
          <Route path="/coach/cartera" element={<CarteraPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function botonCobroDe(nombreAlumno: string): HTMLElement {
  const fila = screen
    .getAllByText(nombreAlumno)
    .map((nodo) => nodo.closest('tr'))
    .find((candidata): candidata is HTMLTableRowElement => Boolean(candidata));
  if (!fila) throw new Error(`No se encontró la fila de ${nombreAlumno}.`);
  return within(fila).getByRole('button', { name: `Registrar cobro de ${nombreAlumno}` });
}

async function abrirCobroDe(nombreAlumno: string): Promise<HTMLElement> {
  await waitFor(() => expect(botonCobroDe(nombreAlumno)).toBeTruthy());
  fireEvent.click(botonCobroDe(nombreAlumno));
  return screen.findByRole('dialog');
}

describe('CarteraPage · Contrato B: cobro honesto con useCobroCartera', () => {
  it('B1 · al abrir, el monto viene con el saldo pendiente ("50.00") y la moneda es USD', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    const inputMonto = within(dialogo).getByLabelText('Monto') as HTMLInputElement;
    const selectMoneda = within(dialogo).getByLabelText('Moneda') as HTMLSelectElement;

    expect(inputMonto.value).toBe('50.00');
    expect(selectMoneda.value).toBe(Moneda.USD);
  });

  it('B2 · D1: al cambiar la moneda a Bs. el monto se vacía; al volver a USD sigue vacío', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    const inputMonto = within(dialogo).getByLabelText('Monto') as HTMLInputElement;
    const selectMoneda = within(dialogo).getByLabelText('Moneda') as HTMLSelectElement;

    // Cambiar a Bs.: se vacía
    fireEvent.change(selectMoneda, { target: { value: Moneda.VES } });
    expect(inputMonto.value).toBe('');

    // Cambiar de vuelta a USD: sigue vacío
    fireEvent.change(selectMoneda, { target: { value: Moneda.USD } });
    expect(inputMonto.value).toBe('');
  });

  it('B3 · resumen en Bs.: con Bs. y monto 1825, muestra en role="status" exactamente "Se registrarán Bs. 1.825,00 (≈ $50,00 USD)"', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    const selectMoneda = within(dialogo).getByLabelText('Moneda');
    const inputMonto = within(dialogo).getByLabelText('Monto');

    fireEvent.change(selectMoneda, { target: { value: Moneda.VES } });
    fireEvent.change(inputMonto, { target: { value: '1825' } });

    const status = within(dialogo).getByRole('status');
    expect(status.textContent?.trim()).toBe('Se registrarán Bs. 1.825,00 (≈ $50,00 USD)');
  });

  it('B4 · resumen en USD: con USD y monto 50, muestra en role="status" "Se registrarán $50,00 USD"', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    const inputMonto = within(dialogo).getByLabelText('Monto');
    fireEvent.change(inputMonto, { target: { value: '50' } });

    const status = within(dialogo).getByRole('status');
    expect(status.textContent?.trim()).toBe('Se registrarán $50,00 USD');
  });

  it('B5 · sin resumen inválido: con monto vacío o 0 no hay resumen; con Bs. y sin tasa vigente, Bs. está deshabilitado', async () => {
    // 1. Con monto vacío o 0
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const inputMonto = within(dialogo).getByLabelText('Monto');

    fireEvent.change(inputMonto, { target: { value: '' } });
    expect(within(dialogo).queryByRole('status')).toBeNull();

    fireEvent.change(inputMonto, { target: { value: '0' } });
    expect(within(dialogo).queryByRole('status')).toBeNull();

    cleanup();

    // 2. Sin tasa en el resumen de cartera
    tasaVigenteCartera = null;
    montarPagina();
    const dialogoSinTasa = await abrirCobroDe(FILA_A.alumnoNombre);
    const opcionVes = within(dialogoSinTasa).getByRole('option', { name: /Bs\./i }) as HTMLOptionElement;
    expect(opcionVes.disabled).toBe(true);
  });

  it('B6 · el POST no cambia: al registrar en Bs. con 1825 envía montoOriginal="1825" y monedaOriginal="VES"', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    const selectMoneda = within(dialogo).getByLabelText('Moneda');
    const inputMonto = within(dialogo).getByLabelText('Monto');

    fireEvent.change(selectMoneda, { target: { value: Moneda.VES } });
    fireEvent.change(inputMonto, { target: { value: '1825' } });

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    const cuerpo = cuerpoDeLlamada(llamadasPostCobro()[0].llamada);
    expect(cuerpo).toMatchObject({
      montoOriginal: '1825',
      monedaOriginal: Moneda.VES,
      metodoPago: MetodoPago.EFECTIVO_VES,
    });
  });

  it('B7 · escribir "35,50" en USD y registrar: el cuerpo enviado lleva montoOriginal: "35.50"', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const inputMonto = within(dialogo).getByLabelText('Monto');

    fireEvent.change(inputMonto, { target: { value: '35,50' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    const cuerpo = cuerpoDeLlamada(llamadasPostCobro()[0].llamada);
    expect(cuerpo).toMatchObject({
      montoOriginal: '35.50',
      monedaOriginal: Moneda.USD,
      metodoPago: MetodoPago.EFECTIVO_USD,
    });
  });

  it('B8 · escribir "50.123" y registrar: no se hace POST y aparece "Escribe el monto con hasta 2 decimales, por ejemplo 35,50."', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const inputMonto = within(dialogo).getByLabelText('Monto');

    fireEvent.change(inputMonto, { target: { value: '50.123' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(llamadasPostCobro()).toHaveLength(0);
    const alerta = within(dialogo).getByRole('alert');
    expect(alerta.textContent).toContain('Escribe el monto con hasta 2 decimales, por ejemplo 35,50.');
  });

  it('B9 · con el error de formato visible, cambiar de moneda retira el error', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const inputMonto = within(dialogo).getByLabelText('Monto');
    const selectMoneda = within(dialogo).getByLabelText('Moneda');

    fireEvent.change(inputMonto, { target: { value: '50.123' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(within(dialogo).getByRole('alert')).toBeTruthy();

    // Cambiar de moneda borra el error
    fireEvent.change(selectMoneda, { target: { value: Moneda.VES } });
    expect(within(dialogo).queryByRole('alert')).toBeNull();
  });
});
