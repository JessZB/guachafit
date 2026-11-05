// @vitest-environment happy-dom
/**
 * RF-007 (lote web): pago revertido en el historial del alumno (`PagosPage`).
 *
 * Fija el contrato: una transacción `revertido` del historial se muestra con el chip "Revertido"
 * (neutro, `bg-secondary`, no el amarillo de pendiente), la reversión se explica con
 * `Motivo: ${motivoReversion}` o el texto de reserva cuando no hay motivo, y el chip de filtro
 * "Revertido" separa esas filas del resto.
 *
 * Montaje: mismo patrón que `PagosPage.saldo-favor.interaccion.spec.tsx` (`useAuth` mockeado con
 * un alumno titular; tasa vigente real y resumen del historial configurables por test; la página
 * no usa router ni TanStack Query, así que se monta directa).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

/** Item del historial con la extensión del contrato 3 (`motivoReversion`). */
type TransaccionHistorial = ResumenFinancieroAlumnoDTO['transacciones'][number] & {
  motivoReversion?: string | null;
};

const TRANSACCIONES: TransaccionHistorial[] = [
  {
    id: 'tx-revertida-1',
    cuotaId: 'cuota-1',
    montoUsd: '20.00',
    metodoPago: 'pago_movil',
    referencia: 'REV-001',
    estado: 'revertido',
    motivoReversion: 'Cobro duplicado',
    createdAtUtc: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'tx-aprobada-1',
    cuotaId: 'cuota-1',
    montoUsd: '40.00',
    metodoPago: 'efectivo_usd',
    referencia: 'APR-002',
    estado: 'aprobado',
    createdAtUtc: '2026-09-15T10:00:00.000Z',
  },
];

function resumenBase(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: ALUMNO_ID,
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '60.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-10-10T03:59:59.999Z',
    },
    transaccionesTotal: TRANSACCIONES.length,
    transacciones: TRANSACCIONES,
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
    zonaHoraria: 'America/Caracas',
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

/** Abre la vista del historial desde el hub de la página. */
async function abrirHistorial(): Promise<void> {
  fireEvent.click(
    await screen.findByRole('button', { name: /Historial/ })
  );
  await screen.findByRole('heading', { name: 'Historial' });
}

/** Fila del historial que contiene la referencia indicada (la más cercana con `rounded-2xl`). */
function filaDeTransaccion(referencia: string): HTMLElement {
  const nodo = screen.getByText(new RegExp(`Ref: ${referencia}`));
  const fila = nodo.closest('.rounded-2xl');
  if (!fila) throw new Error(`No se encontró la fila de la referencia ${referencia}.`);
  return fila as HTMLElement;
}

describe('PagosPage · RF-007: pago revertido en el historial del alumno (contrato 12)', () => {
  it('12a · la transacción revertida muestra "Revertido" y no "En revisión"', async () => {
    montarPagina();
    await abrirHistorial();

    const fila = filaDeTransaccion('REV-001');
    expect(within(fila).getByText('Revertido')).toBeTruthy();
    expect(within(fila).queryByText('En revisión')).toBeNull();
  });

  it('12b · si la transacción trae motivo, muestra "Motivo: <motivoReversion>"', async () => {
    montarPagina();
    await abrirHistorial();

    const fila = filaDeTransaccion('REV-001');
    expect(fila.textContent).toContain('Motivo: Cobro duplicado');
  });

  it('12c · el chip "Revertido" es neutro (bg-secondary), no el amarillo de pendiente', async () => {
    montarPagina();
    await abrirHistorial();
    await screen.findByText(/Ref: REV-001/);

    const chip = within(filaDeTransaccion('REV-001')).getByText('Revertido');
    expect(chip.className).toContain('bg-secondary');
    expect(chip.className).not.toContain('bg-warning');
  });

  it('12d · una fila revertida sin motivo muestra el texto de reserva', async () => {
    resumenActual = {
      ...resumenBase(),
      transacciones: TRANSACCIONES.map((tx) =>
        tx.id === 'tx-revertida-1' ? { ...tx, motivoReversion: null } : tx
      ),
    };
    montarPagina();
    await abrirHistorial();
    await screen.findByText(/Ref: REV-001/);

    const fila = filaDeTransaccion('REV-001');
    expect(fila.textContent).toContain('Tu entrenador revirtió este pago.');
    expect(fila.textContent).not.toContain('Motivo:');
  });

  it('12e · el chip de filtro "Revertido" deja solo las filas revertidas', async () => {
    montarPagina();
    await abrirHistorial();
    await screen.findByText(/Ref: APR-002/);

    fireEvent.click(screen.getByRole('button', { name: 'Revertido' }));

    expect(screen.getByText(/Ref: REV-001/)).toBeTruthy();
    expect(screen.queryByText(/Ref: APR-002/)).toBeNull();
    expect(screen.getByText('Mostrando 1 de 2 en esta página · 2 registros')).toBeTruthy();
  });
});
