// @vitest-environment jsdom
/**
 * RF-006 RN-05 (lote web, prompt 01): saldo a favor en la vista del alumno (`PagosPage`).
 *
 * Fija el contrato visible: el bloque del saldo a favor con la tasa vigente (región `status`), el
 * aviso de aplicación automática y la línea de la cuota cubierta con saldo (`De esta cuota, …`).
 * La página conserva `saldoAFavorUsd` del historial y lee `cuotaMesActual.saldoAFavorAplicadoUsd`
 * (si falta, la línea no se muestra).
 *
 * Montaje: `useAuth` mockeado con un alumno titular; `GET /finanzas/tasas/vigente` devuelve la
 * tasa real y `GET /finanzas/clientes/:id/historial` un resumen configurable por test. La página
 * no usa router ni TanStack Query, así que se monta directa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ResumenFinancieroAlumnoDTO, TasaCambioVigenteDTO } from '@guachafit/shared';

const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
};

/** Cuota del mes + la extensión del contrato 10 (`saldoAFavorAplicadoUsd`). */
type CuotaMesConAplicado = NonNullable<ResumenFinancieroAlumnoDTO['cuotaMesActual']> & {
  saldoAFavorAplicadoUsd: string;
};

/** Cuota del resumen tal cual la define el contrato: `saldoAFavorAplicadoUsd` es opcional. */
type CuotaResumen = NonNullable<ResumenFinancieroAlumnoDTO['cuotaMesActual']>;

function cuotaBase(): CuotaMesConAplicado {
  return {
    id: 'cuota-1',
    periodo: '2026-10',
    montoTotalUsd: '40.00',
    montoPagadoUsd: '0.00',
    saldoPendienteUsd: '40.00',
    estado: 'emitida',
    fechaVencimiento: '2026-10-10T03:59:59.999Z',
    saldoAFavorAplicadoUsd: '0.00',
  };
}

function resumenBase(
  overrides: {
    saldoAFavorUsd?: string;
    cuotaMesActual?: CuotaResumen | null;
  } = {}
): ResumenFinancieroAlumnoDTO {
  const cuota: CuotaResumen | null =
    overrides.cuotaMesActual === undefined ? cuotaBase() : overrides.cuotaMesActual;
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: ALUMNO_ID,
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: overrides.saldoAFavorUsd ?? '0.00',
    totalPagadoHistoricoUsd: '0.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: cuota,
    transaccionesTotal: 0,
    transacciones: [],
  };
}

// `vi.hoisted`: el usuario debe ser el MISMO objeto en cada render; con una identidad nueva por
// render, el efecto de carga de la página (`[user, isDemoMode]`) se dispara en bucle.
const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'a1111111-1111-4111-8111-111111111111',
    email: 'alumno@example.com',
    rol: 'alumno',
    entrenadorId: 'e1111111-1111-4111-8111-111111111111',
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
import { PagosPage } from './PagosPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

// Resumen del historial que devuelve el mock; cada test lo configura antes de montar.
let resumenActual: ResumenFinancieroAlumnoDTO;

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (endpoint.startsWith(`/finanzas/clientes/${ALUMNO_ID}/historial`)) {
    return Promise.resolve(resumenActual);
  }
  return Promise.resolve(null);
}

beforeEach(() => {
  resumenActual = resumenBase();
  authDemo.modoDemo = false;
  Element.prototype.scrollIntoView = vi.fn();

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.post.mockImplementation(() => Promise.resolve(null));
  mockApi.patch.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function montarPagina(): void {
  render(<PagosPage />);
}

describe('PagosPage · contrato 5: saldo a favor del alumno', () => {
  it('5a · con saldo a favor muestra el texto con la tasa vigente y el aviso de aplicación automática', async () => {
    resumenActual = resumenBase({ saldoAFavorUsd: '10.00' });
    montarPagina();

    expect(await screen.findByText('Saldo a favor: $10,00 USD (≈ Bs. 650,00)')).toBeTruthy();
    expect(screen.getByText('Se aplicará automáticamente a tu próxima cuota.')).toBeTruthy();
  });

  it('5b · con saldo a favor 0.00 no muestra ninguno de los dos textos', async () => {
    resumenActual = resumenBase({ saldoAFavorUsd: '0.00' });
    montarPagina();

    // Espera a que la cuota real esté en pantalla antes de comprobar la ausencia.
    await screen.findByText('Saldo Pendiente');
    expect(screen.queryByText(/Saldo a favor/)).toBeNull();
    expect(screen.queryByText('Se aplicará automáticamente a tu próxima cuota.')).toBeNull();
  });

  it('5c · la cuota cubierta usa el texto nuevo y el saldo a favor es una región status', async () => {
    resumenActual = resumenBase({
      saldoAFavorUsd: '10.00',
      cuotaMesActual: { ...cuotaBase(), saldoAFavorAplicadoUsd: '10.00' },
    });
    montarPagina();

    expect(
      await screen.findByText('De esta cuota, $10,00 USD se cubrieron con tu saldo a favor.')
    ).toBeTruthy();
    const region = screen.getByRole('status');
    expect(within(region).getByText('Saldo a favor: $10,00 USD (≈ Bs. 650,00)')).toBeTruthy();
  });

  it('5d · cuota sin saldoAFavorAplicadoUsd no muestra la línea de la cuota', async () => {
    const cuotaSinAplicado: CuotaResumen = { ...cuotaBase() };
    delete cuotaSinAplicado.saldoAFavorAplicadoUsd;
    resumenActual = resumenBase({ cuotaMesActual: cuotaSinAplicado });
    montarPagina();

    // Espera a que la cuota real esté en pantalla antes de comprobar la ausencia.
    await screen.findByText('Saldo Pendiente');
    expect(screen.queryByText(/De esta cuota/)).toBeNull();
  });

  it('5e · modo demo: no se inventa saldo a favor ni línea de cuota cubierta', async () => {
    authDemo.modoDemo = true;
    montarPagina();

    await screen.findByText('Plan Alto Rendimiento Mensual');
    expect(screen.queryByText(/Saldo a favor/)).toBeNull();
    expect(screen.queryByText(/De esta cuota/)).toBeNull();
    // La cuota y el historial demo salen del fixture local: la página no llama al API.
    expect(mockApi).not.toHaveBeenCalled();
  });
});
