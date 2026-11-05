// @vitest-environment happy-dom
/**
 * ZH-2: tests en fase roja para `useResumenMenu`.
 * Contrato 4:
 * Con perfil Asia/Tokyo la petición del resumen/semana lleva timezone=Asia/Tokyo;
 * con perfil sin zona, America/Caracas. Si el perfil cambia entre renders,
 * la recarga usa la nueva zona.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const { authMock, mockApi } = vi.hoisted(() => ({
  authMock: {
    user: null as { id?: string; zonaHoraria?: string | null } | null,
  },
  mockApi: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  }),
}));

vi.mock('../../../context/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    isDemoMode: false,
  }),
}));

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    apiClient: mockApi,
  };
});

import { useResumenMenu } from './use-resumen-menu';

function peticionesSemana(): string[] {
  return mockApi.mock.calls
    .map(([url]) => decodeURIComponent(String(url)))
    .filter((url) => url.includes('/rutina/semana-actual'));
}

describe('ZH-2 · useResumenMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockApi.mockReset();
    mockApi.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Asia/Tokyo la petición de semana-actual incluye timezone=Asia/Tokyo', async () => {
    const user = { id: 'u-tokyo', zonaHoraria: 'Asia/Tokyo' };
    authMock.user = user;

    renderHook(() => useResumenMenu(user as any, false));

    await waitFor(() => {
      const llamadas = peticionesSemana();
      expect(llamadas.length).toBeGreaterThan(0);
      expect(llamadas[0]).toContain('timezone=Asia/Tokyo');
    });
  });

  it('con perfil sin zona horaria (null o undefined) solicita timezone=America/Caracas', async () => {
    const userSinZona = { id: 'u-sin-zona', zonaHoraria: null };
    authMock.user = userSinZona;

    renderHook(() => useResumenMenu(userSinZona as any, false));

    await waitFor(() => {
      const llamadas = peticionesSemana();
      expect(llamadas.length).toBeGreaterThan(0);
      expect(llamadas[0]).toContain('timezone=America/Caracas');
    });
  });

  it('si el perfil cambia entre renders, la recarga usa la nueva zona', async () => {
    let currentUser: { id: string; zonaHoraria?: string | null } = {
      id: 'u-dinamico',
      zonaHoraria: 'Asia/Tokyo',
    };
    authMock.user = currentUser;

    const { rerender } = renderHook(
      ({ u }) => useResumenMenu(u as any, false),
      { initialProps: { u: currentUser } }
    );

    await waitFor(() => {
      const llamadas = peticionesSemana();
      expect(llamadas.some((l) => l.includes('timezone=Asia/Tokyo'))).toBe(true);
    });

    mockApi.mockClear();

    // Actualizamos a Europa/Madrid
    currentUser = { id: 'u-dinamico', zonaHoraria: 'Europe/Madrid' };
    authMock.user = currentUser;
    rerender({ u: currentUser });

    await waitFor(() => {
      const llamadas = peticionesSemana();
      expect(llamadas.length).toBeGreaterThan(0);
      expect(llamadas[llamadas.length - 1]).toContain('timezone=Europe/Madrid');
    });
  });

  it('regresión Caracas: con perfil America/Caracas la petición lleva timezone=America/Caracas', async () => {
    const userCaracas = { id: 'u-caracas', zonaHoraria: 'America/Caracas' };
    authMock.user = userCaracas;

    renderHook(() => useResumenMenu(userCaracas as any, false));

    await waitFor(() => {
      const llamadas = peticionesSemana();
      expect(llamadas.length).toBeGreaterThan(0);
      expect(llamadas[0]).toContain('timezone=America/Caracas');
    });
  });
});
