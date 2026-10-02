import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import {
  clearOfflineData,
  contarMutacionesPendientes,
  devolverMutacionAPendiente,
  discardMutation,
  getDueMutations,
  getFailedMutations,
  getLatestCachedRutina,
  getOutboxSummary,
  getPendingMutations,
  getRejectedMutations,
  grupoCausalDeMutacion,
  guardarSemanaCacheada,
  hayMutacionesSinEnviarDeGrupo,
  leerSemanaCacheada,
  reactivarSeriesRechazadasPorSesionNoIniciada,
  seleccionarRutinaCacheadaParaHoy,
  elegirSesionParaMostrar,
  markMutationFailed,
  markMutationRejected,
  markMutationSyncing,
  markMutationSynced,
  offlineDb,
  pruneSyncedMutations,
  queueOfflineMutation,
  recoverStuckMutations,
  retryMutation,
  type CachedNutricion,
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
  await offlineDb.semanaEntrenamiento.clear();
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

  it('devolverMutacionAPendiente (sesión vencida) restaura los intentos previos y la deja elegible sin backoff', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync serie 6');
    await markMutationSyncing(id);
    await markMutationFailed(id, 'Servicio no disponible', Date.now() + 60_000);
    await markMutationSyncing(id); // segundo intento: attempts = 2

    await devolverMutacionAPendiente(id, 1);

    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row?.nextRetryAt).toBeNull();
    expect(await getDueMutations()).toHaveLength(1);
  });

  it('contarMutacionesPendientes cuenta todo lo no sincronizado (pendiente, en vuelo, fallida y rechazada)', async () => {
    expect(await contarMutacionesPendientes()).toBe(0);

    await queueOfflineMutation('/a', 'POST', {}, 'M1');
    const enVuelo = await queueOfflineMutation('/b', 'POST', {}, 'M2');
    await markMutationSyncing(enVuelo);
    const fallida = await queueOfflineMutation('/c', 'POST', {}, 'M3');
    await markMutationFailed(fallida, '5xx', Date.now() + 1_000);
    const rechazada = await queueOfflineMutation('/d', 'POST', {}, 'M4');
    await markMutationRejected(rechazada, '400');
    const lista = await queueOfflineMutation('/e', 'POST', {}, 'M5');
    await markMutationSynced(lista);

    // Las 4 no confirmadas se perderían al cerrar sesión; la sincronizada no cuenta.
    expect(await contarMutacionesPendientes()).toBe(4);

    await markMutationSynced(enVuelo);
    expect(await contarMutacionesPendientes()).toBe(3);

    await discardMutation(rechazada);
    expect(await contarMutacionesPendientes()).toBe(2);
  });
});

describe('offline-db: orden causal por sesión de entrenamiento (D1)', () => {
  it('identifica la sesión de cada mutación por su endpoint (compatible con filas antiguas)', () => {
    expect(grupoCausalDeMutacion({ endpoint: '/sesiones/s1/iniciar' })).toBe('sesion:s1');
    expect(grupoCausalDeMutacion({ endpoint: '/sesiones/s1/series' })).toBe('sesion:s1');
    expect(grupoCausalDeMutacion({ endpoint: '/sesiones/s1/finalizar' })).toBe('sesion:s1');
    expect(grupoCausalDeMutacion({ endpoint: '/nutricion/checkin-diario' })).toBeNull();
  });

  it('una mutación fallida con espera bloquea las posteriores de SU sesión, no las de otras', async () => {
    const iniciar = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar');
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');
    const otra = await queueOfflineMutation('/sesiones/s2/series', 'PUT', {}, 'Serie 1 otra');
    const nutricion = await queueOfflineMutation('/nutricion/checkin-diario', 'POST', {}, 'Reporte');
    await markMutationFailed(iniciar, 'Servicio no disponible', Date.now() + 60_000);

    const elegibles = (await getDueMutations()).map((m) => m.id);

    expect(elegibles).not.toContain(iniciar);
    expect(elegibles).not.toContain(serie);
    expect(elegibles).toEqual([otra, nutricion]);
  });

  it('las pendientes de una misma sesión se entregan en el orden en que se encolaron', async () => {
    const iniciar = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar');
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar');

    expect((await getDueMutations()).map((m) => m.id)).toEqual([iniciar, serie, finalizar]);
  });

  it('finalizar nunca es elegible mientras haya series de esa sesión sin enviar (aunque sean posteriores)', async () => {
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar');
    await offlineDb.outboxMutations.update(finalizar, { createdAt: 1 });
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');

    expect((await getDueMutations()).map((m) => m.id)).toEqual([serie]);
  });

  it('una rechazada no bloquea su sesión', async () => {
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');
    await markMutationRejected(serie, 'Dato inválido');
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar');

    expect((await getDueMutations()).map((m) => m.id)).toEqual([finalizar]);
  });

  it('descartar una fallida en espera desbloquea lo posterior de su sesión', async () => {
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar');
    await markMutationFailed(serie, 'Servicio no disponible', Date.now() + 60_000, 3);
    expect(await getDueMutations()).toHaveLength(0);

    await discardMutation(serie);

    expect((await getDueMutations()).map((m) => m.id)).toEqual([finalizar]);
  });

  it('markMutationFailed guarda los fallos del servidor y el reintento manual los reinicia', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');
    await markMutationFailed(id, 'Servicio no disponible', Date.now() + 60_000, 4);
    expect((await offlineDb.outboxMutations.get(id))?.fallosServidor).toBe(4);

    // Un fallo de red no toca el contador.
    await markMutationFailed(id, 'Failed to fetch', Date.now() + 60_000);
    expect((await offlineDb.outboxMutations.get(id))?.fallosServidor).toBe(4);

    await retryMutation(id);
    expect((await offlineDb.outboxMutations.get(id))?.fallosServidor).toBe(0);
  });

  it('reactivarSeriesRechazadasPorSesionNoIniciada devuelve a pendiente solo las series marcadas de esa sesión', async () => {
    const marcada = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1');
    await markMutationRejected(marcada, 'No se pudo guardar', 'sesion-no-iniciada');
    const otraRazon = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 2');
    await markMutationRejected(otraRazon, 'Peso inválido');
    const otraSesion = await queueOfflineMutation('/sesiones/s2/series', 'PUT', {}, 'Serie 1');
    await markMutationRejected(otraSesion, 'No se pudo guardar', 'sesion-no-iniciada');

    expect(await reactivarSeriesRechazadasPorSesionNoIniciada('sesion:s1')).toBe(1);

    const fila = await offlineDb.outboxMutations.get(marcada);
    expect(fila?.status).toBe('pending');
    expect(fila?.motivoRechazo ?? null).toBeNull();
    expect((await offlineDb.outboxMutations.get(otraRazon))?.status).toBe('rejected');
    expect((await offlineDb.outboxMutations.get(otraSesion))?.status).toBe('rejected');
  });

  it('hayMutacionesSinEnviarDeGrupo detecta pendientes/fallidas/en vuelo de esa sesión', async () => {
    expect(await hayMutacionesSinEnviarDeGrupo('sesion:s1')).toBe(false);
    const id = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar');
    expect(await hayMutacionesSinEnviarDeGrupo('sesion:s1')).toBe(true);
    expect(await hayMutacionesSinEnviarDeGrupo('sesion:s2')).toBe(false);
    await markMutationRejected(id, 'x');
    expect(await hayMutacionesSinEnviarDeGrupo('sesion:s1')).toBe(false);
  });
});

describe('offline-db: rutina guardada de hoy vs. de otro día (D3)', () => {
  it('elige la sesión de la fecha de hoy y, si no hay, informa la última de otro día', () => {
    const filas = [
      { id: 'a', alumnoId: 'x', fechaProgramada: '2026-10-01', sesion: fakeSesion('a'), updatedAt: 5 },
      { id: 'b', alumnoId: 'x', fechaProgramada: '2026-10-02', sesion: fakeSesion('b'), updatedAt: 1 },
      { id: 'c', alumnoId: 'x', fechaProgramada: '2026-10-02', sesion: fakeSesion('c'), updatedAt: 9 },
    ];

    expect(seleccionarRutinaCacheadaParaHoy(filas, '2026-10-02')).toEqual({
      deHoy: filas[2],
      ultimaDeOtroDia: null,
    });
    expect(seleccionarRutinaCacheadaParaHoy(filas, '2026-10-03')).toEqual({
      deHoy: null,
      ultimaDeOtroDia: filas[2],
    });
    expect(seleccionarRutinaCacheadaParaHoy([], '2026-10-03')).toEqual({
      deHoy: null,
      ultimaDeOtroDia: null,
    });
  });

  it('guarda y lee la semana del alumno para verla sin conexión', async () => {
    const semana = { semanaIso: '2026-W40' } as unknown as Parameters<typeof guardarSemanaCacheada>[1];
    await guardarSemanaCacheada('alumno-1', semana);

    const leida = await leerSemanaCacheada('alumno-1');
    expect(leida?.semana).toEqual(semana);
    expect(leida?.updatedAt).toBeTypeOf('number');
    expect(await leerSemanaCacheada('alumno-2')).toBeNull();
  });
});

describe('offline-db: sesión mostrada con cambios por enviar (D4)', () => {
  const servidor = { id: 's1', estado: 'planificada' } as unknown as CachedRutina['sesion'];
  const local = { id: 's1', estado: 'en_progreso' } as unknown as CachedRutina['sesion'];

  it('si la cola tiene cambios de esa sesión, manda la copia del teléfono (evita un segundo "Comenzar")', () => {
    expect(elegirSesionParaMostrar(servidor, local, true)).toBe(local);
  });

  it('sin cambios pendientes, o sin copia local de la misma sesión, manda el servidor', () => {
    expect(elegirSesionParaMostrar(servidor, local, false)).toBe(servidor);
    expect(elegirSesionParaMostrar(servidor, null, true)).toBe(servidor);
    const otra = { id: 's2', estado: 'en_progreso' } as unknown as CachedRutina['sesion'];
    expect(elegirSesionParaMostrar(servidor, otra, true)).toBe(servidor);
    expect(elegirSesionParaMostrar(null, local, true)).toBeNull();
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

describe('offline-db: clearOfflineData (higiene de logout)', () => {
  async function seedTodasLasTablas(): Promise<void> {
    await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync serie');
    await putCachedRutina('sesion-1', '2026-09-20', 1);
    await offlineDb.checkinsNutricion.add({
      alumnoId: 'alumno-1',
      fecha: '2026-09-20',
      checkin: {} as CachedNutricion['checkin'],
      updatedAt: Date.now(),
    });
    await offlineDb.catalogoEjercicios.put({
      id: 'ej-1',
      nombre: 'Sentadilla',
      grupoMuscular: 'Piernas',
    } as unknown as EjercicioCatalogoDetalleDTO);
    await guardarSemanaCacheada(
      'alumno-1',
      {} as unknown as Parameters<typeof guardarSemanaCacheada>[1]
    );
  }

  it('vacía TODAS las tablas del esquema', async () => {
    await seedTodasLasTablas();

    await clearOfflineData();

    expect(await offlineDb.semanaEntrenamiento.count()).toBe(0);
    expect(await offlineDb.outboxMutations.count()).toBe(0);
    expect(await offlineDb.rutinaHoy.count()).toBe(0);
    expect(await offlineDb.checkinsNutricion.count()).toBe(0);
    expect(await offlineDb.catalogoEjercicios.count()).toBe(0);
  });

  it('advierte con el conteo cuando descarta mutaciones sin sincronizar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await queueOfflineMutation('/a', 'POST', {}, 'M1');
    await queueOfflineMutation('/b', 'POST', {}, 'M2');
    const sincronizada = await queueOfflineMutation('/c', 'POST', {}, 'M3');
    await markMutationSynced(sincronizada);

    await clearOfflineData();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('2');
    warn.mockRestore();
  });

  it('no advierte si lo pendiente ya estaba sincronizado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sincronizada = await queueOfflineMutation('/a', 'POST', {}, 'M1');
    await markMutationSynced(sincronizada);

    await clearOfflineData();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('es idempotente y no falla con la base vacía', async () => {
    await expect(clearOfflineData()).resolves.toBeUndefined();
    await expect(clearOfflineData()).resolves.toBeUndefined();
  });
});
