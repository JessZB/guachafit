// @vitest-environment happy-dom
/**
 * Specs ZH-1 · Envío de zonaDispositivo en login (Fase roja TDD).
 * Contrato D: auth-context incluye zonaDispositivo en POST /auth/login y adopta usuario.zonaHoraria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { Rol } from '@guachafit/shared';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return {
    ...actual,
    apiClient: mockApiClient,
  };
});

vi.mock('../lib/date-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/date-format')>();
  return {
    ...actual,
    obtenerTimezoneDispositivo: () => 'Europe/Madrid',
  };
});

vi.mock('../lib/offline-db', () => ({
  clearOfflineData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/offline-sync', () => ({
  processOutboxQueue: vi.fn().mockResolvedValue(undefined),
}));

import { AuthProvider, useAuth } from './auth-context';

describe('auth-context · Contrato D (ZH-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiClient.mockReset();
    mockApiClient.get.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.patch.mockReset();
    mockApiClient.delete.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('W12: login("a@b.com","x") envía zonaDispositivo en POST /auth/login y actualiza user.zonaHoraria con la respuesta', async () => {
    mockApiClient.mockResolvedValueOnce({
      accessToken: 'token-test',
      refreshToken: 'refresh-test',
      usuario: {
        id: 'u-1',
        email: 'a@b.com',
        rol: Rol.ALUMNO,
        zonaHoraria: 'America/Caracas',
      },
    });

    let contextoAuth: ReturnType<typeof useAuth> | undefined;

    function ComponentePrueba() {
      contextoAuth = useAuth();
      return (
        <div>
          <button
            onClick={() => {
              void (contextoAuth!.login as any)({ email: 'a@b.com', password: 'x' });
            }}
          >
            Iniciar sesión
          </button>
          <span data-testid="user-zona">{contextoAuth.user?.zonaHoraria ?? 'sin-zona'}</span>
        </div>
      );
    }

    render(
      <AuthProvider>
        <ComponentePrueba />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByRole('button', { name: /iniciar sesión/i }).click();
    });

    expect(mockApiClient).toHaveBeenCalled();
    const loginCall = mockApiClient.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/auth/login')
    );
    expect(loginCall).toBeDefined();

    const cuerpo = JSON.parse(loginCall?.[1]?.body ?? '{}');
    expect(cuerpo).toHaveProperty('zonaDispositivo', 'Europe/Madrid');
    expect(cuerpo).toHaveProperty('email', 'a@b.com');
    expect(cuerpo).toHaveProperty('password', 'x');

    expect(contextoAuth?.user?.zonaHoraria).toBe('America/Caracas');
  });
});
