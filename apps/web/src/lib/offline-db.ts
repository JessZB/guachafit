import Dexie, { Table } from 'dexie';
import { SesionEntrenamientoDetalleDTO, CheckinNutricionalDetalleDTO, EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import { generateIdempotencyKey } from './api-client';

/**
 * WU4: cola outbox durable con máquina de estados explícita.
 * - `pending`: esperando envío.
 * - `syncing`: en vuelo (transitorio; si la app se cierra a mitad se recupera a `pending`).
 * - `synced`: confirmado por el servidor (se conserva con poda acotada para auditoría).
 * - `failed`: error de red/5xx; se reintenta con backoff exponencial + jitter.
 * - `rejected`: error 4xx del servidor; NUNCA se reintenta en automático ni se borra en silencio.
 */
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'rejected';

export interface OutboxMutation {
  id?: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: any;
  /** Defensa de idempotencia: misma key en cada reintento de la misma mutación. */
  idempotencyKey: string;
  description: string;
  status: OutboxStatus;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number | null;
  /** Mensaje devuelto por el servidor (o de red) para mostrarlo al usuario. */
  lastError?: string | null;
  /** Instante (epoch ms) a partir del cual un `failed` puede reintentarse. */
  nextRetryAt?: number | null;
}

export interface OutboxSummary {
  pending: number;
  failed: number;
  rejected: number;
}

export interface CachedRutina {
  id: string; // sesionId
  alumnoId: string;
  fechaProgramada: string;
  sesion: SesionEntrenamientoDetalleDTO;
  updatedAt: number;
}

export interface CachedNutricion {
  id?: number;
  alumnoId: string;
  fecha: string;
  checkin: CheckinNutricionalDetalleDTO;
  updatedAt: number;
}

export class GuachafitDatabase extends Dexie {
  outboxMutations!: Table<OutboxMutation, number>;
  rutinaHoy!: Table<CachedRutina, string>;
  checkinsNutricion!: Table<CachedNutricion, number>;
  catalogoEjercicios!: Table<EjercicioCatalogoDetalleDTO, string>;

  constructor() {
    super('GuachafitOfflineDB');
    this.version(1).stores({
      outboxMutations: '++id, status, createdAt',
      rutinaHoy: 'id, alumnoId, fechaProgramada',
      checkinsNutricion: '++id, [alumnoId+fecha], fecha',
      catalogoEjercicios: 'id, grupoMuscular, nombre',
    });
  }
}

export const offlineDb = new GuachafitDatabase();

// ---------------------------------------------------------------------------
// Notificación de cambios de la cola (para que Header/pantallas refresquen)
// ---------------------------------------------------------------------------

type OutboxChangeListener = () => void;
const outboxChangeListeners = new Set<OutboxChangeListener>();

export function subscribeToOutboxChanges(listener: OutboxChangeListener): () => void {
  outboxChangeListeners.add(listener);
  return () => {
    outboxChangeListeners.delete(listener);
  };
}

function notifyOutboxChanged(): void {
  outboxChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Un listener roto jamás debe romper una mutación local
    }
  });
}

// ---------------------------------------------------------------------------
// Escritura de la cola
// ---------------------------------------------------------------------------

export async function queueOfflineMutation(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  payload: any,
  description: string,
  idempotencyKey?: string
): Promise<number> {
  const mutationId = await offlineDb.outboxMutations.add({
    endpoint,
    method,
    payload,
    description,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
    status: 'pending',
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    nextRetryAt: null,
  });
  notifyOutboxChanged();
  return mutationId;
}

export async function markMutationSyncing(id: number): Promise<void> {
  const item = await offlineDb.outboxMutations.get(id);
  if (!item) return;
  await offlineDb.outboxMutations.update(id, {
    status: 'syncing',
    attempts: (item.attempts ?? 0) + 1,
    lastAttemptAt: Date.now(),
  });
  notifyOutboxChanged();
}

export async function markMutationSynced(id: number): Promise<void> {
  await offlineDb.outboxMutations.update(id, {
    status: 'synced',
    lastError: null,
    nextRetryAt: null,
  });
  notifyOutboxChanged();
}

export async function markMutationFailed(
  id: number,
  lastError: string,
  nextRetryAt: number
): Promise<void> {
  await offlineDb.outboxMutations.update(id, {
    status: 'failed',
    lastError,
    nextRetryAt,
  });
  notifyOutboxChanged();
}

export async function markMutationRejected(id: number, lastError: string): Promise<void> {
  await offlineDb.outboxMutations.update(id, {
    status: 'rejected',
    lastError,
    nextRetryAt: null,
  });
  notifyOutboxChanged();
}

/** Reintento manual (rechazadas/fallidas): vuelve a `pending` y queda elegible de inmediato. */
export async function retryMutation(id: number): Promise<void> {
  const item = await offlineDb.outboxMutations.get(id);
  if (!item) return;
  await offlineDb.outboxMutations.update(id, {
    status: 'pending',
    lastError: null,
    nextRetryAt: null,
  });
  notifyOutboxChanged();
}

/** Descarte manual y explícito de una mutación (el usuario decide perderla). */
export async function discardMutation(id: number): Promise<void> {
  await offlineDb.outboxMutations.delete(id);
  notifyOutboxChanged();
}

/**
 * Recupera mutaciones que quedaron en `syncing` tras un cierre/crash de la app.
 * Se invoca al cargar la aplicación; sin esto quedarían invisibles para siempre.
 */
export async function recoverStuckMutations(): Promise<number> {
  const stuck = await offlineDb.outboxMutations.where('status').equals('syncing').toArray();
  for (const item of stuck) {
    if (item.id !== undefined) {
      await offlineDb.outboxMutations.update(item.id, { status: 'pending' });
    }
  }
  if (stuck.length > 0) notifyOutboxChanged();
  return stuck.length;
}

/** Poda acotada de las mutaciones ya sincronizadas (auditoría reciente, sin crecer sin límite). */
export async function pruneSyncedMutations(maxKeep = 20): Promise<number> {
  const synced = await offlineDb.outboxMutations.where('status').equals('synced').sortBy('createdAt');
  if (synced.length <= maxKeep) return 0;
  const toDelete = synced
    .slice(0, synced.length - maxKeep)
    .map((item) => item.id)
    .filter((id): id is number => id !== undefined);
  if (toDelete.length > 0) {
    await offlineDb.outboxMutations.bulkDelete(toDelete);
    notifyOutboxChanged();
  }
  return toDelete.length;
}

// ---------------------------------------------------------------------------
// Consultas de la cola
// ---------------------------------------------------------------------------

/** Mutaciones elegibles ahora: pendientes + fallidas cuyo backoff ya venció. */
export async function getDueMutations(now: number = Date.now()): Promise<OutboxMutation[]> {
  const all = await offlineDb.outboxMutations.toArray();
  return all
    .filter(
      (item) =>
        item.status === 'pending' ||
        (item.status === 'failed' && (item.nextRetryAt ?? 0) <= now)
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingMutations(): Promise<OutboxMutation[]> {
  return offlineDb.outboxMutations.where('status').equals('pending').sortBy('createdAt');
}

export async function getFailedMutations(): Promise<OutboxMutation[]> {
  return offlineDb.outboxMutations.where('status').equals('failed').sortBy('createdAt');
}

export async function getRejectedMutations(): Promise<OutboxMutation[]> {
  return offlineDb.outboxMutations.where('status').equals('rejected').sortBy('createdAt');
}

/** Todo lo que el usuario debe ver en el panel: pendientes, en vuelo, fallidas y rechazadas. */
export async function getActionableMutations(): Promise<OutboxMutation[]> {
  const all = await offlineDb.outboxMutations.toArray();
  return all.filter((item) => item.status !== 'synced').sort((a, b) => a.createdAt - b.createdAt);
}

export async function getOutboxSummary(): Promise<OutboxSummary> {
  const [pending, syncing, failed, rejected] = await Promise.all([
    offlineDb.outboxMutations.where('status').equals('pending').count(),
    offlineDb.outboxMutations.where('status').equals('syncing').count(),
    offlineDb.outboxMutations.where('status').equals('failed').count(),
    offlineDb.outboxMutations.where('status').equals('rejected').count(),
  ]);
  // Las mutaciones en vuelo cuentan como pendientes para la UI (no desaparecen del contador).
  return { pending: pending + syncing, failed, rejected };
}

// ---------------------------------------------------------------------------
// Cache de rutina (offline)
// ---------------------------------------------------------------------------

/**
 * WU4: sesión cacheada MÁS RECIENTE por `fechaProgramada` (desempate por `updatedAt`).
 * El orden por clave primaria (UUID) que usaba `.last()` no representa recencia.
 * Filtrar por `alumnoId` evita exponer la caché de otro alumno en un dispositivo compartido.
 */
export async function getLatestCachedRutina(alumnoId?: string): Promise<CachedRutina | null> {
  const rows = alumnoId
    ? await offlineDb.rutinaHoy.where('alumnoId').equals(alumnoId).toArray()
    : await offlineDb.rutinaHoy.toArray();
  if (rows.length === 0) return null;
  return rows.sort((a, b) => {
    const fechaA = a.fechaProgramada ?? '';
    const fechaB = b.fechaProgramada ?? '';
    if (fechaA !== fechaB) return fechaB.localeCompare(fechaA);
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  })[0];
}

// ---------------------------------------------------------------------------
// Higiene de sesión (WU22)
// ---------------------------------------------------------------------------

/**
 * WU22 — privacidad en dispositivo compartido: borra TODAS las tablas del
 * esquema (outbox, rutina cacheada, check-ins de nutrición y catálogo) para que
 * el siguiente usuario del dispositivo no vea datos del anterior.
 *
 * DECISIÓN: las mutaciones sin sincronizar se descartan a propósito.
 * Privacidad > datos: preferimos perder una mutación local antes que exponerla
 * al siguiente usuario. Si existen, se registra un `console.warn` con el conteo
 * para que quede rastro al diagnosticar una pérdida de datos reportada.
 */
export async function clearOfflineData(): Promise<void> {
  const sinSincronizar = await offlineDb.outboxMutations.where('status').notEqual('synced').count();
  if (sinSincronizar > 0) {
    console.warn(
      `[offline-db] Se descartan ${sinSincronizar} mutación(es) sin sincronizar al cerrar ` +
        'sesión (privacidad en dispositivo compartido).'
    );
  }

  await offlineDb.transaction(
    'rw',
    offlineDb.outboxMutations,
    offlineDb.rutinaHoy,
    offlineDb.checkinsNutricion,
    offlineDb.catalogoEjercicios,
    async () => {
      await Promise.all([
        offlineDb.outboxMutations.clear(),
        offlineDb.rutinaHoy.clear(),
        offlineDb.checkinsNutricion.clear(),
        offlineDb.catalogoEjercicios.clear(),
      ]);
    }
  );
  notifyOutboxChanged();
}
