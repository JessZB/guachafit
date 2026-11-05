// @vitest-environment jsdom
/**
 * Interacción · Carga con esqueletos en DashboardPage.
 *
 * Contrato:
 * - Mientras la carga está pendiente:
 *   - Existe role="status" de inmediato con «Cargando el resumen».
 *   - La franja de atención («—») sigue visible sin saltar ni ocultarse.
 *   - NO hay spinner (.animate-spin ausente).
 *   - Tras avanzar 150 ms aparece [data-esqueleto] bajo la franja.
 * - Al resolver la carga:
 *   - role="status" y [data-esqueleto] desaparecen, dando paso al dashboard con datos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardComandoDTO } from '@guachafit/shared';

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

function fixtureDashboard(): DashboardComandoDTO {
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
    },
    bandejasRapidas: {
      pagosPorConciliar: 3,
      checkinsAntropometricosPendientes: 2,
      alumnosEnMora: [],
      alumnosInactivosEntrenamiento: [],
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

describe('DashboardPage · Carga con esqueleto sin saltos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authDemo.modoDemo = false;
    onlineManager.setOnline(true);
    mockApi.mockReset();
    mockApi.get.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const cliente of clientesConsulta.splice(0)) cliente.clear();
  });

  it('muestra role="status" de inmediato sin spinner, dibuja esqueleto tras 150 ms y desaparece al resolver', async () => {
    let resolverApi: (datos: DashboardComandoDTO) => void = () => {};
    const peticionPendiente = new Promise<DashboardComandoDTO>((resolve) => {
      resolverApi = resolve;
    });
    mockApi.mockImplementation(() => peticionPendiente);

    montarPagina();

    // 1. role="status" inmediato con «Cargando el resumen»
    const statusEl = screen.getByRole('status');
    expect(statusEl.textContent).toContain('Cargando el resumen');

    // 2. Franja de atención («—») sigue visible
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    // 3. Ausencia absoluta de spinner tradicional
    expect(document.querySelector('.animate-spin')).toBeNull();

    // 4. Antes de 150 ms (0 ms) el esqueleto no se ha montado todavía
    expect(document.querySelector('[data-esqueleto]')).toBeNull();

    // 5. Tras 150 ms aparece el esqueleto bajo la franja
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(document.querySelector('[data-esqueleto]')).not.toBeNull();
    expect(document.querySelector('.animate-spin')).toBeNull();

    // 6. Al resolver la carga: desaparecen role="status" y el esqueleto
    await act(async () => {
      resolverApi(fixtureDashboard());
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[data-esqueleto]')).toBeNull();
  });
});
