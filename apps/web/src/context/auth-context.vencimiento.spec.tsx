// @vitest-environment jsdom
/**
 * 06 · entrenamiento-ux · Contrato 6:
 * Tras un vencimiento forzado de sesión (cerrarSesionPorVencimiento),
 * las claves `guachafit_cronometro_*` del localStorage se eliminan,
 * pero la base de datos offline (clearOfflineData) NO se borra (decisión A1/D2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { Rol } from '@guachafit/shared';

const { mockApiClient, mockClearOfflineData, expirarHolder } = vi.hoisted(() => ({
  mockApiClient: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }),
  mockClearOfflineData: vi.fn().mockResolvedValue(undefined),
  expirarHolder: {
    manejador: null as ((mensaje: string) => void) | null,
  },
}));

vi.mock('../lib/offline-db', () => ({
  clearOfflineData: mockClearOfflineData,
}));

vi.mock('../lib/offline-sync', () => ({
  processOutboxQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return {
    ...actual,
    registrarManejadorSesionExpirada: (fn: any) => {
      expirarHolder.manejador = fn;
      return actual.registrarManejadorSesionExpirada(fn);
    },
    apiClient: mockApiClient,
  };
});

import { AuthProvider, useAuth } from './auth-context';

describe('auth-context · cerrarSesionPorVencimiento y limpieza de cronómetro', () => {
  beforeEach(() => {
    localStorage.clear();
    mockClearOfflineData.mockClear();
    expirarHolder.manejador = null;
    mockApiClient.mockReset();
    mockApiClient.get.mockReset().mockResolvedValue({
      usuario: { id: 'u-1', email: 'alumno@example.com', rol: Rol.ALUMNO },
    });
    mockApiClient.post.mockReset();
    mockApiClient.patch.mockReset();
    mockApiClient.delete.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('tras vencimiento forzado de sesión, elimina claves guachafit_cronometro_* pero NO borra datos offline de Dexie', async () => {
    localStorage.setItem('guachafit_token', 'token-valido');
    localStorage.setItem(
      'guachafit_user',
      JSON.stringify({
        id: 'u-1',
        email: 'alumno@example.com',
        rol: Rol.ALUMNO,
      })
    );
    localStorage.setItem('guachafit_cronometro_sesion-1', JSON.stringify({ v: 1, sesionId: 'sesion-1' }));
    localStorage.setItem('guachafit_cronometro_sesion-2', JSON.stringify({ v: 1, sesionId: 'sesion-2' }));
    localStorage.setItem('otra_clave_app', 'valor-conservado');

    function ComponentePrueba() {
      const { user, avisoSesion } = useAuth();
      return (
        <div>
          <span data-testid="user-id">{user?.id ?? 'sin-usuario'}</span>
          <span data-testid="aviso">{avisoSesion ?? 'sin-aviso'}</span>
        </div>
      );
    }

    render(
      <AuthProvider>
        <ComponentePrueba />
      </AuthProvider>
    );

    expect(screen.getByTestId('user-id').textContent).toBe('u-1');
    expect(expirarHolder.manejador).not.toBeNull();

    // Disparamos el cierre por vencimiento forzado de sesión
    await act(async () => {
      expirarHolder.manejador!('Tu sesión ha vencido. Inicia sesión nuevamente.');
    });

    // 1. Las claves guachafit_cronometro_* deben eliminarse
    expect(localStorage.getItem('guachafit_cronometro_sesion-1')).toBeNull();
    expect(localStorage.getItem('guachafit_cronometro_sesion-2')).toBeNull();

    // 2. Otras claves no se tocan indebidamente
    expect(localStorage.getItem('otra_clave_app')).toBe('valor-conservado');

    // 3. Dexie NO se borra en vencimiento forzado (decisión A1/D2)
    expect(mockClearOfflineData).not.toHaveBeenCalled();

    // 4. El aviso de sesión se establece y el usuario se quita
    expect(screen.getByTestId('user-id').textContent).toBe('sin-usuario');
    expect(screen.getByTestId('aviso').textContent).toBe(
      'Tu sesión ha vencido. Inicia sesión nuevamente.'
    );
  });
});
