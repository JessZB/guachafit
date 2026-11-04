// @vitest-environment jsdom
/**
 * D17 · RF-011: Hook `useEnlaceCaptacion` con rotación, pausa/reanudación y contador.
 * Contratos: d17-contratos.md §4.4
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  const mockFn = vi.fn();
  const mockPost = vi.fn((endpoint: string, body?: unknown, opts?: unknown) =>
    mockFn(endpoint, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined, ...(opts as object) })
  );
  const mockPatch = vi.fn((endpoint: string, body?: unknown, opts?: unknown) =>
    mockFn(endpoint, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined, ...(opts as object) })
  );
  return {
    ...actual,
    apiClient: Object.assign(mockFn, {
      get: vi.fn(),
      post: mockPost,
      patch: mockPatch,
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { apiClient } from '../../../lib/api-client';
import { useEnlaceCaptacion } from './use-enlace-captacion';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

const PERFIL_COACH = {
  coachCode: 'COACH1',
  captacionActiva: true,
  enlaceRotadoEnUtc: null,
  registrosPorEnlace: 5,
};

beforeEach(() => {
  mockApi.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useEnlaceCaptacion (D17 §4.4)', () => {
  it('expone captacionActiva y registrosPorEnlace desde GET /entrenador/perfil', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);

    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    expect(result.current.captacionActiva).toBe(true);
    expect(result.current.registrosPorEnlace).toBe(5);
    expect(mockApi).toHaveBeenCalledWith('/entrenador/perfil');
  });

  it('rotarEnlace llama a POST /entrenador/captacion/rotar y actualiza coachCode y registrationUrl', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    const respuestaRotacion = {
      coachCode: 'NUEVO777',
      captacionActiva: true,
      enlaceRotadoEnUtc: '2026-11-04T12:00:00.000Z',
      registrosPorEnlace: 0,
      cambioAplicado: true,
      mensaje: 'Tu enlace anterior dejó de funcionar. Comparte el nuevo.',
    };

    mockApi.mockImplementation((endpoint: string, opts?: { method?: string }) => {
      if (endpoint === '/entrenador/captacion/rotar' || opts?.method === 'POST') {
        return Promise.resolve(respuestaRotacion);
      }
      return Promise.reject(new Error(`Inesperado: ${endpoint}`));
    });

    await act(async () => {
      await result.current.rotarEnlace();
    });

    expect(result.current.coachCode).toBe('NUEVO777');
    expect(result.current.registrationUrl).toContain('NUEVO777');
    expect(result.current.registrosPorEnlace).toBe(0);
    expect(result.current.errorCaptacion).toBeNull();

    const llamada = mockApi.mock.calls.find((c) => c[0] === '/entrenador/captacion/rotar');
    expect(llamada).toBeTruthy();
  });

  it('durante rotarEnlace rotando es true y al finalizar vuelve a false', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    let resolverRotar: (val: unknown) => void = () => {};
    const promesaRotar = new Promise((resolve) => {
      resolverRotar = resolve;
    });

    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/entrenador/captacion/rotar') {
        return promesaRotar;
      }
      return Promise.resolve();
    });

    let promesaAct: Promise<void>;
    act(() => {
      promesaAct = result.current.rotarEnlace();
    });

    expect(result.current.rotando).toBe(true);

    await act(async () => {
      resolverRotar({
        coachCode: 'ROTADO12',
        captacionActiva: true,
        registrosPorEnlace: 0,
      });
      await promesaAct;
    });

    expect(result.current.rotando).toBe(false);
  });

  it('un fallo en rotarEnlace deja errorCaptacion y no cambia el estado', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/entrenador/captacion/rotar') {
        return Promise.reject(new Error('Fallo al rotar'));
      }
      return Promise.resolve();
    });

    await act(async () => {
      await result.current.rotarEnlace();
    });

    expect(result.current.coachCode).toBe('COACH1');
    expect(result.current.errorCaptacion).toBeTruthy();
    expect(result.current.rotando).toBe(false);
  });

  it('alternarCaptacion llama a PATCH /entrenador/captacion con { activa: !captacionActiva }', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH); // captacionActiva = true
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    const respuestaPatch = {
      coachCode: 'COACH1',
      captacionActiva: false,
      enlaceRotadoEnUtc: null,
      registrosPorEnlace: 5,
      cambioAplicado: true,
      mensaje: 'Captación pausada. Tu enlace no admite nuevos registros.',
    };

    mockApi.mockImplementation((endpoint: string, opts?: { method?: string; body?: string }) => {
      if (endpoint === '/entrenador/captacion' && (opts?.method === 'PATCH' || !opts?.method)) {
        return Promise.resolve(respuestaPatch);
      }
      return Promise.reject(new Error(`Inesperado: ${endpoint}`));
    });

    await act(async () => {
      await result.current.alternarCaptacion();
    });

    const llamada = mockApi.mock.calls.find((c) => c[0] === '/entrenador/captacion');
    expect(llamada).toBeTruthy();
    const cuerpo = typeof llamada?.[1]?.body === 'string' ? JSON.parse(llamada[1].body) : llamada?.[1]?.body;
    expect(cuerpo).toEqual({ activa: false });

    expect(result.current.captacionActiva).toBe(false);
    expect(result.current.errorCaptacion).toBeNull();
  });

  it('durante alternarCaptacion cambiandoCaptacion es true y al finalizar vuelve a false', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    let resolverPatch: (val: unknown) => void = () => {};
    const promesaPatch = new Promise((resolve) => {
      resolverPatch = resolve;
    });

    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/entrenador/captacion') {
        return promesaPatch;
      }
      return Promise.resolve();
    });

    let promesaAct: Promise<void>;
    act(() => {
      promesaAct = result.current.alternarCaptacion();
    });

    expect(result.current.cambiandoCaptacion).toBe(true);

    await act(async () => {
      resolverPatch({
        coachCode: 'COACH1',
        captacionActiva: false,
        registrosPorEnlace: 5,
      });
      await promesaAct;
    });

    expect(result.current.cambiandoCaptacion).toBe(false);
  });

  it('un fallo en alternarCaptacion deja errorCaptacion y no cambia captacionActiva', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));

    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/entrenador/captacion') {
        return Promise.reject(new Error('Fallo al cambiar captación'));
      }
      return Promise.resolve();
    });

    await act(async () => {
      await result.current.alternarCaptacion();
    });

    expect(result.current.captacionActiva).toBe(true);
    expect(result.current.errorCaptacion).toBeTruthy();
    expect(result.current.cambiandoCaptacion).toBe(false);
  });

  it('en modo demo no llama a la API al rotar ni al alternar captación', async () => {
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: true }));

    expect(mockApi).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.rotarEnlace();
    });
    await act(async () => {
      await result.current.alternarCaptacion();
    });

    expect(mockApi).not.toHaveBeenCalled();
  });

  it('recargarCaptacion() vuelve a pedir GET /entrenador/perfil y actualiza el estado', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));
    expect(mockApi).toHaveBeenCalledTimes(1);

    const PERFIL_ACTUALIZADO = {
      coachCode: 'COACH1',
      captacionActiva: false,
      enlaceRotadoEnUtc: null,
      registrosPorEnlace: 8,
    };
    mockApi.mockResolvedValueOnce(PERFIL_ACTUALIZADO);

    await act(async () => {
      result.current.recargarCaptacion();
    });

    await waitFor(() => expect(result.current.registrosPorEnlace).toBe(8));
    expect(result.current.captacionActiva).toBe(false);
    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(mockApi).toHaveBeenLastCalledWith('/entrenador/perfil');
  });

  it('recargarCaptacion() no llama a la API en modo demo', async () => {
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: true }));

    expect(mockApi).not.toHaveBeenCalled();

    act(() => {
      result.current.recargarCaptacion();
    });

    expect(mockApi).not.toHaveBeenCalled();
  });

  it('si el refresco falla, conserva los datos previos y coachCodeError sigue en null cuando ya había datos', async () => {
    mockApi.mockResolvedValueOnce(PERFIL_COACH);
    const { result } = renderHook(() => useEnlaceCaptacion({ isDemoMode: false }));

    await waitFor(() => expect(result.current.coachCode).toBe('COACH1'));
    expect(result.current.coachCodeError).toBeNull();

    mockApi.mockRejectedValueOnce(new Error('Network error on refresh'));

    await act(async () => {
      result.current.recargarCaptacion();
    });

    // Conserva datos previos
    expect(result.current.coachCode).toBe('COACH1');
    expect(result.current.captacionActiva).toBe(true);
    expect(result.current.registrosPorEnlace).toBe(5);
    expect(result.current.coachCodeError).toBeNull();
  });
});
