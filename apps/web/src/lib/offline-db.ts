import Dexie, { Table } from 'dexie';
import {
  SesionEntrenamientoDetalleDTO,
  CheckinNutricionalDetalleDTO,
  EjercicioCatalogoDetalleDTO,
  EstadoSesion,
  type SemanaEntrenamientoProgresoDTO,
  type CheckinNutricionalDTO,
  type TipoComida,
} from '@guachafit/shared';
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

/** Máximo de fotografías de platos por reporte (RF-002 RN-03), espejo del contrato compartido. */
export const MAX_FOTOS_CHECKIN_NUTRICIONAL = 4;

/** Tipo discriminado de las mutaciones con procesamiento especial en `offline-sync`. */
export type TipoMutacionCola = 'nutricion-checkin-fotos';

/**
 * Foto de plato que viaja dentro de la cola (RF-002 §6/RN-03): el blob comprimido en el
 * dispositivo vive en IndexedDB y `storageKey` registra el progreso de subida.
 * `storageKey` no nulo = ya está en la bóveda: el reintento NO la vuelve a subir.
 */
export interface FotoCheckinEnCola {
  tipoComida: TipoComida;
  nombre: string;
  contentType: string;
  blob: Blob;
  storageKey: string | null;
}

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
  /** Discriminador de procesamiento especial (p. ej. check-in con fotos). */
  tipo?: TipoMutacionCola;
  /** Dueño de los blobs; necesario para pedir el presign de cada foto al sincronizar. */
  alumnoId?: string;
  /** Evidencia fotográfica del check-in: blobs locales + progreso de subida por foto. */
  fotos?: FotoCheckinEnCola[];
  /**
   * D1: causa de un rechazo que se resuelve sola (p. ej. una serie enviada antes de que la
   * sesión estuviera en progreso). Opcional: las filas antiguas no lo tienen.
   */
  motivoRechazo?: MotivoRechazoCola | null;
  /**
   * Fallos con error del servidor (5xx) acumulados; los de red no cuentan. Al llegar al tope la
   * mutación pasa a `rejected` para no bloquear su sesión para siempre. Opcional en filas antiguas.
   */
  fallosServidor?: number;
}

/**
 * Causa de un rechazo local:
 * - `sesion-no-iniciada`: se reintenta solo cuando su causa desaparece.
 * - `tope-errores-servidor`: el servidor falló (5xx) demasiadas veces; espera al usuario.
 */
export type MotivoRechazoCola = 'sesion-no-iniciada' | 'tope-errores-servidor';

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

/** D3: progreso semanal del alumno guardado para consultarlo sin conexión. */
export interface CachedSemana {
  alumnoId: string;
  semana: SemanaEntrenamientoProgresoDTO;
  updatedAt: number;
}

export class GuachafitDatabase extends Dexie {
  outboxMutations!: Table<OutboxMutation, number>;
  rutinaHoy!: Table<CachedRutina, string>;
  checkinsNutricion!: Table<CachedNutricion, number>;
  catalogoEjercicios!: Table<EjercicioCatalogoDetalleDTO, string>;
  semanaEntrenamiento!: Table<CachedSemana, string>;

  constructor() {
    super('GuachafitOfflineDB');
    this.version(1).stores({
      outboxMutations: '++id, status, createdAt',
      rutinaHoy: 'id, alumnoId, fechaProgramada',
      checkinsNutricion: '++id, [alumnoId+fecha], fecha',
      catalogoEjercicios: 'id, grupoMuscular, nombre',
    });
    // D3: versión aditiva (solo agrega una tabla); los datos existentes no se migran ni se borran.
    this.version(2).stores({
      semanaEntrenamiento: 'alumnoId',
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

/**
 * RF-002 §6/RN-03: encola un check-in nutricional CON fotos comprimidas.
 *
 * A diferencia del POST directo (que sube las fotos y luego registra), aquí la evidencia
 * completa —datos + blobs— vive en IndexedDB y el procesador de `offline-sync` la sube en
 * segundo plano: primero cada foto (presign `comidas` + PUT) guardando su storageKey al
 * instante para reanudar sin re-subir, y después el check-in con las claves.
 *
 * @param payload cuerpo del check-in SIN `fotosPlatos`: las claves las compone el sincronizador.
 * @param fotos entre 1 y 4 fotografías comprimidas (RN-03) con su blob local.
 * @param alumnoId dueño de la evidencia; viaja para pedir el presign en el reintento.
 */
export async function queueCheckinNutricionalConFotos(
  payload: CheckinNutricionalDTO,
  fotos: FotoCheckinEnCola[],
  alumnoId: string
): Promise<number> {
  if (fotos.length === 0 || fotos.length > MAX_FOTOS_CHECKIN_NUTRICIONAL) {
    throw new Error(
      `Un reporte con fotos requiere entre 1 y ${MAX_FOTOS_CHECKIN_NUTRICIONAL} fotografías (RN-03).`
    );
  }

  const descripcion = `Reporte nutricional con ${fotos.length} foto${
    fotos.length === 1 ? '' : 's'
  } · ${payload.fecha}`;

  const mutationId = await offlineDb.outboxMutations.add({
    endpoint: '/nutricion/checkin-diario',
    method: 'POST',
    payload,
    idempotencyKey: generateIdempotencyKey(),
    description: descripcion,
    status: 'pending',
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    nextRetryAt: null,
    tipo: 'nutricion-checkin-fotos',
    alumnoId,
    fotos,
  });
  notifyOutboxChanged();
  return mutationId;
}

/**
 * Persiste el progreso de subida de las fotos tal cual quedó (storageKeys ya subidas).
 * Se llama tras CADA foto subida: si la app se cierra a mitad, el reintento reanuda aquí.
 */
export async function updateMutationPhotos(id: number, fotos: FotoCheckinEnCola[]): Promise<void> {
  await offlineDb.outboxMutations.update(id, { fotos });
  notifyOutboxChanged();
}

/**
 * Purga los blobs de una mutación con fotos ya confirmada por el servidor: la evidencia vive
 * en la bóveda (R2) y la fila `synced` se conserva sin cargar megabytes en el dispositivo.
 */
export async function purgeMutationPhotos(id: number): Promise<void> {
  await offlineDb.outboxMutations.update(id, { fotos: [] });
  notifyOutboxChanged();
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
  nextRetryAt: number,
  /** Solo en errores del servidor (5xx); un fallo de red no toca el contador. */
  fallosServidor?: number
): Promise<void> {
  await offlineDb.outboxMutations.update(id, {
    status: 'failed',
    lastError,
    nextRetryAt,
    ...(fallosServidor !== undefined ? { fallosServidor } : {}),
  });
  notifyOutboxChanged();
}

export async function markMutationRejected(
  id: number,
  lastError: string,
  motivoRechazo: MotivoRechazoCola | null = null
): Promise<void> {
  await offlineDb.outboxMutations.update(id, {
    status: 'rejected',
    lastError,
    nextRetryAt: null,
    motivoRechazo,
  });
  notifyOutboxChanged();
}

/**
 * D1: cuando "iniciar" de una sesión por fin se confirma, las series de esa sesión que el
 * servidor rechazó por no estar en progreso vuelven a `pending` para enviarse solas.
 */
export async function reactivarSeriesRechazadasPorSesionNoIniciada(grupo: string): Promise<number> {
  const rechazadas = await offlineDb.outboxMutations.where('status').equals('rejected').toArray();
  const aReactivar = rechazadas.filter(
    (item) =>
      item.id !== undefined &&
      item.motivoRechazo === 'sesion-no-iniciada' &&
      accionSesionDeMutacion(item) === 'series' &&
      grupoCausalDeMutacion(item) === grupo
  );
  for (const item of aReactivar) {
    await offlineDb.outboxMutations.update(item.id as number, {
      status: 'pending',
      lastError: null,
      nextRetryAt: null,
      motivoRechazo: null,
    });
  }
  if (aReactivar.length > 0) notifyOutboxChanged();
  return aReactivar.length;
}

/**
 * Reintento manual (rechazadas/fallidas): vuelve a `pending` y queda elegible de inmediato.
 * El contador de fallos del servidor se reinicia: el usuario concede una nueva tanda de intentos.
 */
export async function retryMutation(id: number): Promise<void> {
  const item = await offlineDb.outboxMutations.get(id);
  if (!item) return;
  await offlineDb.outboxMutations.update(id, {
    status: 'pending',
    lastError: null,
    nextRetryAt: null,
    motivoRechazo: null,
    fallosServidor: 0,
  });
  notifyOutboxChanged();
}

/**
 * Descarte manual y explícito de una mutación (el usuario decide perderla).
 * Para un check-in con fotos, borrar la fila libera también sus blobs de IndexedDB: la
 * evidencia local desaparece solo con esta decisión (nunca en silencio).
 */
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

/**
 * Sesión vencida (401) durante el envío: no es un rechazo del servidor sino falta de sesión.
 * La mutación vuelve a `pending` con los intentos previos (el intento fallido no cuenta) y sin
 * backoff, para enviarse en cuanto la misma persona vuelva a iniciar sesión.
 */
export async function devolverMutacionAPendiente(id: number, attemptsPrevios: number): Promise<void> {
  await offlineDb.outboxMutations.update(id, {
    status: 'pending',
    attempts: attemptsPrevios,
    nextRetryAt: null,
  });
  notifyOutboxChanged();
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

// ---------------------------------------------------------------------------
// D1: orden causal por sesión de entrenamiento
// ---------------------------------------------------------------------------

const PATRON_ENDPOINT_SESION = /^\/sesiones\/([^/?#]+)\/(iniciar|series|finalizar)(?:[/?#]|$)/;

export type AccionSesionCola = 'iniciar' | 'series' | 'finalizar';

/**
 * Sesión a la que pertenece una mutación (`sesion:{id}`), derivada del endpoint para que las
 * filas ya guardadas en IndexedDB funcionen sin migración. `null` = sin orden causal.
 */
export function grupoCausalDeMutacion(item: Pick<OutboxMutation, 'endpoint'>): string | null {
  const match = PATRON_ENDPOINT_SESION.exec(item.endpoint ?? '');
  return match ? `sesion:${match[1]}` : null;
}

export function accionSesionDeMutacion(
  item: Pick<OutboxMutation, 'endpoint'>
): AccionSesionCola | null {
  const match = PATRON_ENDPOINT_SESION.exec(item.endpoint ?? '');
  return match ? (match[2] as AccionSesionCola) : null;
}

/** Pendiente, en vuelo o fallida: todavía no llegó al servidor ni espera decisión del usuario. */
function estaSinEnviar(item: OutboxMutation): boolean {
  return item.status === 'pending' || item.status === 'syncing' || item.status === 'failed';
}

function esElegibleAhora(item: OutboxMutation, now: number): boolean {
  return (
    item.status === 'pending' || (item.status === 'failed' && (item.nextRetryAt ?? 0) <= now)
  );
}

function ordenarPorCreacion(a: OutboxMutation, b: OutboxMutation): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return (a.id ?? 0) - (b.id ?? 0);
}

/**
 * Selección pura de lo elegible respetando el orden causal de cada sesión:
 * - Una mutación sin enviar que aún no puede salir (fallida en espera o en vuelo) detiene
 *   todas las posteriores de SU sesión; otras sesiones y tipos siguen.
 * - "Finalizar" nunca sale mientras queden series de esa sesión sin enviar.
 * - Una rechazada no detiene su sesión (espera la decisión del usuario).
 * Las elegibles de una misma sesión salen en el orden en que se encolaron.
 */
export function seleccionarMutacionesElegibles(
  todas: OutboxMutation[],
  now: number = Date.now()
): OutboxMutation[] {
  const ordenadas = [...todas].sort(ordenarPorCreacion);
  const gruposDetenidos = new Set<string>();
  const elegibles: OutboxMutation[] = [];

  ordenadas.forEach((item, indice) => {
    const grupo = grupoCausalDeMutacion(item);
    if (grupo && gruposDetenidos.has(grupo)) return;

    if (!esElegibleAhora(item, now)) {
      if (grupo && estaSinEnviar(item)) gruposDetenidos.add(grupo);
      return;
    }

    if (grupo && accionSesionDeMutacion(item) === 'finalizar') {
      const quedanSeriesDespues = ordenadas
        .slice(indice + 1)
        .some(
          (otra) =>
            grupoCausalDeMutacion(otra) === grupo &&
            accionSesionDeMutacion(otra) === 'series' &&
            estaSinEnviar(otra)
        );
      if (quedanSeriesDespues) return;
    }

    elegibles.push(item);
  });

  return elegibles;
}

/** Mutaciones elegibles ahora: pendientes + fallidas cuyo backoff ya venció (orden causal D1). */
export async function getDueMutations(now: number = Date.now()): Promise<OutboxMutation[]> {
  const all = await offlineDb.outboxMutations.toArray();
  return seleccionarMutacionesElegibles(all, now);
}

/** D1: ¿queda algo de esta sesión sin llegar al servidor? (para no adelantarse a la cola). */
export async function hayMutacionesSinEnviarDeGrupo(grupo: string): Promise<boolean> {
  const all = await offlineDb.outboxMutations.toArray();
  return all.some((item) => grupoCausalDeMutacion(item) === grupo && estaSinEnviar(item));
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

/**
 * U4 — mutaciones que se perderían si se cierra sesión: todo lo que NO está confirmado por el
 * servidor, es decir `pending` + `syncing` (en vuelo) + `failed` (reintentará con backoff) +
 * `rejected` (espera una decisión del usuario). Una `synced` ya está a salvo y no cuenta.
 */
export async function contarMutacionesPendientes(): Promise<number> {
  return offlineDb.outboxMutations.where('status').notEqual('synced').count();
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

/**
 * D4: mientras la cola tenga cambios de una sesión sin llegar al servidor (p. ej. "Comenzar"
 * encolado), la copia del teléfono es la verdad más reciente: mostrar la del servidor
 * permitiría pulsar "Comenzar" otra vez o perder series marcadas tras recargar.
 */
export function elegirSesionParaMostrar<T extends { id: string }>(
  servidor: T | null,
  local: T | null,
  hayCambiosSinEnviar: boolean
): T | null {
  if (!servidor) return null;
  if (hayCambiosSinEnviar && local && local.id === servidor.id) return local;
  return servidor;
}

export interface RutinaCacheadaParaHoy {
  /** Sesión guardada cuya fecha programada es HOY (día local del alumno). */
  deHoy: CachedRutina | null;
  /** Si no hay de hoy: la más reciente de otro día (se informa, no se presenta como de hoy). */
  ultimaDeOtroDia: CachedRutina | null;
}

/**
 * D3: separa la sesión guardada de hoy de la última de otro día (desempate por `updatedAt`).
 * Una sesión EN_PROGRESO se muestra aunque sea de otro día (entrenamiento que cruza la
 * medianoche sin conexión) y tiene prioridad sobre la de hoy: si no, quedaría sin poder
 * terminarse. Con varias en progreso, la actualizada más recientemente.
 */
export function seleccionarRutinaCacheadaParaHoy(
  filas: CachedRutina[],
  hoyYyyyMmDd: string
): RutinaCacheadaParaHoy {
  const enProgreso = filas
    .filter((fila) => fila.sesion?.estado === EstadoSesion.EN_PROGRESO)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  if (enProgreso) return { deHoy: enProgreso, ultimaDeOtroDia: null };
  const porRecencia = (a: CachedRutina, b: CachedRutina) => {
    const fechaA = a.fechaProgramada ?? '';
    const fechaB = b.fechaProgramada ?? '';
    if (fechaA !== fechaB) return fechaB.localeCompare(fechaA);
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  };
  const deHoy = filas.filter((fila) => fila.fechaProgramada === hoyYyyyMmDd).sort(porRecencia)[0];
  if (deHoy) return { deHoy, ultimaDeOtroDia: null };
  const ultima = [...filas].sort(porRecencia)[0];
  return { deHoy: null, ultimaDeOtroDia: ultima ?? null };
}

/** D3: lectura offline de la sesión de hoy del alumno (nunca expone la de otro alumno). */
export async function getCachedRutinaParaHoy(
  alumnoId: string,
  hoyYyyyMmDd: string
): Promise<RutinaCacheadaParaHoy> {
  const filas = await offlineDb.rutinaHoy.where('alumnoId').equals(alumnoId).toArray();
  return seleccionarRutinaCacheadaParaHoy(filas, hoyYyyyMmDd);
}

/** D3: guarda el progreso semanal del alumno para verlo sin conexión. */
export async function guardarSemanaCacheada(
  alumnoId: string,
  semana: SemanaEntrenamientoProgresoDTO
): Promise<void> {
  await offlineDb.semanaEntrenamiento.put({ alumnoId, semana, updatedAt: Date.now() });
}

export async function leerSemanaCacheada(alumnoId: string): Promise<CachedSemana | null> {
  return (await offlineDb.semanaEntrenamiento.get(alumnoId)) ?? null;
}

// ---------------------------------------------------------------------------
// Higiene de sesión (WU22)
// ---------------------------------------------------------------------------

/**
 * WU22 — privacidad en dispositivo compartido: borra TODAS las tablas del
 * esquema (outbox, rutina y semana cacheadas, check-ins de nutrición y catálogo) para que
 * el siguiente usuario del dispositivo no vea datos del anterior.
 *
 * DECISIÓN: las mutaciones sin sincronizar se descartan a propósito.
 * Privacidad > datos: preferimos perder una mutación local antes que exponerla
 * al siguiente usuario. Si existen, se registra un `console.warn` con el conteo
 * para que quede rastro al diagnosticar una pérdida de datos reportada.
 *
 * U4: la UI de logout consulta `contarMutacionesPendientes()` y exige confirmación
 * explícita (o una sincronización previa) antes de llegar hasta aquí.
 */
export async function clearOfflineData(): Promise<void> {
  const sinSincronizar = await contarMutacionesPendientes();
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
    offlineDb.semanaEntrenamiento,
    async () => {
      await Promise.all([
        offlineDb.outboxMutations.clear(),
        offlineDb.rutinaHoy.clear(),
        offlineDb.checkinsNutricion.clear(),
        offlineDb.catalogoEjercicios.clear(),
        offlineDb.semanaEntrenamiento.clear(),
      ]);
    }
  );
  notifyOutboxChanged();
}
