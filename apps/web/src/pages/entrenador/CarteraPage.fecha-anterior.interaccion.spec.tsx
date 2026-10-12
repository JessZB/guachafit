// @vitest-environment jsdom
/**
 * RF-009/RF-007 (pagos con fecha anterior): contrato 7 — modal "Registrar cobro" de Control de
 * Cobros (`CarteraPage`).
 *
 * Fase ROJA: el campo "Fecha de la operación" ya existe pero SIN `max`; el modal no valida fechas
 * futuras (envía igual), no muestra el texto de la tasa y conserva la jerga
 * `registrado_por: tu usuario de coach`.
 *
 * Reloj fijo a las 23:30 del día local del proyecto (`America/Caracas`, fijada por
 * `vitest.config.ts`): en UTC ya es el día siguiente, así que un `max` calculado con
 * `toISOString()` no pasaría el test.
 *
 * Montaje: mismo patrón que `CarteraPage.cobro.interaccion.spec.tsx` (TanStack Query con un
 * `QueryClient` de test; `GET /finanzas/cartera` con dos alumnos en mora y tasa vigente).
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

const MENSAJE_FECHA_PAGO_FUTURA = 'La fecha del pago no puede ser posterior a hoy.';
/** 23:30 del 2026-10-11 en Caracas: en UTC ya es 2026-10-12. */
const INSTANTE_FALSO = '2026-10-11T23:30:00-04:00';
const HOY_LOCAL = '2026-10-11';
const FECHA_ANTERIOR = '2026-09-21';
const TASA_VIGENTE = '65.0000';

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
    saldoAFavorUsd: parcial.saldoAFavorUsd ?? '0.00',
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
      // Con tasa vigente la opción VES del modal queda habilitada y el modal debe mostrarla.
      tasaVigente: TASA_VIGENTE,
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

function llamadasPostCobro(): unknown[][] {
  const viaHelper = mockApi.post.mock.calls.filter(([endpoint]) => esEndpointCobro(endpoint));
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      esEndpointCobro(endpoint) &&
      (opciones as { method?: string } | undefined)?.method === 'POST'
  );
  return [...viaHelper, ...viaCallable];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(INSTANTE_FALSO));
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
  vi.useRealTimers();
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

function campoFecha(dialogo: HTMLElement): HTMLInputElement {
  return within(dialogo).getByLabelText('Fecha de la operación') as HTMLInputElement;
}

describe('CarteraPage · contrato 7: fecha del pago, tasa y textos del modal', () => {
  it('7a · el campo "Fecha de la operación" tiene max = hoy local', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    expect(campoFecha(dialogo).max).toBe(HOY_LOCAL);
  });

  it('7b · con una fecha futura no llama al API y muestra el mensaje aprobado', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.change(campoFecha(dialogo), { target: { value: '2026-10-12' } });

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(await within(dialogo).findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();
    expect(llamadasPostCobro()).toHaveLength(0);
  });

  it('7c · con moneda Bs. y tasa vigente se muestra el texto de la tasa', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: Moneda.VES } });

    expect(dialogo.textContent).toContain(
      `Se convertirá con la tasa vigente al registrar: 1 USD = ${TASA_VIGENTE} Bs.`
    );
  });

  it('7d · la jerga registrado_por desaparece y queda el texto claro de auto-aprobación', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);

    expect(within(dialogo).queryByText(/registrado_por/)).toBeNull();
    expect(dialogo.textContent).toContain(
      'El cobro queda aprobado al instante y se descuenta del saldo del alumno.'
    );
  });

  it('7e · una fecha anterior viaja en el payload como fechaOperacion', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.change(campoFecha(dialogo), { target: { value: FECHA_ANTERIOR } });

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    const cuerpo = cuerpoDeLlamada(llamadasPostCobro()[0]);
    expect(cuerpo.fechaOperacion).toBe(FECHA_ANTERIOR);
  });

  it('4i · al corregir la fecha a una válida el mensaje desaparece sin reenviar (hallazgo 5)', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.change(campoFecha(dialogo), { target: { value: '2026-10-12' } });

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    expect(await within(dialogo).findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();

    fireEvent.change(campoFecha(dialogo), { target: { value: FECHA_ANTERIOR } });

    await waitFor(() =>
      expect(within(dialogo).queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull()
    );
    expect(llamadasPostCobro()).toHaveLength(0);
  });

  it('4j · un error que no es de fecha no desaparece al cambiar la fecha (hallazgo 5)', async () => {
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '0' } });
    fireEvent.change(campoFecha(dialogo), { target: { value: FECHA_ANTERIOR } });

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    const MENSAJE_MONTO = 'El monto debe ser mayor a 0.00.';
    expect(await within(dialogo).findByText(MENSAJE_MONTO)).toBeTruthy();

    fireEvent.change(campoFecha(dialogo), { target: { value: HOY_LOCAL } });

    await waitFor(() => expect(within(dialogo).queryByText(MENSAJE_MONTO)).not.toBeNull());
    expect(llamadasPostCobro()).toHaveLength(0);
  });
});
