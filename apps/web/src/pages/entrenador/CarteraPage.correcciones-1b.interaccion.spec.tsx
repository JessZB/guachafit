// @vitest-environment jsdom
/**
 * M5-L1B · correcciones 1B (web) — validación de contratos V7 (Control de Cobros), V8 y V9.
 *
 * Estos tests fijan las correcciones hechas sobre `CarteraPage.tsx`:
 * - V7: la clave de idempotencia es estable por alumno hasta un cobro confirmado (fallo → cerrar
 *   → reabrir → misma clave; tras un éxito → clave distinta; cada fila tiene la suya; F1b sigue
 *   valiendo).
 * - V8: el éxito del cobro no repite el monto del formulario (un reintento idempotente devuelve
 *   el cobro original).
 * - V9: con `alumnoPerfilId: null` y el 400 de sin plan, se ve el mensaje y NO hay enlace
 *   "Asignar plan" (ni un `href` con `null`).
 *
 * Montaje: mismo patrón que `CarteraPage.cobro.interaccion.spec.tsx` (`QueryClientProvider` de
 * test, `apiClient` parcialmente mockeado y cartera fixture de tres alumnos en mora).
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

/** Fila sin perfil vinculado: el enlace "Asignar plan" no debe existir (V9). */
const FILA_NULA = filaMora({
  alumnoUsuarioId: 'u-003',
  alumnoPerfilId: null,
  alumnoNombre: 'Lucía Ríos',
  cuotaId: 'cuota-3',
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
    saldoAFavorUsd: parcial.saldoAFavorUsd ?? '0.00',
  };
}

function respuestaCartera(): CarteraDTO {
  return {
    items: [FILA_A, FILA_B, FILA_NULA],
    total: 3,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '0.00',
      totalEnMoraUsd: '130.00',
      alumnosEnMora: 3,
      totalPorVencerUsd: '0.00',
      proximosAVencer: 0,
      pagosPorValidar: 0,
      contadores: { enMora: 3, porVencer: 0, revision: 0, alDia: 0 },
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

/** Envía el cobro del modal abierto y espera a que el POST número `esperados` haya salido. */
async function enviarCobro(dialogo: HTMLElement, esperados: number): Promise<void> {
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
  await waitFor(() => expect(llamadasPostCobro()).toHaveLength(esperados));
}

/** Cierra el modal abierto con su botón "Cancelar" (sin éxito) o "Cerrar" (con éxito). */
async function cerrarModal(dialogo: HTMLElement, conExito = false): Promise<void> {
  const etiqueta = conExito ? 'Cerrar' : 'Cancelar';
  // El botón X del encabezado también se llama "Cerrar" por `aria-label`: se elige el del pie
  // (el único con ese texto visible).
  const boton = within(dialogo)
    .getAllByRole('button')
    .find((candidato) => candidato.textContent?.trim() === etiqueta);
  if (!boton) throw new Error(`No se encontró el botón «${etiqueta}» del modal.`);
  fireEvent.click(boton);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('CarteraPage · correcciones 1B: clave de cobro estable hasta confirmar (V7)', () => {
  it('V7c1 · misma fila: fallo → cerrar → reabrir → enviar usa la MISMA clave', async () => {
    respuestasPost = [new Error('El servidor falló (500).'), { id: 'tx-1' }];
    montarPagina();

    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    await enviarCobro(dialogo, 1);
    expect(await within(dialogo).findByText(/El servidor falló/)).toBeTruthy();
    await cerrarModal(dialogo);

    const dialogoReabierto = await abrirCobroDe(FILA_A.alumnoNombre);
    await enviarCobro(dialogoReabierto, 2);

    const [primer, segundo] = llamadasPostCobro();
    expect(primer.clave).toBeTruthy();
    expect(segundo.clave).toBe(primer.clave);
  });

  it('V7c2 · tras un éxito, reabrir la misma fila usa una clave DISTINTA', async () => {
    respuestasPost = [{ id: 'tx-1' }, { id: 'tx-2' }];
    montarPagina();

    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    await enviarCobro(dialogo, 1);
    await within(dialogo).findByText(/Cobro registrado y auto-aprobado/);
    await cerrarModal(dialogo, true);

    const dialogoReabierto = await abrirCobroDe(FILA_A.alumnoNombre);
    await enviarCobro(dialogoReabierto, 2);

    const [primer, segundo] = llamadasPostCobro();
    expect(primer.clave).toBeTruthy();
    expect(segundo.clave).toBeTruthy();
    expect(segundo.clave).not.toBe(primer.clave);
  });

  it('V7c3 · otra fila tiene su propia clave (F1b sigue valiendo)', async () => {
    respuestasPost = [new Error('El servidor falló (500).'), { id: 'tx-2' }];
    montarPagina();

    const dialogoA = await abrirCobroDe(FILA_A.alumnoNombre);
    await enviarCobro(dialogoA, 1);
    await cerrarModal(dialogoA);

    const dialogoB = await abrirCobroDe(FILA_B.alumnoNombre);
    await enviarCobro(dialogoB, 2);

    const [deA, deB] = llamadasPostCobro();
    expect(deA.clave).toBeTruthy();
    expect(deB.clave).toBeTruthy();
    expect(deB.clave).not.toBe(deA.clave);
  });
});

describe('CarteraPage · correcciones 1B: éxito sin monto (V8)', () => {
  it('V8 · el éxito dice el nombre del alumno y no repite el monto del formulario', async () => {
    respuestasPost = [{ id: 'tx-1' }];
    montarPagina();

    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    await enviarCobro(dialogo, 1);

    const exito = await within(dialogo).findByText(
      'Cobro registrado y auto-aprobado para Carlos Mendoza. El saldo del alumno quedó actualizado.'
    );
    expect(exito.textContent).not.toContain('35.00');
    expect(within(dialogo).queryByText(/Cobro de \$/)).toBeNull();
  });
});

describe('CarteraPage · correcciones 1B: alumnoPerfilId nulo (V9)', () => {
  it('V9 · con el 400 de sin plan se ve el mensaje y NO hay enlace Asignar plan', async () => {
    respuestasPost = [
      new Error(
        'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
      ),
    ];
    montarPagina();

    const dialogo = await abrirCobroDe(FILA_NULA.alumnoNombre);
    await enviarCobro(dialogo, 1);

    expect(
      await within(dialogo).findByText(/Este alumno no tiene un plan asignado/)
    ).toBeTruthy();
    expect(within(dialogo).queryByRole('link', { name: /Asignar plan/i })).toBeNull();
    const enlaces = Array.from(dialogo.querySelectorAll('a'));
    expect(enlaces.every((enlace) => !(enlace.getAttribute('href') ?? '').includes('null'))).toBe(
      true
    );
  });
});
