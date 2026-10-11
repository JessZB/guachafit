// @vitest-environment jsdom
/**
 * M5-L1B (contrato F): cobro en el tablero de Control de Cobros (`CarteraPage`).
 *
 * Fase ROJA: el modal todavía no envía clave de idempotencia por intento (el api-client genera
 * una distinta en cada POST) ni ofrece el enlace `Asignar plan` cuando el servidor responde el
 * 400 de "sin plan asignado". El cuerpo del POST sí debe seguir igual que hoy (método efectivo
 * derivado de la moneda), ahora construido con `construirPayloadCobroSala`.
 *
 * Montaje: `CarteraPage` usa TanStack Query, así que la página se monta dentro de un
 * `QueryClientProvider` de test; el `GET /finanzas/cartera` se responde con un fixture de dos
 * alumnos en mora y el POST de cobro con una cola configurable por test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoCuota,
  Moneda,
  type CarteraDTO,
  type FilaCarteraDTO,
} from '@guachafit/shared';

const FILA_A = filaMora({
  alumnoUsuarioId: 'u-001',
  alumnoPerfilId: 'al-001',
  alumnoNombre: 'Carlos Mendoza',
  cuotaId: 'cuota-1',
});

const FILA_B = filaMora({
  alumnoUsuarioId: 'u-002',
  alumnoPerfilId: 'al-002',
  alumnoNombre: 'Valeria Silva',
  cuotaId: 'cuota-2',
  saldoPendienteUsd: '60.00',
});

function filaMora(
  parcial: Partial<FilaCarteraDTO> &
    Pick<FilaCarteraDTO, 'alumnoUsuarioId' | 'alumnoPerfilId' | 'alumnoNombre'>
): FilaCarteraDTO {
  return {
    telefonoWhatsapp: null,
    proximoCorte: null,
    cuotaId: null,
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-10-01T23:59:59.000Z',
    saldoPendienteUsd: '35.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 8,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: null,
    periodo: null,
    pagoId: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaReporteUtc: null,
    diasEspera: null,
    ...parcial,
  };
}

function respuestaCartera(): CarteraDTO {
  return {
    items: [FILA_A, FILA_B],
    total: 2,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '0.00',
      totalEnMoraUsd: '95.00',
      alumnosEnMora: 2,
      totalPorVencerUsd: '0.00',
      proximosAVencer: 0,
      pagosPorValidar: 0,
      contadores: { enMora: 2, porVencer: 0, revision: 0, alDia: 0 },
      // Con tasa vigente la opción VES del modal queda habilitada.
      tasaVigente: '65.0000',
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

import { apiClient, ApiError } from '../../lib/api-client';
import { CarteraPage } from './CarteraPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

// Cola de respuestas del POST de cobro, consumida por test (Error = rechazo).
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

function claveDeOpciones(opciones?: unknown): string | undefined {
  if (!opciones || typeof opciones !== 'object') return undefined;
  const conClave = opciones as { idempotencyKey?: string; headers?: Record<string, string> };
  return conClave.headers?.['X-Idempotency-Key'] ?? conClave.idempotencyKey;
}

/** Normaliza el cuerpo de una llamada al mock, venga por helper o por el callable. */
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

function llamadasPostCobro(): Array<{ llamada: unknown[]; clave?: string }> {
  const viaHelper = mockApi.post.mock.calls
    .filter(([endpoint]) => esEndpointCobro(endpoint))
    .map((llamada) => ({ llamada, clave: claveDeOpciones(llamada[2]) }));
  const viaCallable = mockApi.mock.calls
    .filter(
      ([endpoint, opciones]) =>
        esEndpointCobro(endpoint) &&
        (opciones as { method?: string } | undefined)?.method === 'POST'
    )
    .map((llamada) => ({ llamada, clave: claveDeOpciones(llamada[1]) }));
  return [...viaHelper, ...viaCallable];
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
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

/** Botón "Registrar cobro" de la fila (versión de tabla) del alumno indicado. */
function botonCobroDe(nombreAlumno: string): HTMLElement {
  const fila = screen
    .getAllByText(nombreAlumno)
    .map((nodo) => nodo.closest('tr'))
    .find((candidata): candidata is HTMLTableRowElement => Boolean(candidata));
  if (!fila) throw new Error(`No se encontró la fila de ${nombreAlumno}.`);
  return within(fila).getByRole('button', { name: 'Registrar cobro' });
}

/** Abre el modal de cobro del alumno indicado y lo devuelve (espera a que la tabla cargue). */
async function abrirCobroDe(nombreAlumno: string): Promise<HTMLElement> {
  await waitFor(() => expect(botonCobroDe(nombreAlumno)).toBeTruthy());
  fireEvent.click(botonCobroDe(nombreAlumno));
  return screen.findByRole('dialog');
}

describe('CarteraPage · contrato F: cobro en Control de Cobros', () => {
  it('F1a · un fallo y su reintento en el mismo modal comparten X-Idempotency-Key', async () => {
    respuestasPost = [new Error('El servidor falló (500).'), { id: 'tx-1' }];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const boton = within(dialogo).getByRole('button', { name: 'Registrar cobro' });

    fireEvent.click(boton);
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));
    await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(boton);
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(2));

    const [primer, segundo] = llamadasPostCobro();
    expect(primer.clave).toBeTruthy();
    expect(segundo.clave).toBe(primer.clave);
  });

  it('F1b · un modal nuevo (otra fila) usa una clave distinta', async () => {
    respuestasPost = [{ id: 'tx-1' }, { id: 'tx-2' }];
    montarPagina();
    const dialogoA = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogoA).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    // Otra fila: el modal cambia de alumno y la clave debe ser nueva.
    fireEvent.click(botonCobroDe(FILA_B.alumnoNombre));
    const dialogoB = await screen.findByRole('dialog');
    fireEvent.click(within(dialogoB).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(2));

    const posts = llamadasPostCobro();
    expect(posts[0].clave).toBeTruthy();
    expect(posts[1].clave).toBeTruthy();
    expect(posts[1].clave).not.toBe(posts[0].clave);
  });

  it('F2 · con el 400 de sin plan asignado muestra el mensaje y el enlace Asignar plan', async () => {
    respuestasPost = [
      new Error(
        'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
      ),
    ];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(
      await within(dialogo).findByText(/Este alumno no tiene un plan asignado/)
    ).toBeTruthy();
    const enlace = within(dialogo).getByRole('link', { name: /Asignar plan/i });
    expect(enlace.getAttribute('href')).toBe(
      `/coach/alumnos/${FILA_A.alumnoPerfilId}?tab=resumen`
    );
  });

  it('F3a · con moneda USD el cuerpo del POST lleva efectivo_usd', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.change(screen.getByLabelText('Fecha de la operación'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    const cuerpo = cuerpoDeLlamada(llamadasPostCobro()[0].llamada);
    expect(cuerpo).toEqual({
      montoOriginal: '35.00',
      monedaOriginal: Moneda.USD,
      metodoPago: 'efectivo_usd',
      fechaOperacion: '2026-10-01',
    });
    expect(cuerpo).not.toHaveProperty('referenciaBancaria');
  });

  it('F3b · con moneda VES el cuerpo del POST lleva efectivo_ves', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const campoFecha = screen.getByLabelText('Fecha de la operación') as HTMLInputElement;
    const fechaDelModal = campoFecha.value;
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: Moneda.VES } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    const cuerpo = cuerpoDeLlamada(llamadasPostCobro()[0].llamada);
    expect(cuerpo).toEqual({
      montoOriginal: '35.00',
      monedaOriginal: Moneda.VES,
      metodoPago: 'efectivo_ves',
      fechaOperacion: fechaDelModal,
    });
    expect(cuerpo).not.toHaveProperty('referenciaBancaria');
  });

  // ---------------------------------------------------------------------------
  // Correcciones del lote (validación 08): contrato V9 (fiabilidad H4).
  // ---------------------------------------------------------------------------

  it('V9 · con el 404 de alumno fuera de lista el modal muestra el mensaje amigable', async () => {
    // ApiError real: el traductor (`traducirErrorHttp` + `esMensajeAmigable`) debe dejar pasar el
    // texto del servidor tal cual (fiabilidad H4), no solo el componente mostrarlo.
    respuestasPost = [
      new ApiError(404, {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: '',
        message: 'Este alumno no está en tu lista.',
        timestampUtc: '2026-10-09T00:00:00.000Z',
      }),
    ];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(await within(dialogo).findByText('Este alumno no está en tu lista.')).toBeTruthy();
    // El 404 nuevo no se confunde con el 400 de "sin plan asignado".
    expect(within(dialogo).queryByRole('link', { name: /Asignar plan/i })).toBeNull();
  });
});
