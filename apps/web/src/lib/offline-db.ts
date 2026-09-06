import Dexie, { Table } from 'dexie';
import { SesionEntrenamientoDetalleDTO, CheckinNutricionalDetalleDTO, EjercicioCatalogoDetalleDTO } from '@guachafit/shared';

export interface OutboxMutation {
  id?: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: any;
  idempotencyKey?: string;
  description: string;
  status: 'pending' | 'syncing' | 'failed';
  createdAt: number;
  retries: number;
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
    idempotencyKey,
    status: 'pending',
    createdAt: Date.now(),
    retries: 0,
  });
  return mutationId;
}

export async function getPendingMutations(): Promise<OutboxMutation[]> {
  return offlineDb.outboxMutations.where('status').equals('pending').sortBy('createdAt');
}

export async function getPendingMutationsCount(): Promise<number> {
  return offlineDb.outboxMutations.where('status').equals('pending').count();
}

export async function removeMutation(id: number): Promise<void> {
  await offlineDb.outboxMutations.delete(id);
}

export async function markMutationFailed(id: number): Promise<void> {
  const item = await offlineDb.outboxMutations.get(id);
  if (item) {
    await offlineDb.outboxMutations.update(id, {
      status: 'failed',
      retries: (item.retries || 0) + 1,
    });
  }
}
