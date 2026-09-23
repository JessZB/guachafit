import { apiClient, generateIdempotencyKey } from './api-client';
import type { PresignedUploadUrlResponseDTO } from '@guachafit/shared';
import {
  getDueMutations,
  getOutboxSummary,
  markMutationFailed,
  markMutationRejected,
  markMutationSyncing,
  markMutationSynced,
  pruneSyncedMutations,
  purgeMutationPhotos,
  recoverStuckMutations,
  subscribeToOutboxChanges,
  updateMutationPhotos,
  type FotoCheckinEnCola,
  type OutboxMutation,
  type OutboxSummary,
} from './offline-db';
import {
  esRechazoVentanaCheckin,
  MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS,
} from './nutricion-checkin';
import { queryClient } from './query-client';

// ---------------------------------------------------------------------------
// Backoff exponencial con jitter (WU4)
// ---------------------------------------------------------------------------

export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 60_000;
/** Intervalo del reintento periódico mientras la app está abierta. */
export const AUTO_SYNC_INTERVAL_MS = 45_000;

/**
 * Retraso antes del próximo intento: exponencial (2s, 4s, 8s…) con jitter ±20%
 * para evitar tormentas de reintentos sincronizados. `random` es inyectable en tests.
 */
export function computeBackoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1);
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
  const jitterFactor = 0.8 + random() * 0.4;
  return Math.min(MAX_BACKOFF_MS, Math.round(base * jitterFactor));
}

// ---------------------------------------------------------------------------
// Estado observable para la UI
// ---------------------------------------------------------------------------

export interface SyncStatusState {
  isSyncing: boolean;
  summary: OutboxSummary;
}

type SyncListener = (state: SyncStatusState) => void;
const listeners = new Set<SyncListener>();
const EMPTY_SUMMARY: OutboxSummary = { pending: 0, failed: 0, rejected: 0 };

let isSyncing = false;
let currentState: SyncStatusState = { isSyncing: false, summary: EMPTY_SUMMARY };

function emit(): void {
  listeners.forEach((listener) => listener(currentState));
}

/** Relee los contadores de la cola y notifica a los suscriptores. */
export async function refreshOutboxStatus(): Promise<void> {
  const summary = await getOutboxSummary();
  currentState = { isSyncing, summary };
  emit();
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  // Entrega inmediata (aunque sea estado previo) y refresco real con IndexedDB.
  listener(currentState);
  void refreshOutboxStatus();
  return () => {
    listeners.delete(listener);
  };
}

// Cualquier cambio en la cola (encolar, rechazar, descartar, reintentar…) refresca el estado.
subscribeToOutboxChanges(() => {
  void refreshOutboxStatus();
});

// ---------------------------------------------------------------------------
// Procesamiento de la cola
// ---------------------------------------------------------------------------

export interface ProcessOutboxResult {
  processed: number;
  failed: number;
  rejected: number;
  skipped: boolean;
}

function getErrorStatus(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

function getErrorMessage(err: unknown): string {
  const problemDetail = (err as { problem?: { detail?: unknown } } | null)?.problem?.detail;
  if (typeof problemDetail === 'string' && problemDetail.trim()) return problemDetail;
  if (err instanceof Error && err.message) return err.message;
  return 'Error de red al sincronizar';
}

/**
 * RF-002 §6/RN-03 — check-in nutricional CON fotos: sube primero los blobs pendientes
 * (presign del módulo `comidas` + PUT a R2) persistiendo cada storageKey al instante y, con
 * todas las claves, registra el check-in con el MISMO contrato que el flujo online.
 *
 * Semántica de errores (la clasifica el bucle de `processOutboxQueue`):
 * - presign 4xx (contrato/datos) → `rejected` visible con la razón del servidor.
 * - PUT fallido o error de red → reintentable (`failed` con backoff): el reintento pide una
 *   presign nueva (por si la URL expiró) y salta las fotos que ya tienen storageKey.
 * - POST 400 por ventana/día cerrado → `rejected` con un mensaje claro; la evidencia local
 *   NO se toca hasta que el usuario la descarte desde el panel.
 */
async function processCheckinNutricionalConFotos(item: OutboxMutation): Promise<void> {
  const fotos: FotoCheckinEnCola[] = [...(item.fotos ?? [])];
  if (!item.alumnoId) {
    throw new Error(
      'El reporte con fotos no tiene alumno asociado: descártalo y vuelve a guardarlo.'
    );
  }

  for (let indice = 0; indice < fotos.length; indice++) {
    const foto = fotos[indice];
    // Reanudable: una foto ya subida en un intento previo no se vuelve a subir.
    if (foto.storageKey) continue;

    const presigned = await apiClient<PresignedUploadUrlResponseDTO>(
      '/antropometria/presigned-upload-url',
      {
        method: 'POST',
        body: JSON.stringify({
          modulo: 'comidas',
          alumnoId: item.alumnoId,
          mimeType: foto.contentType,
        }),
      }
    );

    const respuesta = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': foto.contentType },
      body: foto.blob,
    });
    if (!respuesta.ok) {
      // URL expirada o fallo de la bóveda: reintentable con una presign nueva (no es un rechazo).
      throw new Error(
        `No se pudo subir la foto ${indice + 1}/${fotos.length} a la bóveda (${respuesta.status}).`
      );
    }

    foto.storageKey = presigned.storageKey;
    if (item.id !== undefined) {
      // Persistencia inmediata: un cierre a mitad de la subida no repite estas fotos.
      await updateMutationPhotos(item.id, fotos);
    }
  }

  const fotosPlatos = fotos
    .filter((foto): foto is FotoCheckinEnCola & { storageKey: string } => Boolean(foto.storageKey))
    .map((foto) => ({ tipoComida: foto.tipoComida, storageKey: foto.storageKey }));

  try {
    await apiClient(item.endpoint, {
      method: item.method,
      body: JSON.stringify({
        ...item.payload,
        ...(fotosPlatos.length > 0 ? { fotosPlatos } : {}),
      }),
      idempotencyKey: item.idempotencyKey || generateIdempotencyKey(),
    });
  } catch (err) {
    // RN-02: la ventana/día local cerró mientras la evidencia esperaba en la cola. Se marca
    // como rechazo definitivo con un mensaje claro (sin el tecnicismo del servidor).
    if (getErrorStatus(err) === 400 && esRechazoVentanaCheckin(getErrorMessage(err))) {
      const rechazo = new Error(MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS) as Error & {
        status: number;
      };
      rechazo.status = 400;
      throw rechazo;
    }
    throw err;
  }

  if (item.id !== undefined) {
    // El servidor ya tiene el reporte y las fotos: se liberan los blobs locales (queda auditoría).
    await purgeMutationPhotos(item.id);
  }
}

export async function processOutboxQueue(): Promise<ProcessOutboxResult> {
  if (isSyncing) {
    return { processed: 0, failed: 0, rejected: 0, skipped: true };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await refreshOutboxStatus();
    return { processed: 0, failed: 0, rejected: 0, skipped: true };
  }

  isSyncing = true;
  emit();

  let processed = 0;
  let failed = 0;
  let rejected = 0;

  try {
    const queue = await getDueMutations();

    for (const item of queue) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      if (item.id === undefined) continue;

      await markMutationSyncing(item.id);

      try {
        if (item.tipo === 'nutricion-checkin-fotos') {
          // Rama con evidencia fotográfica: sube los blobs y luego registra el check-in.
          await processCheckinNutricionalConFotos(item);
        } else {
          await apiClient(item.endpoint, {
            method: item.method,
            body: JSON.stringify(item.payload),
            // La MISMA key en cada reintento: el servidor puede deduplicar aunque el
            // intento anterior haya llegado y la respuesta se haya perdido.
            idempotencyKey: item.idempotencyKey || generateIdempotencyKey(),
          });
        }
        await markMutationSynced(item.id);
        processed++;
      } catch (err) {
        const status = getErrorStatus(err);
        const message = getErrorMessage(err);

        if (status >= 400 && status < 500) {
          // Error del servidor (contrato/datos): reintentar no ayuda. Queda VISIBLE
          // para el usuario con la razón; jamás se descarta en silencio.
          await markMutationRejected(item.id, message);
          rejected++;
          console.warn(
            `[Guachafit Sync] Mutación #${item.id} rechazada por el servidor (${status}): ${message}`
          );
        } else {
          // Red/5xx: reintento con backoff exponencial + jitter.
          const attempts = (item.attempts ?? 0) + 1;
          const delay = computeBackoffDelayMs(attempts);
          await markMutationFailed(item.id, message, Date.now() + delay);
          failed++;
          console.warn(
            `[Guachafit Sync] Mutación #${item.id} falló (${status || 'red'}); próximo intento en ${Math.round(
              delay / 1000
            )}s`
          );
        }
      }
    }

    await pruneSyncedMutations();

    if (processed > 0) {
      await queryClient.invalidateQueries();
    }
  } finally {
    isSyncing = false;
    await refreshOutboxStatus();
  }

  return { processed, failed, rejected, skipped: false };
}

// ---------------------------------------------------------------------------
// Disparadores de sincronización: evento `online`, carga de la app e intervalo
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Guachafit Sync] Conexión restaurada, procesando cola outbox...');
    void processOutboxQueue();
  });

  // Al cargar la app: recupera mutaciones colgadas de un cierre previo y procesa.
  window.setTimeout(() => {
    void recoverStuckMutations().then(() => processOutboxQueue());
  }, 1_200);

  // Reintento periódico con tope (el backoff limita cada mutación; esto solo despierta la cola).
  window.setInterval(() => {
    void processOutboxQueue();
  }, AUTO_SYNC_INTERVAL_MS);
}
