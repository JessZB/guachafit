import { apiClient } from './api-client';
import { getPendingMutations, removeMutation, markMutationFailed, offlineDb } from './offline-db';
import { queryClient } from './query-client';

let isSyncing = false;
type SyncListener = (isSyncing: boolean, pendingCount: number) => void;
const listeners = new Set<SyncListener>();

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(syncing: boolean, count: number) {
  listeners.forEach((fn) => fn(syncing, count));
}

export async function processOutboxQueue(): Promise<{ processed: number; failed: number }> {
  if (isSyncing || !navigator.onLine) {
    const count = await offlineDb.outboxMutations.where('status').equals('pending').count();
    notifyListeners(false, count);
    return { processed: 0, failed: 0 };
  }

  isSyncing = true;
  let processed = 0;
  let failed = 0;

  try {
    const queue = await getPendingMutations();
    notifyListeners(true, queue.length);

    for (const item of queue) {
      if (!navigator.onLine) break;

      try {
        await apiClient(item.endpoint, {
          method: item.method,
          body: JSON.stringify(item.payload),
          idempotencyKey: item.idempotencyKey,
        });

        if (item.id !== undefined) {
          await removeMutation(item.id);
        }
        processed++;
      } catch (err: any) {
        console.error(`Error procesando mutación offline #${item.id} a ${item.endpoint}:`, err);
        // If 4xx client error, don't keep blocking queue
        if (err.status && err.status >= 400 && err.status < 500) {
          if (item.id !== undefined) await removeMutation(item.id);
        } else {
          if (item.id !== undefined) await markMutationFailed(item.id);
        }
        failed++;
      }
    }

    // Invalidate queries to refresh UI after sync
    if (processed > 0) {
      await queryClient.invalidateQueries();
    }
  } finally {
    isSyncing = false;
    const remaining = await offlineDb.outboxMutations.where('status').equals('pending').count();
    notifyListeners(false, remaining);
  }

  return { processed, failed };
}

// Auto-sync on window online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Guachafit Sync] Conexión restaurada, procesando cola outbox...');
    processOutboxQueue();
  });
}
