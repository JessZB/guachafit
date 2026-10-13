import { useEffect, useState } from 'react';
import { subscribeToSyncStatus, type SyncStatusState } from '../../../lib/offline-sync';

/** WU4: contadores de la cola offline para el indicador de la pantalla. */
export function useColaOffline() {
  const [syncState, setSyncState] = useState<SyncStatusState>({
    isSyncing: false,
    summary: { pending: 0, failed: 0, rejected: 0 },
  });
  const [isSyncPanelOpen, setIsSyncPanelOpen] = useState(false);

  useEffect(() => subscribeToSyncStatus(setSyncState), []);

  // WU4: resumen de la cola offline para el indicador (nada visible si todo está sincronizado)
  const syncRejected = syncState.summary.rejected;
  const syncUnsynced = syncState.summary.pending + syncState.summary.failed;
  const syncLabelParts: string[] = [];
  if (syncRejected > 0) {
    syncLabelParts.push(
      `${syncRejected} cambio${syncRejected > 1 ? 's' : ''} rechazado${syncRejected > 1 ? 's' : ''}`
    );
  }
  if (syncUnsynced > 0) {
    syncLabelParts.push(
      `${syncUnsynced} cambio${syncUnsynced > 1 ? 's' : ''} por enviar a tu entrenador`
    );
  }
  const syncSummaryLabel = syncLabelParts.join(' · ');

  return { syncState, isSyncPanelOpen, setIsSyncPanelOpen, syncRejected, syncSummaryLabel };
}
