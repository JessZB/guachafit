// @vitest-environment happy-dom
/**
 * UX-12 · Hook useDashboardComando (Contrato H1–H7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { DashboardComandoDTO } from '@guachafit/shared';
import { useDashboardComando } from './use-dashboard-comando';
import { DASHBOARD_COMANDO_DEMO } from '../../../lib/dashboard-comando-demo';

const mockUseAuth = vi.fn();

vi.mock('../../../context/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    apiClient: vi.fn(),
  };
});

import { apiClient } from '../../../lib/api-client';

const mockApiClient = vi.mocked(apiClient);

function crearDiferida<T>() {
  let resolve!: (valor: T) => void;
  let reject!: (razon?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixtureDashboard(id = '1'): DashboardComandoDTO {
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
      alumnosEnMora: [
        {
          alumnoId: `mora-${id}`,
          nombre: `Alumno Mora ${id}`,
          cuotaId: `c-${id}`,
          saldoPendienteUsd: '30.00',
          diasVencido: 5,
        },
      ],
      alumnosInactivosEntrenamiento: [
        {
          alumnoId: `inac-${id}`,
          nombre: `Alumno Inactivo ${id}`,
          diasSinEntrenar: 6,
        },
      ],
    },
  };
}

describe('useDashboardComando (UX-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isDemoMode: false,
      user: { id: 'coach-1', email: 'coach@example.com', rol: 'entrenador' },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('H1 · Carga real: con isDemoMode: false inicia cargando y resuelve datos reales', async () => {
    mockUseAuth.mockReturnValue({ isDemoMode: false });
    const diferida = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValue(diferida.promise as any);

    const { result } = renderHook(() => useDashboardComando());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.dashboard).toBeNull();
    expect(mockApiClient).toHaveBeenCalledTimes(1);
    expect(mockApiClient).toHaveBeenCalledWith('/entrenador/dashboard-comando');

    const fixture = fixtureDashboard('real-1');
    await act(async () => {
      diferida.resolve(fixture);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.dashboard).toEqual(fixture);
    });
  });

  it('H2 · Demo: con isDemoMode: true no llama a apiClient y devuelve DASHBOARD_COMANDO_DEMO de inmediato', () => {
    mockUseAuth.mockReturnValue({ isDemoMode: true });

    const { result } = renderHook(() => useDashboardComando());

    expect(mockApiClient).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dashboard).toEqual(DASHBOARD_COMANDO_DEMO);
  });

  it('H3 · Error inicial: si GET rechaza guarda error y recargar() reintenta', async () => {
    mockUseAuth.mockReturnValue({ isDemoMode: false });
    const diferida1 = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida1.promise as any);

    const { result } = renderHook(() => useDashboardComando());

    await act(async () => {
      diferida1.reject(new Error('Fallo de red'));
    });

    await waitFor(() => {
      expect(result.current.dashboard).toBeNull();
      expect(result.current.error).toBe('Fallo de red');
      expect(result.current.isLoading).toBe(false);
    });

    const diferida2 = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida2.promise as any);

    act(() => {
      result.current.recargar();
    });

    const fixture = fixtureDashboard('reintento');
    await act(async () => {
      diferida2.resolve(fixture);
    });

    await waitFor(() => {
      expect(result.current.dashboard).toEqual(fixture);
      expect(result.current.error).toBeNull();
    });
  });

  it('H4 · Fallo de recarga con datos: conserva fixture previo al fallar la recarga', async () => {
    mockUseAuth.mockReturnValue({ isDemoMode: false });
    const fixtureA = fixtureDashboard('A');
    const diferida1 = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida1.promise as any);

    const { result } = renderHook(() => useDashboardComando());

    await act(async () => {
      diferida1.resolve(fixtureA);
    });

    await waitFor(() => {
      expect(result.current.dashboard).toEqual(fixtureA);
    });

    const diferida2 = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida2.promise as any);

    act(() => {
      result.current.recargar();
    });

    await act(async () => {
      diferida2.reject(new Error('Fallo de red'));
    });

    await waitFor(() => {
      expect(result.current.dashboard).toEqual(fixtureA);
      expect(result.current.error).toBe('Fallo de red');
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('H5 · Respuesta obsoleta: resuelve GET 3 antes que GET 2 y descarta GET 2', async () => {
    mockUseAuth.mockReturnValue({ isDemoMode: false });
    const fixtureInicial = fixtureDashboard('ini');
    const diferida1 = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida1.promise as any);

    const { result } = renderHook(() => useDashboardComando());

    await act(async () => {
      diferida1.resolve(fixtureInicial);
    });

    await waitFor(() => {
      expect(result.current.dashboard).toEqual(fixtureInicial);
    });

    const diferida2 = crearDiferida<DashboardComandoDTO>();
    const diferida3 = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida2.promise as any);
    mockApiClient.mockReturnValueOnce(diferida3.promise as any);

    act(() => {
      result.current.recargar();
    });
    act(() => {
      result.current.recargar();
    });

    const fixtureB = fixtureDashboard('B');
    const fixtureC = fixtureDashboard('C');

    // Resuelve primero el GET 3 con el fixture C
    await act(async () => {
      diferida3.resolve(fixtureC);
    });

    await waitFor(() => {
      expect(result.current.dashboard).toEqual(fixtureC);
    });

    // Después resuelve el GET 2 con el fixture B
    await act(async () => {
      diferida2.resolve(fixtureB);
    });

    // El estado final debe mantenerse en C
    await waitFor(() => {
      expect(result.current.dashboard).toEqual(fixtureC);
    });
  });

  it('H6 · Cambio a demo con la petición en vuelo: ignora respuesta tardía y fija demo', async () => {
    mockUseAuth.mockReturnValue({ isDemoMode: false });
    const diferida = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida.promise as any);

    const { result, rerender } = renderHook(() => useDashboardComando());

    expect(result.current.isLoading).toBe(true);

    mockUseAuth.mockReturnValue({ isDemoMode: true });
    rerender();

    const fixtureA = fixtureDashboard('A');
    await act(async () => {
      diferida.resolve(fixtureA);
    });

    await waitFor(() => {
      expect(result.current.dashboard).toEqual(DASHBOARD_COMANDO_DEMO);
    });
  });

  it('H7 · Salida del modo demo: limpia datos demo a null con GET pendiente y no vuelve a demo si falla', async () => {
    mockUseAuth.mockReturnValue({ isDemoMode: true });

    const { result, rerender } = renderHook(() => useDashboardComando());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.dashboard).toEqual(DASHBOARD_COMANDO_DEMO);

    const diferida = crearDiferida<DashboardComandoDTO>();
    mockApiClient.mockReturnValueOnce(diferida.promise as any);

    mockUseAuth.mockReturnValue({ isDemoMode: false });
    rerender();

    expect(result.current.dashboard).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      diferida.reject(new Error('Fallo de red'));
    });

    await waitFor(() => {
      expect(result.current.dashboard).toBeNull();
      expect(result.current.error).toBe('Fallo de red');
      expect(result.current.isLoading).toBe(false);
    });
  });
});
