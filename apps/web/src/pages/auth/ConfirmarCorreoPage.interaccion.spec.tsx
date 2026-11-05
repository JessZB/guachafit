// @vitest-environment happy-dom
/**
 * RF-018 RN-05 · regresión: interacción de la pantalla pública /confirmar-correo.
 *
 * Cubre:
 * 13. Bajo StrictMode, con `?token=abc`: UN solo POST con `skipAuth`, mensaje del servidor
 *     visible y token fuera de la URL.
 * 14. Tras un éxito, montar de nuevo sin token (mismo sessionStorage) muestra el resultado
 *     guardado y no repite el POST.
 * 15. Si el POST falla sin conexión aparece "Reintentar" y al pulsarlo se repite con el mismo token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    }),
  };
});

import { ErrorDeConexion, apiClient } from '../../lib/api-client';
import { ConfirmarCorreoPage } from './ConfirmarCorreoPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & { post: MockFn };

const MENSAJE_EXITO = 'Tu correo de acceso ahora es nuevo@example.com.';

function UrlActual() {
  const { search } = useLocation();
  return <p data-testid="url">{search}</p>;
}

function renderPagina(ruta: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[ruta]}>
        <ConfirmarCorreoPage />
        <UrlActual />
      </MemoryRouter>
    </StrictMode>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mockApi.mockReset();
  mockApi.post.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ConfirmarCorreoPage (RF-018 RN-05)', () => {
  it('13: con token hace un solo POST (StrictMode), muestra el mensaje y quita el token de la URL', async () => {
    mockApi.post.mockResolvedValue({ mensaje: MENSAJE_EXITO });

    renderPagina('/confirmar-correo?token=abc');

    expect(await screen.findByText(MENSAJE_EXITO)).toBeTruthy();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/confirmar-cambio-correo',
      { token: 'abc' },
      { skipAuth: true }
    );
    expect(screen.getByTestId('url').textContent ?? '').not.toContain('token');
  });

  it('14: tras un éxito, montar sin token (mismo sessionStorage) muestra lo guardado y no hace POST', async () => {
    mockApi.post.mockResolvedValue({ mensaje: MENSAJE_EXITO });

    const primera = renderPagina('/confirmar-correo?token=abc');
    expect(await screen.findByText(MENSAJE_EXITO)).toBeTruthy();
    primera.unmount();

    renderPagina('/confirmar-correo');
    expect(await screen.findByText(MENSAJE_EXITO)).toBeTruthy();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it('15: si el POST falla sin conexión, aparece Reintentar y al pulsarlo repite con el mismo token', async () => {
    mockApi.post.mockRejectedValueOnce(new ErrorDeConexion()).mockResolvedValue({
      mensaje: MENSAJE_EXITO,
    });

    renderPagina('/confirmar-correo?token=abc');

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      '/auth/confirmar-cambio-correo',
      { token: 'abc' },
      { skipAuth: true }
    );
    expect(mockApi.post).toHaveBeenNthCalledWith(
      2,
      '/auth/confirmar-cambio-correo',
      { token: 'abc' },
      { skipAuth: true }
    );
    expect(await screen.findByText(MENSAJE_EXITO)).toBeTruthy();
  });
});
