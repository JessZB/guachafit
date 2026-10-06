import { apiClient, generateIdempotencyKey, getAuthToken } from './api-client';
import {
  CODIGO_CHECKIN_YA_REGISTRADO,
  CODIGO_SESION_NO_INICIADA,
  MENSAJE_CHECKIN_FUERA_DE_PLAZO,
  type CheckinNutricionalDetalleDTO,
  type CheckinNutricionalDTO,
  type PresignedUploadUrlResponseDTO,
} from '@guachafit/shared';
import {
  accionSesionDeMutacion,
  devolverMutacionAPendiente,
  getDueMutations,
  grupoCausalDeMutacion,
  reactivarSeriesRechazadasPorSesionNoIniciada,
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
  type MotivoRechazoCola,
  type OutboxMutation,
  type OutboxSummary,
} from './offline-db';
import {
  coincideReporteServidorConPendiente,
  cuerpoCheckinParaEnviar,
  ENDPOINT_CHECKIN_DIARIO,
  esRechazoFueraDePlazoCheckin,
  esRechazoVentanaCheckin,
  MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS,
  MENSAJE_REPORTE_CON_OTROS_DATOS,
} from './nutricion-checkin';
import { queryClient } from './query-client';

// ---------------------------------------------------------------------------
// Backoff exponencial con jitter (WU4)
// ---------------------------------------------------------------------------

export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 60_000;
/**
 * Tope de fallos del servidor (5xx) por mutación: al alcanzarlo pasa a `rejected` para no
 * bloquear para siempre lo posterior de su sesión (D1). Los fallos de red no cuentan.
 */
export const MAX_INTENTOS_ERROR_SERVIDOR = 8;
export const MENSAJE_TOPE_ERRORES_SERVIDOR =
  'No pudimos enviar este cambio después de varios intentos. Puedes reintentar o descartarlo.';
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

/**
 * D6: un envío directo (con red) que falla solo va a la cola si reintentar puede servir:
 * error de red, 5xx o sesión vencida (401, se envía al volver a iniciar sesión). Cualquier otro
 * 4xx es un rechazo de datos: no se encola, se revierte y se muestra el error al alumno.
 */
export function esFalloParaEncolar(err: unknown): boolean {
  const status = getErrorStatus(err);
  return status === 0 || status === 401 || status >= 500;
}

/**
 * D6: mensaje para el usuario. `ApiError.message` ya viene traducido (mensajes-error), así que
 * tiene prioridad sobre el `detail` crudo del servidor.
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const problemDetail = (err as { problem?: { detail?: unknown } } | null)?.problem?.detail;
  if (typeof problemDetail === 'string' && problemDetail.trim()) return problemDetail;
  return 'Error de red al sincronizar';
}

/** Texto original del servidor (sin traducir), solo para clasificar el rechazo. */
function getMensajeServidorCrudo(err: unknown): string {
  const conMensaje = err as {
    mensajeServidor?: unknown;
    problem?: { detail?: unknown; message?: unknown };
  } | null;
  for (const candidato of [
    conMensaje?.mensajeServidor,
    conMensaje?.problem?.detail,
    conMensaje?.problem?.message,
  ]) {
    if (typeof candidato === 'string' && candidato.trim()) return candidato;
  }
  return err instanceof Error ? err.message : '';
}

/** Código máquina estable del servidor (`code` del cuerpo del error), si viene. */
function getCodigoServidor(err: unknown): string | null {
  const codigo = (err as { problem?: { code?: unknown } } | null)?.problem?.code;
  return typeof codigo === 'string' ? codigo : null;
}

/**
 * D1: el servidor rechazó una serie porque la sesión aún no estaba en progreso. Se clasifica por
 * el código estable; el texto (`en_progreso`) queda como respaldo para servidores anteriores.
 */
function esRechazoPorSesionNoIniciada(item: OutboxMutation, err: unknown): boolean {
  if (accionSesionDeMutacion(item) !== 'series') return false;
  if (getCodigoServidor(err) === CODIGO_SESION_NO_INICIADA) return true;
  return /en_progreso|en progreso/i.test(getMensajeServidorCrudo(err));
}

/**
 * LOTE API-N1: 409 del POST del reporte diario con el código estable de "ya registrado". Se
 * clasifica por el código (no por el texto) y solo para ese endpoint.
 */
function esReporteDiarioYaRegistrado(item: OutboxMutation, err: unknown): boolean {
  return (
    item.endpoint === ENDPOINT_CHECKIN_DIARIO &&
    item.method === 'POST' &&
    getErrorStatus(err) === 409 &&
    getCodigoServidor(err) === CODIGO_CHECKIN_YA_REGISTRADO
  );
}

/**
 * LOTE API-N2: el reporte del día llegó después de las 12:00 del día siguiente. Se convierte en un
 * 400 con el texto compartido para que el bucle lo marque como rechazo definitivo visible (nunca
 * un reintento) sin depender del texto del servidor.
 */
function rechazoReporteFueraDePlazo(item: OutboxMutation, err: unknown): (Error & { status: number }) | null {
  if (item.endpoint !== ENDPOINT_CHECKIN_DIARIO || !esRechazoFueraDePlazoCheckin(err)) return null;
  return Object.assign(new Error(MENSAJE_CHECKIN_FUERA_DE_PLAZO), { status: 400 });
}

/**
 * LOTE API-N2: cuerpo del POST del reporte diario calculado al ENVIAR (agrega
 * `segundosDesdeCaptura`); el resto de mutaciones viaja tal cual.
 */
function cuerpoAlEnviar(item: OutboxMutation, extra: Record<string, unknown> = {}): unknown {
  if (item.endpoint !== ENDPOINT_CHECKIN_DIARIO || item.method !== 'POST') return item.payload;
  return cuerpoCheckinParaEnviar({ ...(item.payload ?? {}), ...extra }, item.capturadoEnMs);
}

/** Rechazo definitivo con su motivo local (lo lee el bucle de `processOutboxQueue`). */
type ErrorRechazoCola = Error & { status: number; motivoRechazo: MotivoRechazoCola };

function getMotivoRechazo(err: unknown): MotivoRechazoCola | null {
  const motivo = (err as { motivoRechazo?: unknown } | null)?.motivoRechazo;
  return motivo === 'reporte-con-otros-datos' ? motivo : null;
}

/**
 * LOTE API-N1: tras un 409 "ya registrado" no se da nada por sincronizado a ciegas. Se consulta el
 * reporte de hoy del servidor y se compara con el pendiente:
 * - coincide → era el reintento de un envío que sí llegó (éxito perdido): termina sin error;
 * - responde y difiere, o responde sin reporte → rechazo visible con mensaje claro;
 * - la consulta falla (red, 5xx, sesión vencida…) → se relanza ese error: el bucle lo trata como
 *   cualquier fallo del envío (reintento con backoff), sin decidir nada todavía.
 * Los blobs locales NO se tocan salvo en el éxito: el alumno decide si descarta un rechazo.
 */
async function confirmarReporteYaRegistrado(item: OutboxMutation, fotosPendiente: number): Promise<void> {
  const payload = (item.payload ?? {}) as Partial<CheckinNutricionalDTO>;
  const consulta = new URLSearchParams({ fecha: String(payload.fecha ?? '') });
  if (payload.timezoneCliente) consulta.set('timezoneCliente', payload.timezoneCliente);
  const servidor = await apiClient<CheckinNutricionalDetalleDTO | null>(
    `/nutricion/checkin/hoy?${consulta.toString()}`
  );
  if (servidor && coincideReporteServidorConPendiente(servidor, payload, fotosPendiente)) return;
  const rechazo = new Error(MENSAJE_REPORTE_CON_OTROS_DATOS) as ErrorRechazoCola;
  rechazo.status = 409;
  rechazo.motivoRechazo = 'reporte-con-otros-datos';
  throw rechazo;
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
      body: JSON.stringify(cuerpoAlEnviar(item, fotosPlatos.length > 0 ? { fotosPlatos } : {})),
      idempotencyKey: item.idempotencyKey || generateIdempotencyKey(),
    });
  } catch (err) {
    // LOTE API-N2: llegó después del plazo del día siguiente; la evidencia local se conserva.
    const fueraDePlazo = rechazoReporteFueraDePlazo(item, err);
    if (fueraDePlazo) throw fueraDePlazo;
    // RN-02: la ventana/día local cerró mientras la evidencia esperaba en la cola. Se marca
    // como rechazo definitivo con un mensaje claro (sin el tecnicismo del servidor).
    if (getErrorStatus(err) === 400 && esRechazoVentanaCheckin(getMensajeServidorCrudo(err), getCodigoServidor(err))) {
      const rechazo = new Error(MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS) as Error & {
        status: number;
      };
      rechazo.status = 400;
      throw rechazo;
    }
    if (!esReporteDiarioYaRegistrado(item, err)) throw err;
    // LOTE API-N1: solo cuenta como confirmado si el servidor tiene ESTE reporte.
    await confirmarReporteYaRegistrado(item, fotosPlatos.length);
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
  // Sin sesión (cerrada o vencida) no se envía nada: la cola se conserva intacta y se procesa
  // cuando la misma persona vuelva a iniciar sesión (el login dispara el procesamiento).
  if (!getAuthToken()) {
    await refreshOutboxStatus();
    return { processed: 0, failed: 0, rejected: 0, skipped: true };
  }

  isSyncing = true;
  emit();

  let processed = 0;
  let failed = 0;
  let rejected = 0;

  try {
    // D1: la cola se relee tras cada envío para respetar el orden causal por sesión (una
    // falla detiene lo posterior de su sesión; un "iniciar" confirmado reactiva sus series).
    const vistasEnEstaPasada = new Set<number>();
    const gruposDetenidos = new Set<string>();

    while (true) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      const item = (await getDueMutations()).find((candidata) => {
        if (candidata.id === undefined || vistasEnEstaPasada.has(candidata.id)) return false;
        const grupo = grupoCausalDeMutacion(candidata);
        return !grupo || !gruposDetenidos.has(grupo);
      });
      if (!item || item.id === undefined) break;
      vistasEnEstaPasada.add(item.id);
      const grupo = grupoCausalDeMutacion(item);

      await markMutationSyncing(item.id);

      try {
        if (item.tipo === 'nutricion-checkin-fotos') {
          // Rama con evidencia fotográfica: sube los blobs y luego registra el check-in.
          await processCheckinNutricionalConFotos(item);
        } else {
          try {
            await apiClient(item.endpoint, {
              method: item.method,
              body: JSON.stringify(cuerpoAlEnviar(item)),
              // La MISMA key en cada reintento: el servidor puede deduplicar aunque el
              // intento anterior haya llegado y la respuesta se haya perdido.
              idempotencyKey: item.idempotencyKey || generateIdempotencyKey(),
            });
          } catch (err) {
            const fueraDePlazo = rechazoReporteFueraDePlazo(item, err);
            if (fueraDePlazo) throw fueraDePlazo;
            if (!esReporteDiarioYaRegistrado(item, err)) throw err;
            // LOTE API-N1: solo cuenta como sincronizado si el servidor tiene ESTE reporte.
            await confirmarReporteYaRegistrado(item, 0);
          }
        }
        await markMutationSynced(item.id);
        processed++;
        if (grupo && accionSesionDeMutacion(item) === 'iniciar') {
          await reactivarSeriesRechazadasPorSesionNoIniciada(grupo);
        }
      } catch (err) {
        const status = getErrorStatus(err);
        const message = getErrorMessage(err);

        if (status === 401) {
          // Sesión vencida: no es un rechazo de datos. Vuelve a pendiente sin contar el intento
          // y se detiene el bucle (el resto de la cola también fallaría por falta de sesión).
          await devolverMutacionAPendiente(item.id, item.attempts ?? 0);
          console.warn(
            `[Guachafit Sync] Sesión vencida: la mutación #${item.id} queda pendiente hasta volver a iniciar sesión`
          );
          break;
        }

        if (status >= 400 && status < 500) {
          // Error del servidor (contrato/datos): reintentar no ayuda. Queda VISIBLE
          // para el usuario con la razón; jamás se descarta en silencio.
          await markMutationRejected(
            item.id,
            message,
            esRechazoPorSesionNoIniciada(item, err) ? 'sesion-no-iniciada' : getMotivoRechazo(err)
          );
          rejected++;
          console.warn(
            `[Guachafit Sync] Mutación #${item.id} rechazada por el servidor (${status}): ${message}`
          );
        } else if (
          status >= 500 &&
          (item.fallosServidor ?? 0) + 1 >= MAX_INTENTOS_ERROR_SERVIDOR
        ) {
          // Tope de 5xx: deja de reintentar sola y espera la decisión del usuario. Una rechazada
          // no detiene su sesión, así que las series siguientes y el finalizar pueden salir.
          await markMutationRejected(item.id, MENSAJE_TOPE_ERRORES_SERVIDOR, 'tope-errores-servidor');
          rejected++;
          console.warn(
            `[Guachafit Sync] Mutación #${item.id} rechazada tras ${MAX_INTENTOS_ERROR_SERVIDOR} errores del servidor (${status})`
          );
        } else {
          // Red/5xx: reintento con backoff exponencial + jitter. Solo los 5xx suman al tope.
          const attempts = (item.attempts ?? 0) + 1;
          const delay = computeBackoffDelayMs(attempts);
          await markMutationFailed(
            item.id,
            message,
            Date.now() + delay,
            status >= 500 ? (item.fallosServidor ?? 0) + 1 : undefined
          );
          failed++;
          // D1: lo posterior de esta sesión espera a que esta mutación salga.
          if (grupo) gruposDetenidos.add(grupo);
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
