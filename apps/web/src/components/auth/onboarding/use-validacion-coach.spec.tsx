// @vitest-environment jsdom
/**
 * Prompt 86 (Ola 3) · spec del hook `useValidacionCoach` (mismo mecanismo que el
 * contenedor original: debounce de 400ms + `apiClient` con `skipAuth`, sin providers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
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

import { apiClient } from '../../../lib/api-client';
import { useValidacionCoach } from './use-validacion-coach';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

const COACH = { coachCode: 'COACH1', nombre: 'Ana Perez', nombreComercial: null };

function Testigo({ inicial }: { inicial: string }) {
  const [codigo, setCodigo] = useState(inicial);
  const { estado, coachInfo } = useValidacionCoach(codigo);
  return (
    <div>
      <p data-testid="estado">{estado}</p>
      <p data-testid="coach">{coachInfo ? coachInfo.nombre : 'sin-coach'}</p>
      <button type="button" onClick={() => setCodigo('COACH1')}>
        fijar
      </button>
    </div>
  );
}

function renderTestigo(inicial: string) {
  render(<Testigo inicial={inicial} />);
}

beforeEach(() => {
  mockApi.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useValidacionCoach', () => {
  it('vacio cuando el codigo esta en blanco y no llama a la API', async () => {
    mockApi.mockResolvedValue(COACH);
    renderTestigo('   ');

    expect(screen.getByTestId('estado').textContent).toBe('vacio');
    await new Promise((r) => setTimeout(r, 600));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('invalido con formato erroneo sin llamar a la API', async () => {
    mockApi.mockResolvedValue(COACH);
    renderTestigo('ab!');

    expect(screen.getByTestId('estado').textContent).toBe('invalido');
    await new Promise((r) => setTimeout(r, 600));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('resuelve contra GET /alumnos/coach/:code y queda valido', async () => {
    mockApi.mockResolvedValue(COACH);
    renderTestigo('coach1');

    expect(await screen.findByText('Ana Perez')).toBeTruthy();
    expect(screen.getByTestId('estado').textContent).toBe('valido');
    expect(mockApi).toHaveBeenCalledWith('/alumnos/coach/COACH1', { skipAuth: true });
  });

  it('si el GET falla queda invalido', async () => {
    mockApi.mockRejectedValue(new Error('no existe'));
    renderTestigo('XXXX');

    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('invalido'));
    expect(screen.getByTestId('coach').textContent).toBe('sin-coach');
  });

  it('revalida cuando el codigo cambia', async () => {
    mockApi.mockRejectedValue(new Error('no existe'));
    renderTestigo('XXXX');
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('invalido'));

    mockApi.mockResolvedValue(COACH);
    await act(async () => {
      screen.getByRole('button', { name: 'fijar' }).click();
    });
    expect(await screen.findByText('Ana Perez')).toBeTruthy();
  });
});
