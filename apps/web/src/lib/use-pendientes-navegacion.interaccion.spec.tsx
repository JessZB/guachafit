// @vitest-environment jsdom
/**
 * Spec 1 · use-pendientes-navegacion.interaccion.spec.tsx
 * Contratos PN1–PN5 para el hook de pendientes de navegación.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { Rol, type AuthUserDTO } from '@guachafit/shared';
import { usePendientesNavegacion } from './use-pendientes-navegacion';
import { CLAVE_PENDIENTES_NAVEGACION } from './insignias-pendientes';

const authMock = vi.hoisted(() => ({
  user: {
    id: 'coach-1',
    email: 'coach@example.com',
    rol: 'entrenador' as AuthUserDTO['rol'],
  } as AuthUserDTO | null,
  isDemoMode: false,
}));

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    isDemoMode: authMock.isDemoMode,
  }),
}));

const mockApiClient = vi.hoisted(() => vi.fn());

vi.mock('./api-client', () => ({
  apiClient: mockApiClient,
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('usePendientesNavegacion', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    onlineManager.setOnline(true);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mockApiClient.mockReset();
    authMock.user = {
      id: 'coach-1',
      email: 'coach@example.com',
      rol: Rol.ENTRENADOR,
    };
    authMock.isDemoMode = false;
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    onlineManager.setOnline(true);
  });

  it('PN1 · Entrenador real: pendiente devuelve null, resuelve con fixture mapeado', async () => {
    let resolver: (val: unknown) => void;
    const promesa = new Promise((resolve) => {
      resolver = resolve;
    });
    mockApiClient.mockReturnValue(promesa);

    const { result } = renderHook(() => usePendientesNavegacion(), {
      wrapper: createWrapper(queryClient),
    });

    // Mientras el GET está pendiente el resultado es null
    expect(result.current).toBeNull();
    expect(mockApiClient).toHaveBeenCalledTimes(1);
    expect(mockApiClient).toHaveBeenCalledWith('/entrenador/dashboard-comando');

    // Al resolver con un fixture
    resolver!({
      kpisMacro: {
        alumnosEnRiesgoDeportivo: 4,
        alumnosEnMoraFinanciera: 1,
      },
      bandejasRapidas: {
        pagosPorConciliar: 3,
        checkinsAntropometricosPendientes: 2,
      },
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        pagosPorValidar: 3,
        evaluaciones: 2,
        enRiesgo: 4,
        enMora: 1,
      });
    });
  });

  it('PN2 · Error: si el GET rechaza el resultado es null y nunca ceros', async () => {
    mockApiClient.mockRejectedValue(new Error('Fallo de red'));

    const { result } = renderHook(() => usePendientesNavegacion(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current).toBeNull();
    });

    expect(result.current).not.toEqual({
      pagosPorValidar: 0,
      evaluaciones: 0,
      enRiesgo: 0,
      enMora: 0,
    });
  });

  it('PN3 · Demo: con isDemoMode en true no llama al API y devuelve valores de DASHBOARD_COMANDO_DEMO', () => {
    authMock.isDemoMode = true;

    const { result } = renderHook(() => usePendientesNavegacion(), {
      wrapper: createWrapper(queryClient),
    });

    expect(mockApiClient).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      pagosPorValidar: 3,
      evaluaciones: 2,
      enRiesgo: 4,
      enMora: 2,
    });
  });

  it('PN4 · Alumno: con rol de alumno el resultado es null y apiClient no se llama', () => {
    authMock.user = {
      id: 'alumno-1',
      email: 'alumno@example.com',
      rol: Rol.ALUMNO,
    };
    authMock.isDemoMode = false;

    const { result } = renderHook(() => usePendientesNavegacion(), {
      wrapper: createWrapper(queryClient),
    });

    expect(mockApiClient).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('PN5 · Invalidación: tras invalidar la clave el siguiente GET actualiza pagosPorValidar y suma 2 llamadas', async () => {
    mockApiClient.mockResolvedValueOnce({
      kpisMacro: {
        alumnosEnRiesgoDeportivo: 4,
        alumnosEnMoraFinanciera: 1,
      },
      bandejasRapidas: {
        pagosPorConciliar: 3,
        checkinsAntropometricosPendientes: 2,
      },
    });

    const { result } = renderHook(() => usePendientesNavegacion(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        pagosPorValidar: 3,
        evaluaciones: 2,
        enRiesgo: 4,
        enMora: 1,
      });
    });

    expect(mockApiClient).toHaveBeenCalledTimes(1);

    mockApiClient.mockResolvedValueOnce({
      kpisMacro: {
        alumnosEnRiesgoDeportivo: 4,
        alumnosEnMoraFinanciera: 1,
      },
      bandejasRapidas: {
        pagosPorConciliar: 1,
        checkinsAntropometricosPendientes: 2,
      },
    });

    await queryClient.invalidateQueries({ queryKey: [CLAVE_PENDIENTES_NAVEGACION] });

    await waitFor(() => {
      expect(result.current?.pagosPorValidar).toBe(1);
    });

    expect(mockApiClient).toHaveBeenCalledTimes(2);
  });
});
