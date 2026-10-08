// @vitest-environment jsdom
/**
 * RF-018 P2 · regresión: guardado de la zona horaria de Ajustes.
 *
 * El guardado pasa `OPCIONES_GUARDADO_AJUSTES` (`{ tiempoLimiteMs: 15000 }`) y, si el plazo
 * vence, el selector muestra MENSAJE_TIEMPO_AGOTADO.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

import { ErrorTiempoAgotado, MENSAJE_TIEMPO_AGOTADO, apiClient } from '../../lib/api-client';
import { ZonaHorariaPerfil } from './ZonaHorariaPerfil';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & { patch: MockFn };

function renderSelector() {
  return render(
    <ZonaHorariaPerfil
      id="zona-horaria"
      zonaActual="America/Caracas"
      endpoint="/alumnos/me/zona-horaria"
    />
  );
}

beforeEach(() => {
  mockApi.mockReset();
  mockApi.patch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ZonaHorariaPerfil: tiempo límite del guardado (RF-018 P2)', () => {
  it('resilience H2: el guardado pasa { tiempoLimiteMs: 15000 }', async () => {
    mockApi.patch.mockResolvedValue({});
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar zona horaria' }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledTimes(1));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/alumnos/me/zona-horaria',
      { zonaHoraria: 'America/Caracas' },
      { tiempoLimiteMs: 15000 }
    );
    expect(await screen.findByText('Zona horaria guardada.')).toBeTruthy();
  });

  it('resilience H2: al vencer el plazo se muestra MENSAJE_TIEMPO_AGOTADO', async () => {
    mockApi.patch.mockRejectedValue(new ErrorTiempoAgotado());
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar zona horaria' }));

    expect(await screen.findByText(MENSAJE_TIEMPO_AGOTADO)).toBeTruthy();
  });
});
