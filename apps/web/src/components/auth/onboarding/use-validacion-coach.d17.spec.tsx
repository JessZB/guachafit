// @vitest-environment jsdom
/**
 * D17 · RF-011: Hook `useValidacionCoach` con estado de error diferenciado y reintento.
 * Contratos: d17-contratos.md §4.2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { CoachPublicoDTO } from '@guachafit/shared';
import { ApiError, ErrorDeConexion } from '../../../lib/api-client';

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

const COACH: CoachPublicoDTO = {
  coachCode: 'COACH1',
  nombre: 'Ana Perez',
  nombreComercial: null,
};

function apiError(status: number, title: string, detail: string) {
  return new ApiError(status, {
    type: 'about:blank',
    status,
    title,
    detail,
    timestampUtc: '2026-11-04T00:00:00.000Z',
  });
}

beforeEach(() => {
  mockApi.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useValidacionCoach (D17 §4.2)', () => {
  it('la petición a /alumnos/coach/:code se dispara sin esperar 400 ms (sin debounce)', () => {
    vi.useFakeTimers();
    try {
      mockApi.mockResolvedValue(COACH);
      renderHook(() => useValidacionCoach('COACH1'));

      // Con temporizadores falsos, antes de avanzar el reloj ya se llamó a apiClient
      expect(mockApi).toHaveBeenCalledWith('/alumnos/coach/COACH1', { skipAuth: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('vacio cuando el código está en blanco y no llama a la API', async () => {
    mockApi.mockResolvedValue(COACH);
    const { result } = renderHook(() => useValidacionCoach('   '));

    expect(result.current.estado).toBe('vacio');
    expect(result.current.coachInfo).toBeNull();

    await new Promise((r) => setTimeout(r, 500));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('invalido sin llamar a la API cuando el formato es inválido', async () => {
    mockApi.mockResolvedValue(COACH);
    const { result } = renderHook(() => useValidacionCoach('ab!'));

    expect(result.current.estado).toBe('invalido');
    expect(result.current.coachInfo).toBeNull();

    await new Promise((r) => setTimeout(r, 500));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('404 de la API marca estado «invalido»', async () => {
    mockApi.mockRejectedValue(
      apiError(404, 'Not Found', 'El código de entrenador no es válido o no está disponible.')
    );

    const { result } = renderHook(() => useValidacionCoach('COACH1'));

    await waitFor(() => expect(result.current.estado).toBe('invalido'));
    expect(result.current.coachInfo).toBeNull();
  });

  it('400 de la API marca estado «invalido»', async () => {
    mockApi.mockRejectedValue(
      apiError(400, 'Bad Request', 'Formato de código inválido.')
    );

    const { result } = renderHook(() => useValidacionCoach('COACH1'));

    await waitFor(() => expect(result.current.estado).toBe('invalido'));
    expect(result.current.coachInfo).toBeNull();
  });

  it('error de red marca estado «error» (no «invalido»)', async () => {
    mockApi.mockRejectedValue(new ErrorDeConexion());

    const { result } = renderHook(() => useValidacionCoach('COACH1'));

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.coachInfo).toBeNull();
  });

  it('HTTP 500 marca estado «error» (no «invalido»)', async () => {
    mockApi.mockRejectedValue(
      apiError(500, 'Internal Server Error', 'Error interno en base de datos.')
    );

    const { result } = renderHook(() => useValidacionCoach('COACH1'));

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.coachInfo).toBeNull();
  });

  it('HTTP 429 marca estado «error» (no «invalido»)', async () => {
    mockApi.mockRejectedValue(
      apiError(429, 'Too Many Requests', 'Límite de peticiones alcanzado.')
    );

    const { result } = renderHook(() => useValidacionCoach('COACH1'));

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.coachInfo).toBeNull();
  });

  it('reintentar() vuelve a consultar y puede terminar en «valido»', async () => {
    mockApi.mockRejectedValueOnce(new ErrorDeConexion());

    const { result } = renderHook(() => useValidacionCoach('COACH1'));

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(mockApi).toHaveBeenCalledTimes(1);

    mockApi.mockResolvedValueOnce(COACH);

    act(() => {
      // reintentar debe estar expuesto por el hook
      (result.current as unknown as { reintentar: () => void }).reintentar();
    });

    await waitFor(() => expect(result.current.estado).toBe('valido'));
    expect(result.current.coachInfo).toEqual(COACH);
    expect(mockApi).toHaveBeenCalledTimes(2);
  });

  it('sigue cancelando respuestas obsoletas si el código cambia durante la llamada', async () => {
    let resolverPrimero: (val: unknown) => void = () => {};
    const promesaPrimera = new Promise((resolve) => {
      resolverPrimero = resolve;
    });

    mockApi.mockImplementationOnce(() => promesaPrimera);

    let codigo = 'COACH1';
    const { result, rerender } = renderHook(() => useValidacionCoach(codigo));

    await waitFor(() => expect(result.current.estado).toBe('validando'));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/alumnos/coach/COACH1', { skipAuth: true })
    );

    const COACH2: CoachPublicoDTO = {
      coachCode: 'COACH2',
      nombre: 'Carlos Ruiz',
      nombreComercial: null,
    };
    mockApi.mockResolvedValueOnce(COACH2);
    codigo = 'COACH2';
    rerender();

    await waitFor(() => expect(result.current.estado).toBe('valido'), { timeout: 2500 });
    expect(result.current.coachInfo).toEqual(COACH2);

    // Si la primera respuesta llega ahora, no debe sobrescribir
    act(() => {
      resolverPrimero(COACH);
    });

    expect(result.current.coachInfo).toEqual(COACH2);
  });
});
