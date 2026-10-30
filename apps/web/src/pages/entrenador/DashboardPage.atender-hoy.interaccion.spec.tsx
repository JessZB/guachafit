// @vitest-environment jsdom
/**
 * UX-13 · Dashboard «qué atender hoy» (Contrato P1–P6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardComandoDTO } from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'coach-1',
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
import { DashboardPage } from './DashboardPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

const clientesConsulta: QueryClient[] = [];

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => enLinea,
  });
}

function fixtureDashboard(overrides?: {
  kpisMacro?: Partial<DashboardComandoDTO['kpisMacro']>;
  bandejasRapidas?: Partial<DashboardComandoDTO['bandejasRapidas']>;
}): DashboardComandoDTO {
  return {
    kpisMacro: {
      alumnosActivos: 38,
      capacidadMaxima: 50,
      porcentajeOcupacion: '76.00',
      cobranzaMesUsd: '1900.00',
      metaCobranzaMesUsd: '2500.00',
      porcentajeCobranza: '76.00',
      tasaAdherenciaSemanal: '84.50',
      alumnosEnRiesgoDeportivo: 4,
      alumnosEnMoraFinanciera: 2,
      alumnosEnRiesgo: 4,
      ...overrides?.kpisMacro,
    },
    bandejasRapidas: {
      pagosPorConciliar: 3,
      checkinsAntropometricosPendientes: 2,
      alumnosEnMora: [
        {
          alumnoId: 'perfil-mora-1',
          nombre: 'Carla Ruiz',
          cuotaId: 'c1',
          saldoPendienteUsd: '1250.00',
          diasVencido: 5,
        },
      ],
      alumnosInactivosEntrenamiento: [
        {
          alumnoId: 'perfil-inac-1',
          nombre: 'Luis Prado',
          diasSinEntrenar: 6,
        },
      ],
      ...overrides?.bandejasRapidas,
    },
  };
}

function montarPagina(): void {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'always' } },
  });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  authDemo.modoDemo = false;
  simularConexion(true);
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  simularConexion(true);
  onlineManager.setOnline(true);
  window.dispatchEvent(new Event('online'));
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

describe('DashboardPage · atender hoy (UX-13)', () => {
  it('P1 · Orden: Requiere tu atención va antes que Alumnos con Pagos Vencidos y este antes que Contexto del negocio (nivel 2)', async () => {
    mockApi.mockResolvedValue(fixtureDashboard());
    montarPagina();

    const hAtencion = await screen.findByRole('heading', { level: 2, name: /Requiere tu atención/i });
    const hPagos = screen.getByRole('heading', { name: /Alumnos con Pagos Vencidos/i });
    const hContexto = screen.getByRole('heading', { level: 2, name: /Contexto del negocio/i });

    expect(hAtencion.compareDocumentPosition(hPagos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hPagos.compareDocumentPosition(hContexto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('P2 · Contexto: dentro de Contexto del negocio están Alumnos Activos, Cobros del Mes y Cumplimiento Semanal, y no Alumnos en Riesgo ni Pagos Vencidos', async () => {
    mockApi.mockResolvedValue(fixtureDashboard());
    montarPagina();

    const hContexto = await screen.findByRole('heading', { level: 2, name: /Contexto del negocio/i });
    const seccion = hContexto.closest('section') || hContexto.parentElement!;
    const w = within(seccion);

    expect(w.getByText('Alumnos Activos')).toBeTruthy();
    expect(w.getByText('Cobros del Mes')).toBeTruthy();
    expect(w.getByText('Cumplimiento Semanal')).toBeTruthy();
    expect(w.queryByText('Alumnos en Riesgo')).toBeNull();
    expect(w.queryByText('Pagos Vencidos')).toBeNull();
  });

  it('P3 · KPI enlazados: dentro de Contexto del negocio hay enlaces a /coach/alumnos, /coach/cartera y /coach/monitor-adherencia', async () => {
    mockApi.mockResolvedValue(fixtureDashboard());
    montarPagina();

    const hContexto = await screen.findByRole('heading', { level: 2, name: /Contexto del negocio/i });
    const seccion = hContexto.closest('section') || hContexto.parentElement!;
    const w = within(seccion);

    const enlaceActivos = w.getByRole('link', { name: /Alumnos Activos/i });
    expect(enlaceActivos.getAttribute('href')).toBe('/coach/alumnos');

    const enlaceCobros = w.getByRole('link', { name: /Cobros del Mes/i });
    expect(enlaceCobros.getAttribute('href')).toBe('/coach/cartera');

    const enlaceCumplimiento = w.getByRole('link', { name: /Cumplimiento Semanal/i });
    expect(enlaceCumplimiento.getAttribute('href')).toBe('/coach/monitor-adherencia');
  });

  it('P4 · Montos con formato: se ven $1.900,00, Meta: $2.500,00 USD, $1.250,00 y no existe Montos en USD', async () => {
    mockApi.mockResolvedValue(fixtureDashboard());
    montarPagina();

    await screen.findByText('Carla Ruiz');

    expect(screen.getByText('$1.900,00')).toBeTruthy();
    expect(screen.getByText(/Meta:\s*\$2\.500,00\s*USD/i)).toBeTruthy();
    expect(screen.queryByText('Montos en USD')).toBeNull();
    expect(screen.getByText('$1.250,00')).toBeTruthy();
  });

  it('P5 · Filas a la ficha: hay enlaces a /coach/alumnos/perfil-mora-1 y /coach/alumnos/perfil-inac-1', async () => {
    mockApi.mockResolvedValue(fixtureDashboard());
    montarPagina();

    const enlaceCarla = await screen.findByRole('link', { name: /Carla Ruiz/i });
    expect(enlaceCarla.getAttribute('href')).toBe('/coach/alumnos/perfil-mora-1');

    const enlaceLuis = screen.getByRole('link', { name: /Luis Prado/i });
    expect(enlaceLuis.getAttribute('href')).toBe('/coach/alumnos/perfil-inac-1');
  });

  it('P6 · Vacío sin emoji: con listas vacías se ven textos limpios y document.body.textContent no contiene 🎉', async () => {
    mockApi.mockResolvedValue(
      fixtureDashboard({
        bandejasRapidas: {
          alumnosEnMora: [],
          alumnosInactivosEntrenamiento: [],
        },
      })
    );
    montarPagina();

    expect(await screen.findByText('Sin pagos vencidos por ahora')).toBeTruthy();
    expect(screen.getByText('Sin alumnos inactivos por ahora')).toBeTruthy();
    expect(document.body.textContent).not.toContain('🎉');
  });

  it('P7 · Dos cuotas del mismo alumno', async () => {
    const spyError = vi.spyOn(console, 'error');

    mockApi.mockResolvedValue(
      fixtureDashboard({
        bandejasRapidas: {
          alumnosEnMora: [
            {
              alumnoId: 'perfil-mora-1',
              nombre: 'Carla Ruiz',
              cuotaId: 'c-1',
              saldoPendienteUsd: '1250.00',
              diasVencido: 5,
            },
            {
              alumnoId: 'perfil-mora-1',
              nombre: 'Carla Ruiz',
              cuotaId: 'c-2',
              saldoPendienteUsd: '750.00',
              diasVencido: 12,
            },
          ],
        },
      })
    );
    montarPagina();

    const enlaces = await screen.findAllByRole('link', { name: /Carla Ruiz/i });
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0].getAttribute('href')).toBe('/coach/alumnos/perfil-mora-1');
    expect(enlaces[1].getAttribute('href')).toBe('/coach/alumnos/perfil-mora-1');

    const llamadaConSameKey = spyError.mock.calls.find((args) =>
      args.some((arg) => String(arg).includes('same key'))
    );
    expect(llamadaConSameKey).toBeUndefined();
  });
});
