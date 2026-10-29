// @vitest-environment jsdom
/**
 * RF-006 RN-05 (lote web, prompt 01): excedente en el cobro en sala de Control de Cobros
 * (`CarteraPage`).
 *
 * Fija el contrato del éxito del cobro: con excedente (`transaccion.excedenteUsd` del API) el
 * mensaje termina con "… USD quedaron como saldo a favor del alumno."; sin él queda el texto base.
 * Un reintento idempotente con la misma clave repite el excedente del cobro original, y una
 * respuesta sin `transaccion` (o `null`) también cae al mensaje base.
 *
 * Montaje: mismo patrón que `CarteraPage.cobro.interaccion.spec.tsx` (TanStack Query +
 * MemoryRouter); el GET `/finanzas/cartera` devuelve un alumno en mora y el POST del cobro una
 * cola configurable por test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoCuota,
  type CarteraDTO,
  type FilaCarteraDTO,
} from '@guachafit/shared';

const FILA_A = filaMora({
  alumnoUsuarioId: 'u-001',
  alumnoPerfilId: 'al-001',
  alumnoNombre: 'Carlos Mendoza',
  cuotaId: 'cuota-1',
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
    items: [FILA_A],
    total: 1,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '0.00',
      totalEnMoraUsd: '35.00',
      alumnosEnMora: 1,
      totalPorVencerUsd: '0.00',
      proximosAVencer: 0,
      pagosPorValidar: 0,
      contadores: { enMora: 1, porVencer: 0, revision: 0, alDia: 0 },
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

// Cola de respuestas del POST de cobro, consumida por test. Un Error simula un fallo de red y
// `null` una respuesta sin cuerpo (204/JSON ilegible), como los casos que cubre el contrato.
let respuestasPost: Array<Record<string, unknown> | null | Error> = [];
const clientesConsulta: QueryClient[] = [];

function esEndpointCobro(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/cobro-directo-inteligente');
}

function consumirPost(): Promise<unknown> {
  const siguiente = respuestasPost.shift();
  if (siguiente instanceof Error) return Promise.reject(siguiente);
  if (siguiente === undefined) return Promise.resolve({ transaccion: { excedenteUsd: '0.00' } });
  return Promise.resolve(siguiente);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  respuestasPost = [];

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
        <CarteraPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Abre el modal de cobro del alumno indicado y lo devuelve (espera a que la tabla cargue). */
async function abrirCobroDe(nombreAlumno: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getAllByText(nombreAlumno).length).toBeGreaterThan(0));
  const fila = screen
    .getAllByText(nombreAlumno)
    .map((nodo) => nodo.closest('tr'))
    .find((candidata): candidata is HTMLTableRowElement => Boolean(candidata));
  if (!fila) throw new Error(`No se encontró la fila de ${nombreAlumno}.`);
  fireEvent.click(
    within(fila).getByRole('button', { name: `Registrar cobro de ${nombreAlumno}` })
  );
  return screen.findByRole('dialog');
}

describe('CarteraPage · contrato 7: excedente del cobro en sala', () => {
  it('7a · con excedente el éxito termina con el saldo a favor del alumno', async () => {
    respuestasPost = [{ transaccion: { excedenteUsd: '10.00' } }];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(
      await within(dialogo).findByText(
        'Cobro registrado y auto-aprobado para Carlos Mendoza. El saldo del alumno quedó actualizado. 10.00 USD quedaron como saldo a favor del alumno.'
      )
    ).toBeTruthy();
  });

  it('7b · sin excedente el éxito queda igual que hoy', async () => {
    respuestasPost = [{ transaccion: { excedenteUsd: '0.00' } }];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(
      await within(dialogo).findByText(
        'Cobro registrado y auto-aprobado para Carlos Mendoza. El saldo del alumno quedó actualizado.'
      )
    ).toBeTruthy();
    expect(within(dialogo).queryByText(/quedaron como saldo a favor/)).toBeNull();
  });

  it('7c · reintento idempotente: con la misma clave el éxito repite el excedente del cobro original', async () => {
    respuestasPost = [
      new Error('La conexión se interrumpió antes de confirmar el cobro.'),
      { transaccion: { excedenteUsd: '10.00' } },
    ];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    const registrar = within(dialogo).getByRole('button', { name: 'Registrar cobro' });

    // Primer intento: falla; la clave de idempotencia queda pendiente para el reintento.
    fireEvent.click(registrar);
    expect(await within(dialogo).findByText(/La conexión se interrumpió/)).toBeTruthy();

    // Reintento: el API devuelve el cobro original (misma clave) con su excedente real.
    fireEvent.click(registrar);
    expect(
      await within(dialogo).findByText(
        'Cobro registrado y auto-aprobado para Carlos Mendoza. El saldo del alumno quedó actualizado. 10.00 USD quedaron como saldo a favor del alumno.'
      )
    ).toBeTruthy();

    const llamadasCobro = mockApi.mock.calls.filter(([endpoint]) => esEndpointCobro(endpoint));
    expect(llamadasCobro).toHaveLength(2);
    const claveDe = (llamada: unknown[]): string | undefined =>
      (llamada[1] as { idempotencyKey?: string } | undefined)?.idempotencyKey;
    expect(claveDe(llamadasCobro[0])).toBeTruthy();
    expect(claveDe(llamadasCobro[1])).toBe(claveDe(llamadasCobro[0]));
  });

  it('7d · respuesta sin transaccion: el éxito es el mensaje base sin errores', async () => {
    respuestasPost = [{}];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(
      await within(dialogo).findByText(
        'Cobro registrado y auto-aprobado para Carlos Mendoza. El saldo del alumno quedó actualizado.'
      )
    ).toBeTruthy();
    expect(within(dialogo).queryByRole('alert')).toBeNull();
  });

  it('7e · respuesta null: el éxito es el mensaje base sin errores', async () => {
    respuestasPost = [null];
    montarPagina();
    const dialogo = await abrirCobroDe(FILA_A.alumnoNombre);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(
      await within(dialogo).findByText(
        'Cobro registrado y auto-aprobado para Carlos Mendoza. El saldo del alumno quedó actualizado.'
      )
    ).toBeTruthy();
    expect(within(dialogo).queryByRole('alert')).toBeNull();
  });
});
