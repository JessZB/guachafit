import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import {
  discardMutation,
  getActionableMutations,
  retryMutation,
  subscribeToOutboxChanges,
  type OutboxMutation,
} from '../../lib/offline-db';
import { processOutboxQueue, subscribeToSyncStatus, type SyncStatusState } from '../../lib/offline-sync';
import { formatFechaHoraLocal } from '../../lib/date-format';
import { describirRechazoCola } from '../../lib/mensajes-error';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';

interface SyncQueuePanelProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_META: Record<
  OutboxMutation['status'],
  { label: string; className: string }
> = {
  pending: { label: 'Pendiente', className: 'bg-info/15 text-info border-info/30' },
  syncing: { label: 'Enviando', className: 'bg-primary/15 text-primary border-primary/30' },
  synced: { label: 'Enviado', className: 'bg-success/15 text-success border-success/30' },
  failed: { label: 'Reintentando', className: 'bg-warning/15 text-warning border-warning/30' },
  rejected: { label: 'No guardado', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

/**
 * WU4: panel único de la cola offline. Las mutaciones rechazadas (4xx o tope de 5xx) quedan
 * visibles con su razón y acciones explícitas; las fallidas (red/5xx) se reintentan con backoff
 * y también pueden descartarse a mano. Nunca hay descarte silencioso.
 */
export function SyncQueuePanel({ open, onClose }: SyncQueuePanelProps) {
  const [items, setItems] = useState<OutboxMutation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<SyncStatusState>({
    isSyncing: false,
    summary: { pending: 0, failed: 0, rejected: 0 },
  });
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al cerrar.
  const refDialogo = useDialogoAccesible({ abierto: open, onCerrar: onClose });

  const isSyncing = syncState.isSyncing;

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await getActionableMutations());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => subscribeToSyncStatus(setSyncState), []);

  useEffect(() => {
    if (!open) return;
    void loadItems();
    const unsubscribe = subscribeToOutboxChanges(() => {
      void loadItems();
    });
    return unsubscribe;
  }, [open, loadItems]);

  useEffect(() => {
    if (!open) {
      setConfirmDiscardId(null);
      return;
    }
    // U3b: Escape y trampa de foco viven en `useDialogoAccesible`; aquí solo la conectividad.
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [open]);

  if (!open) return null;

  const { pending, failed, rejected } = syncState.summary;

  const handleRetry = async (id: number) => {
    setBusyId(id);
    try {
      await retryMutation(id);
      await processOutboxQueue();
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (id: number) => {
    setBusyId(id);
    try {
      await discardMutation(id);
      setConfirmDiscardId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-panel-title"
        tabIndex={-1}
        className="p-5 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-lg space-y-4 max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                rejected > 0 ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="sync-panel-title" className="font-bold text-base text-foreground leading-tight">
                Cambios por enviar
              </h3>
              <p className="text-xs text-muted-foreground">
                {rejected > 0
                  ? `${rejected} cambio${rejected > 1 ? 's' : ''} que no se pudo guardar`
                  : failed > 0
                  ? `${failed} cambio${failed > 1 ? 's' : ''} esperando reintento`
                  : pending > 0
                  ? `${pending} cambio${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''}`
                  : 'Todo enviado a tu entrenador'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar cambios por enviar"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Estado de conexión */}
        {!isOnline && (
          <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/25 text-destructive text-xs font-semibold flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Sin conexión. Los cambios se enviarán solos cuando vuelvas a tener internet.</span>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-2.5 -mx-1 px-1">
          {isLoading && items.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
              <p className="text-sm font-bold text-foreground">Todo enviado</p>
              <p className="text-xs text-muted-foreground">
                No hay cambios en este teléfono esperando envío.
              </p>
            </div>
          )}

          {items.map((item) => {
            const meta = STATUS_META[item.status];
            const isBusy = busyId === item.id;
            const isDiscarding = confirmDiscardId === item.id;
            const fotosEnCola = item.fotos?.length ?? 0;
            return (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-secondary/40 border border-border/70 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{item.description}</p>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatFechaHoraLocal(new Date(item.createdAt).toISOString()) ?? '—'}
                  </span>
                  {item.attempts > 0 && (
                    <span>
                      {item.attempts} intento{item.attempts > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {item.lastError && (
                  <p
                    className={`text-xs font-semibold rounded-xl px-2.5 py-1.5 border ${
                      item.status === 'rejected'
                        ? 'text-destructive bg-destructive/10 border-destructive/25'
                        : 'text-warning bg-warning/10 border-warning/25'
                    }`}
                  >
                    {item.status === 'rejected'
                      ? item.motivoRechazo === 'tope-errores-servidor'
                        ? item.lastError
                        : describirRechazoCola(item.lastError)
                      : 'Todavía no se pudo enviar. Lo intentaremos de nuevo automáticamente.'}
                  </p>
                )}

                {fotosEnCola > 0 && (item.status === 'rejected' || item.status === 'failed') && (
                  <p className="text-xs text-muted-foreground">
                    Este reporte conserva {fotosEnCola} foto{fotosEnCola === 1 ? '' : 's'} en tu
                    dispositivo. Si reintentas se subirá solo lo pendiente; si lo descartas, la
                    evidencia se eliminará del dispositivo.
                  </p>
                )}

                {(item.status === 'rejected' || item.status === 'failed') && (
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={isBusy || isSyncing}
                      onClick={() => item.id !== undefined && handleRetry(item.id)}
                      className="min-h-11 py-1.5 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm shadow-primary/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`h-3 w-3 ${isBusy ? 'animate-spin' : ''}`} />
                      <span>Reintentar</span>
                    </button>

                    {/* Descartar también una fallida: un 5xx persistente no debe bloquear la sesión. */}
                    {!isDiscarding && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDiscardId(item.id ?? null)}
                        className="min-h-11 py-1.5 px-3 rounded-xl bg-transparent border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 font-bold text-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Descartar</span>
                      </button>
                    )}

                    {isDiscarding && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-semibold">
                          ¿Descartar este cambio? No se enviará.
                        </span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => item.id !== undefined && handleDiscard(item.id)}
                          className="min-h-11 py-1.5 px-3 rounded-xl bg-destructive text-white font-bold text-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          Sí, descartar
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDiscardId(null)}
                          className="min-h-11 py-1.5 px-2.5 rounded-xl text-muted-foreground text-xs font-bold hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border/80 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground font-medium">
            {pending > 0 || failed > 0
              ? 'Los cambios pendientes se envían solos cuando vuelves a tener internet.'
              : 'Sin cambios pendientes de envío.'}
          </p>
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => void processOutboxQueue()}
            className="min-h-11 py-2 px-4 rounded-xl bg-secondary border border-border text-foreground font-bold text-xs hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Enviar ahora</span>
          </button>
        </div>
      </div>
    </div>
  );
}
