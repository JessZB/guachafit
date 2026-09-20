import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from './api-client';

function stubFetch(status = 200, body: unknown = { ok: true }) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function getSentHeaders(fetchMock: ReturnType<typeof stubFetch>, callIndex = 0): Record<string, string> {
  const init = fetchMock.mock.calls[callIndex][1];
  return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api-client: X-Idempotency-Key (WU4)', () => {
  it('adjunta una key nueva a las mutaciones de sesiones (POST)', async () => {
    const fetchMock = stubFetch();

    await apiClient('/sesiones/sesion-1/finalizar', {
      method: 'POST',
      body: JSON.stringify({ notasAlumno: 'ok' }),
      skipAuth: true,
    });

    const headers = getSentHeaders(fetchMock);
    expect(headers['X-Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('reutiliza la key explícita (reintentos de la cola offline)', async () => {
    const fetchMock = stubFetch();

    await apiClient('/sesiones/sesion-1/series', {
      method: 'PUT',
      body: JSON.stringify({ series: [] }),
      idempotencyKey: 'key-persistida-42',
      skipAuth: true,
    });

    expect(getSentHeaders(fetchMock)['X-Idempotency-Key']).toBe('key-persistida-42');
  });

  it('no adjunta key en lecturas GET', async () => {
    const fetchMock = stubFetch();

    await apiClient('/sesiones/sesion-1', { method: 'GET', skipAuth: true });

    expect(getSentHeaders(fetchMock)['X-Idempotency-Key']).toBeUndefined();
  });

  it('mantiene la idempotencia financiera existente', async () => {
    const fetchMock = stubFetch();

    await apiClient('/finanzas/pagos', {
      method: 'POST',
      body: JSON.stringify({ monto: '10.00' }),
      skipAuth: true,
    });

    expect(getSentHeaders(fetchMock)['X-Idempotency-Key']).toBeTruthy();
  });

  it('sigue lanzando ApiError con el status del servidor (4xx)', async () => {
    stubFetch(422, {
      type: 'https://api.guachafit.com/errors/validation',
      title: 'Validación',
      status: 422,
      detail: 'Peso inválido',
      timestampUtc: new Date().toISOString(),
    });

    const promise = apiClient('/sesiones/sesion-1/series', {
      method: 'PUT',
      body: JSON.stringify({ series: [] }),
      skipAuth: true,
    });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 422 });
  });
});
