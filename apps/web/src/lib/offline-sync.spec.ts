import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';
import {
  AUTO_SYNC_INTERVAL_MS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  computeBackoffDelayMs,
  processOutboxQueue,
} from './offline-sync';
import {
  getFailedMutations,
  getOutboxSummary,
  getRejectedMutations,
  offlineDb,
  queueOfflineMutation,
} from './offline-db';

vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = vi.mocked(apiClient);

function setNavigatorOnline(online: boolean): void {
  if (typeof navigator === 'undefined') {
    (globalThis as { navigator?: unknown }).navigator = { onLine: online };
    return;
  }
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true, writable: true });
}

function httpError(status: number, detail: string): Error & { status: number } {
  return Object.assign(new Error(detail), { status });
}

beforeEach(async () => {
  setNavigatorOnline(true);
  mockedApiClient.mockReset();
  await offlineDb.outboxMutations.clear();
  await offlineDb.rutinaHoy.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline-sync: backoff exponencial con jitter', () => {
  it('crece exponencialmente, respeta el tope y aplica jitter ±20%', () => {
    expect(computeBackoffDelayMs(1, () => 0.5)).toBe(BASE_BACKOFF_MS);
    expect(computeBackoffDelayMs(2, () => 0.5)).toBe(4_000);
    expect(computeBackoffDelayMs(3, () => 0.5)).toBe(8_000);
    expect(computeBackoffDelayMs(1, () => 0)).toBe(1_600);
    expect(computeBackoffDelayMs(1, () => 1)).toBe(2_400);
    expect(computeBackoffDelayMs(20, () => 0.5)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffDelayMs(20, () => 1)).toBe(MAX_BACKOFF_MS);
    expect(AUTO_SYNC_INTERVAL_MS).toBeGreaterThan(0);
  });
});

describe('offline-sync: procesamiento de la cola', () => {
  it('éxito → synced, visible en auditoría y contadores en cero', async () => {
    const id = await queueOfflineMutation(
      '/sesiones/s1/series',
      'PUT',
      { series: [] },
      'Sync serie 1',
      'key-ok'
    );
    mockedApiClient.mockResolvedValueOnce(null);

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, failed: 0, rejected: 0, skipped: false });
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.mock.calls[0][1]?.idempotencyKey).toBe('key-ok');
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('synced');
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 0, rejected: 0 });
  });

  it('4xx → rejected con la razón del servidor, sin reintento automático', async () => {
    await queueOfflineMutation(
      '/sesiones/s1/series',
      'PUT',
      { series: [] },
      'Sync serie 2',
      'key-rejected'
    );
    mockedApiClient.mockRejectedValueOnce(httpError(422, 'Peso inválido: corrige el valor (ej. 28.5)'));

    const first = await processOutboxQueue();

    expect(first).toMatchObject({ processed: 0, failed: 0, rejected: 1 });
    const rejected = await getRejectedMutations();
    expect(rejected).toHaveLength(1);
    expect(rejected[0].lastError).toContain('Peso inválido');
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 0, rejected: 1 });

    // Aunque se procese de nuevo la cola, una rechazada no se reintenta ni se borra
    await processOutboxQueue();
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
    expect(await getRejectedMutations()).toHaveLength(1);
  });

  it('5xx → failed con backoff; no reintenta hasta vencer y reutiliza la misma idempotencyKey', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter neutro: delays exactos
    const id = await queueOfflineMutation(
      '/sesiones/s1/series',
      'PUT',
      { series: [] },
      'Sync serie 3',
      'key-retry'
    );
    mockedApiClient.mockRejectedValue(httpError(503, 'Servicio no disponible'));

    const first = await processOutboxQueue();

    expect(first).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const failed = await getFailedMutations();
    expect(failed).toHaveLength(1);
    expect(failed[0].attempts).toBe(1);
    expect(failed[0].lastError).toContain('Servicio no disponible');
    expect(failed[0].nextRetryAt).toBeGreaterThan(Date.now());
    expect((failed[0].nextRetryAt ?? 0) - Date.now()).toBeLessThanOrEqual(BASE_BACKOFF_MS);

    // Sin vencer el backoff no hay reintento (ni loops apretados)
    await processOutboxQueue();
    expect(mockedApiClient).toHaveBeenCalledTimes(1);

    // Al vencer, reintenta con la MISMA key persistida
    await offlineDb.outboxMutations.update(id, { nextRetryAt: 0 });
    mockedApiClient.mockResolvedValueOnce(null);
    const second = await processOutboxQueue();

    expect(second).toMatchObject({ processed: 1, failed: 0, rejected: 0 });
    expect(mockedApiClient).toHaveBeenCalledTimes(2);
    expect(mockedApiClient.mock.calls[0][1]?.idempotencyKey).toBe('key-retry');
    expect(mockedApiClient.mock.calls[1][1]?.idempotencyKey).toBe('key-retry');
  });

  it('sin conexión no toca la red y conserva los pendientes', async () => {
    setNavigatorOnline(false);
    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión', 'key-offline');

    const result = await processOutboxQueue();

    expect(result.skipped).toBe(true);
    expect(mockedApiClient).not.toHaveBeenCalled();
    expect(await getOutboxSummary()).toEqual({ pending: 1, failed: 0, rejected: 0 });
  });

  it('error de red sin status (fetch caído) se trata como fallo reintentable, no como rechazo', async () => {
    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión', 'key-net');
    mockedApiClient.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const failed = await getFailedMutations();
    expect(failed).toHaveLength(1);
    expect(failed[0].lastError).toContain('Failed to fetch');
  });
});
