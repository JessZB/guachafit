import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  discardMutation,
  getDueMutations,
  getFailedMutations,
  getLatestCachedRutina,
  getOutboxSummary,
  getPendingMutations,
  getRejectedMutations,
  markMutationFailed,
  markMutationRejected,
  markMutationSyncing,
  markMutationSynced,
  offlineDb,
  pruneSyncedMutations,
  queueOfflineMutation,
  recoverStuckMutations,
  retryMutation,
  type CachedRutina,
} from './offline-db';

function fakeSesion(id: string): CachedRutina['sesion'] {
  return { id } as unknown as CachedRutina['sesion'];
}

async function putCachedRutina(
  id: string,
  fechaProgramada: string,
  updatedAt: number,
  alumnoId = 'alumno-1'
): Promise<void> {
  await offlineDb.rutinaHoy.put({ id, alumnoId, fechaProgramada, sesion: fakeSesion(id), updatedAt });
}

beforeEach(async () => {
  await offlineDb.outboxMutations.clear();
  await offlineDb.rutinaHoy.clear();
});

describe('offline-db: cola outbox durable', () => {
  it('encola una mutación pendiente con idempotencyKey autogenerada', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', { series: [] }, 'Sync serie 1');

    const pending = await getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].attempts).toBe(0);
    expect(pending[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('respeta la idempotencyKey explícita (reintentos reutilizan la misma)', async () => {
    await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar', 'key-fija-123');
    const pending = await getPendingMutations();
    expect(pending[0].idempotencyKey).toBe('key-fija-123');
  });

  it('markMutationSyncing incrementa intentos y deja la mutación en vuelo', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión');
    await markMutationSyncing(id);

    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('syncing');
    expect(row?.attempts).toBe(1);
    expect(row?.lastAttemptAt).toBeTypeOf('number');
    // En vuelo cuenta como pendiente para la UI
    expect(await getOutboxSummary()).toEqual({ pending: 1, failed: 0, rejected: 0 });
  });

  it('5xx/red → failed con lastError y nextRetryAt; solo es elegible al vencer el backoff', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync serie 2');
    await markMutationSyncing(id);
    const nextRetryAt = Date.now() + 4_000;
    await markMutationFailed(id, 'Servicio no disponible', nextRetryAt);

    const failed = await getFailedMutations();
    expect(failed).toHaveLength(1);
    expect(failed[0].lastError).toBe('Servicio no disponible');
    expect(failed[0].nextRetryAt).toBe(nextRetryAt);
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 1, rejected: 0 });

    // Antes de vencer no es elegible; después sí
    expect(await getDueMutations(nextRetryAt - 1)).toHaveLength(0);
    expect(await getDueMutations(nextRetryAt)).toHaveLength(1);
  });

  it('4xx → rejected: queda VISIBLE con la razón del servidor y nunca entra en la cola automática', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync serie 3');
    await markMutationSyncing(id);
    await markMutationRejected(id, 'Peso inválido: corrige el valor (ej. 28.5)');

    const rejected = await getRejectedMutations();
    expect(rejected).toHaveLength(1);
    expect(rejected[0].lastError).toContain('Peso inválido');
    expect(rejected[0].nextRetryAt).toBeNull();
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 0, rejected: 1 });

    // Aunque pase el tiempo, una rechazada jamás se reintenta en automático
    expect(await getDueMutations(Date.now() + 10 * 60_000)).toHaveLength(0);
  });

  it('retryMutation devuelve una rechazada a pendiente y limpia el error', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync serie 4');
    await markMutationRejected(id, 'Contrato inválido');

    await retryMutation(id);

    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('pending');
    expect(row?.lastError).toBeNull();
    expect(row?.nextRetryAt).toBeNull();
    expect(await getDueMutations()).toHaveLength(1);
  });

  it('discardMutation elimina la mutación (descarte explícito del usuario)', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync serie 5');
    await markMutationRejected(id, 'Error de datos');

    await discardMutation(id);

    expect(await getRejectedMutations()).toHaveLength(0);
    expect(await offlineDb.outboxMutations.get(id)).toBeUndefined();
  });

  it('markMutationSynced deja el estado synced y pruneSyncedMutations acota la auditoría', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, `Sync serie ${i}`);
      await markMutationSyncing(id);
      await markMutationSynced(id);
    }

    const synced = await offlineDb.outboxMutations.where('status').equals('synced').count();
    expect(synced).toBe(5);
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 0, rejected: 0 });

    const pruned = await pruneSyncedMutations(2);
    expect(pruned).toBe(3);
    expect(await offlineDb.outboxMutations.where('status').equals('synced').count()).toBe(2);
  });

  it('recoverStuckMutations rescata filas syncing tras un cierre abrupto', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión');
    await markMutationSyncing(id);

    const recovered = await recoverStuckMutations();

    expect(recovered).toBe(1);
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('pending');
    expect(await getDueMutations()).toHaveLength(1);
  });
});

describe('offline-db: selección de la rutina cacheada más reciente', () => {
  it('elige la fechaProgramada más reciente (no el orden por UUID)', async () => {
    await putCachedRutina('zzz-vieja', '2026-09-15', 500);
    await putCachedRutina('aaa-nueva', '2026-09-18', 100);
    await putCachedRutina('mmm-media', '2026-09-16', 900);

    const latest = await getLatestCachedRutina('alumno-1');
    expect(latest?.id).toBe('aaa-nueva');
  });

  it('desempata por updatedAt cuando la fechaProgramada es la misma', async () => {
    await putCachedRutina('sesion-antigua', '2026-09-18', 100);
    await putCachedRutina('sesion-reciente', '2026-09-18', 200);

    const latest = await getLatestCachedRutina('alumno-1');
    expect(latest?.id).toBe('sesion-reciente');
  });

  it('no filtra caché de otro alumno en un dispositivo compartido', async () => {
    await putCachedRutina('de-otro', '2026-09-19', 999, 'alumno-2');
    await putCachedRutina('de-este', '2026-09-17', 10, 'alumno-1');

    const latest = await getLatestCachedRutina('alumno-1');
    expect(latest?.id).toBe('de-este');

    const sinFiltro = await getLatestCachedRutina();
    expect(sinFiltro?.id).toBe('de-otro');
  });

  it('devuelve null cuando no hay caché', async () => {
    expect(await getLatestCachedRutina('alumno-1')).toBeNull();
  });
});
