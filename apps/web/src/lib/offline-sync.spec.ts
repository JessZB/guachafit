import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, setAuthToken } from './api-client';
import { MENSAJE_ERROR_GENERICO } from './mensajes-error';
import {
  AUTO_SYNC_INTERVAL_MS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_INTENTOS_ERROR_SERVIDOR,
  MENSAJE_TOPE_ERRORES_SERVIDOR,
  computeBackoffDelayMs,
  esFalloParaEncolar,
  processOutboxQueue,
} from './offline-sync';
import {
  getFailedMutations,
  getOutboxSummary,
  getRejectedMutations,
  offlineDb,
  queueOfflineMutation,
} from './offline-db';
import {
  registrarEnvioEnVuelo,
  reiniciarEnviosEnVueloParaTests,
} from './envios-en-vuelo';

vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = vi.mocked(apiClient);

function setNavigatorOnline(online: boolean): void {
  if (typeof navigator === 'undefined') {
    (globalThis as { navigator?: unknown }).navigator = { onLine: online };
    return;
  }
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true, writable: true });
}

function httpError(status: number, detail: string): Error & { status: number } {
  return Object.assign(new Error(detail), { status });
}

/** localStorage en memoria (entorno node): la cola solo se procesa con sesión activa. */
function instalarStorageEnMemoria(): void {
  const datos = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    removeItem: (clave: string) => void datos.delete(clave),
  });
}

beforeEach(async () => {
  instalarStorageEnMemoria();
  setAuthToken('token-sesion-activa');
  setNavigatorOnline(true);
  mockedApiClient.mockReset();
  await offlineDb.outboxMutations.clear();
  await offlineDb.rutinaHoy.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline-sync: backoff exponencial con jitter', () => {
  it('crece exponencialmente, respeta el tope y aplica jitter ±20%', () => {
    expect(computeBackoffDelayMs(1, () => 0.5)).toBe(BASE_BACKOFF_MS);
    expect(computeBackoffDelayMs(2, () => 0.5)).toBe(4_000);
    expect(computeBackoffDelayMs(3, () => 0.5)).toBe(8_000);
    expect(computeBackoffDelayMs(1, () => 0)).toBe(1_600);
    expect(computeBackoffDelayMs(1, () => 1)).toBe(2_400);
    expect(computeBackoffDelayMs(20, () => 0.5)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffDelayMs(20, () => 1)).toBe(MAX_BACKOFF_MS);
    expect(AUTO_SYNC_INTERVAL_MS).toBeGreaterThan(0);
  });
});

describe('offline-sync: procesamiento de la cola', () => {
  it('éxito → synced, visible en auditoría y contadores en cero', async () => {
    const id = await queueOfflineMutation(
      '/sesiones/s1/series',
      'PUT',
      { series: [] },
      'Sync serie 1',
      'key-ok'
    );
    mockedApiClient.mockResolvedValueOnce(null);

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, failed: 0, rejected: 0, skipped: false });
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.mock.calls[0][1]?.idempotencyKey).toBe('key-ok');
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('synced');
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 0, rejected: 0 });
  });

  it('4xx → rejected con la razón del servidor, sin reintento automático', async () => {
    await queueOfflineMutation(
      '/sesiones/s1/series',
      'PUT',
      { series: [] },
      'Sync serie 2',
      'key-rejected'
    );
    mockedApiClient.mockRejectedValueOnce(httpError(422, 'Peso inválido: corrige el valor (ej. 28.5)'));

    const first = await processOutboxQueue();

    expect(first).toMatchObject({ processed: 0, failed: 0, rejected: 1 });
    const rejected = await getRejectedMutations();
    expect(rejected).toHaveLength(1);
    expect(rejected[0].lastError).toContain('Peso inválido');
    expect(await getOutboxSummary()).toEqual({ pending: 0, failed: 0, rejected: 1 });

    // Aunque se procese de nuevo la cola, una rechazada no se reintenta ni se borra
    await processOutboxQueue();
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
    expect(await getRejectedMutations()).toHaveLength(1);
  });

  it('5xx → failed con backoff; no reintenta hasta vencer y reutiliza la misma idempotencyKey', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter neutro: delays exactos
    const id = await queueOfflineMutation(
      '/sesiones/s1/series',
      'PUT',
      { series: [] },
      'Sync serie 3',
      'key-retry'
    );
    mockedApiClient.mockRejectedValue(httpError(503, 'Servicio no disponible'));

    const first = await processOutboxQueue();

    expect(first).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const failed = await getFailedMutations();
    expect(failed).toHaveLength(1);
    expect(failed[0].attempts).toBe(1);
    expect(failed[0].lastError).toContain('Servicio no disponible');
    expect(failed[0].nextRetryAt).toBeGreaterThan(Date.now());
    expect((failed[0].nextRetryAt ?? 0) - Date.now()).toBeLessThanOrEqual(BASE_BACKOFF_MS);

    // Sin vencer el backoff no hay reintento (ni loops apretados)
    await processOutboxQueue();
    expect(mockedApiClient).toHaveBeenCalledTimes(1);

    // Al vencer, reintenta con la MISMA key persistida
    await offlineDb.outboxMutations.update(id, { nextRetryAt: 0 });
    mockedApiClient.mockResolvedValueOnce(null);
    const second = await processOutboxQueue();

    expect(second).toMatchObject({ processed: 1, failed: 0, rejected: 0 });
    expect(mockedApiClient).toHaveBeenCalledTimes(2);
    expect(mockedApiClient.mock.calls[0][1]?.idempotencyKey).toBe('key-retry');
    expect(mockedApiClient.mock.calls[1][1]?.idempotencyKey).toBe('key-retry');
  });

  it('sin conexión no toca la red y conserva los pendientes', async () => {
    setNavigatorOnline(false);
    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión', 'key-offline');

    const result = await processOutboxQueue();

    expect(result.skipped).toBe(true);
    expect(mockedApiClient).not.toHaveBeenCalled();
    expect(await getOutboxSummary()).toEqual({ pending: 1, failed: 0, rejected: 0 });
  });

  it('error de red sin status (fetch caído) se trata como fallo reintentable, no como rechazo', async () => {
    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión', 'key-net');
    mockedApiClient.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const failed = await getFailedMutations();
    expect(failed).toHaveLength(1);
    expect(failed[0].lastError).toContain('Failed to fetch');
  });
});

describe('offline-sync: qué fallos del envío directo van a la cola (D6)', () => {
  it('red, 5xx y sesión vencida se encolan; los demás 4xx no', () => {
    expect(esFalloParaEncolar(new TypeError('Failed to fetch'))).toBe(true);
    expect(esFalloParaEncolar(httpError(503, 'x'))).toBe(true);
    expect(esFalloParaEncolar(httpError(401, 'x'))).toBe(true);
    expect(esFalloParaEncolar(httpError(400, 'x'))).toBe(false);
    expect(esFalloParaEncolar(httpError(409, 'x'))).toBe(false);
    expect(esFalloParaEncolar(httpError(422, 'x'))).toBe(false);
  });
});

describe('offline-sync: orden causal por sesión (D1)', () => {
  it('iniciar falla (5xx) → series y finalizar esperan; al recuperarse todo se envía en orden y nada se rechaza', async () => {
    const iniciar = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar', 'k-ini');
    const serie1 = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    const serie2 = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 2', 'k-s2');
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar', 'k-fin');
    mockedApiClient.mockRejectedValueOnce(httpError(503, 'Servicio no disponible'));

    const primera = await processOutboxQueue();

    expect(primera).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
    for (const id of [serie1, serie2, finalizar]) {
      expect((await offlineDb.outboxMutations.get(id))?.status).toBe('pending');
    }

    // Recuperación: vence el backoff y el servidor responde.
    await offlineDb.outboxMutations.update(iniciar, { nextRetryAt: 0 });
    mockedApiClient.mockResolvedValue(null);
    const segunda = await processOutboxQueue();

    expect(segunda).toMatchObject({ processed: 4, failed: 0, rejected: 0 });
    expect(mockedApiClient.mock.calls.slice(1).map((llamada) => llamada[1]?.idempotencyKey)).toEqual([
      'k-ini',
      'k-s1',
      'k-s2',
      'k-fin',
    ]);
    expect(await getRejectedMutations()).toHaveLength(0);
  });

  it('si una serie falla en la misma pasada, finalizar de esa sesión no se envía pero otras sesiones sí', async () => {
    await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar', 'k-fin');
    const otra = await queueOfflineMutation('/sesiones/s2/series', 'PUT', {}, 'Serie otra', 'k-otra');
    mockedApiClient.mockRejectedValueOnce(httpError(502, 'Bad gateway')).mockResolvedValue(null);

    const resultado = await processOutboxQueue();

    expect(resultado).toMatchObject({ processed: 1, failed: 1 });
    expect(mockedApiClient.mock.calls.map((llamada) => llamada[1]?.idempotencyKey)).toEqual([
      'k-s1',
      'k-otra',
    ]);
    expect((await offlineDb.outboxMutations.get(finalizar))?.status).toBe('pending');
    expect((await offlineDb.outboxMutations.get(otra))?.status).toBe('synced');
  });

  it('serie rechazada por sesión no iniciada → vuelve a pendiente y se envía cuando iniciar tiene éxito', async () => {
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    const crudo =
      "Operación denegada: Solo se pueden registrar series en sesiones con estado 'en_progreso'. Estado actual: 'planificada'.";
    mockedApiClient.mockRejectedValueOnce(new ApiError(400, { detail: crudo } as never));

    await processOutboxQueue();
    const rechazada = await offlineDb.outboxMutations.get(serie);
    expect(rechazada?.status).toBe('rejected');
    // D6: el usuario ve el mensaje traducido, nunca el texto técnico del servidor.
    expect(rechazada?.lastError).toBe(MENSAJE_ERROR_GENERICO);

    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar', 'k-ini');
    mockedApiClient.mockResolvedValue(null);
    await processOutboxQueue();
    await processOutboxQueue();

    expect((await offlineDb.outboxMutations.get(serie))?.status).toBe('synced');
    const claves = mockedApiClient.mock.calls.map((llamada) => llamada[1]?.idempotencyKey);
    expect(claves.indexOf('k-ini')).toBeLessThan(claves.lastIndexOf('k-s1'));
  });

  it('LOTE API-2: serie rechazada con code SESION_NO_INICIADA (texto nuevo) → se reactiva al iniciar', async () => {
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    mockedApiClient.mockRejectedValueOnce(
      new ApiError(400, {
        statusCode: 400,
        error: 'Bad Request',
        // Literal a propósito: fija el contrato del cable con el API.
        code: 'SESION_NO_INICIADA',
        message: 'Para marcar series, primero pulsa «Comenzar a entrenar».',
      } as never)
    );

    await processOutboxQueue();
    const rechazada = await offlineDb.outboxMutations.get(serie);
    expect(rechazada?.status).toBe('rejected');
    // El texto nuevo del servidor ya es claro: se muestra tal cual.
    expect(rechazada?.lastError).toBe('Para marcar series, primero pulsa «Comenzar a entrenar».');

    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar', 'k-ini');
    mockedApiClient.mockResolvedValue(null);
    await processOutboxQueue();
    await processOutboxQueue();

    expect((await offlineDb.outboxMutations.get(serie))?.status).toBe('synced');
  });

  it('LOTE API-2: un 400 de series SIN el código ni el texto de sesión no iniciada no se reactiva', async () => {
    const serie = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    mockedApiClient.mockRejectedValueOnce(
      new ApiError(400, {
        statusCode: 400,
        message: 'Esta serie ya no está en tu entrenamiento. Actualiza la pantalla.',
      } as never)
    );

    await processOutboxQueue();
    await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Comenzar', 'k-ini');
    mockedApiClient.mockResolvedValue(null);
    await processOutboxQueue();
    await processOutboxQueue();

    expect((await offlineDb.outboxMutations.get(serie))?.status).toBe('rejected');
  });

  it('usa el mensaje ya traducido (err.message) en lugar del detalle crudo del servidor', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    mockedApiClient.mockRejectedValueOnce(
      new ApiError(404, { detail: "Sesión con ID 'abc' no encontrada." } as never)
    );

    await processOutboxQueue();

    expect((await offlineDb.outboxMutations.get(id))?.lastError).toBe(MENSAJE_ERROR_GENERICO);
  });
});

describe('offline-sync: tope de intentos ante errores del servidor', () => {
  it('5xx repetido alcanza el tope → rejected con motivo legible y lo siguiente de la sesión se envía', async () => {
    const serie1 = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    const serie2 = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 2', 'k-s2');
    const finalizar = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar', 'k-fin');
    mockedApiClient.mockImplementation(async (_endpoint, opciones) => {
      if (opciones?.idempotencyKey === 'k-s1') throw httpError(503, 'Servicio no disponible');
      return null;
    });

    for (let intento = 1; intento < MAX_INTENTOS_ERROR_SERVIDOR; intento++) {
      await offlineDb.outboxMutations.update(serie1, { nextRetryAt: 0 });
      await processOutboxQueue();
      expect((await offlineDb.outboxMutations.get(serie1))?.status).toBe('failed');
      expect((await offlineDb.outboxMutations.get(serie2))?.status).toBe('pending');
    }

    await offlineDb.outboxMutations.update(serie1, { nextRetryAt: 0 });
    const resultado = await processOutboxQueue();

    expect(resultado).toMatchObject({ processed: 2, rejected: 1, failed: 0 });
    const rechazada = await offlineDb.outboxMutations.get(serie1);
    expect(rechazada?.status).toBe('rejected');
    expect(rechazada?.lastError).toBe(MENSAJE_TOPE_ERRORES_SERVIDOR);
    expect((await offlineDb.outboxMutations.get(serie2))?.status).toBe('synced');
    expect((await offlineDb.outboxMutations.get(finalizar))?.status).toBe('synced');
  });

  it('un fallo de red repetido no cuenta para el tope: sigue reintentando con backoff', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie 1', 'k-s1');
    mockedApiClient.mockRejectedValue(new TypeError('Failed to fetch'));

    for (let intento = 0; intento < MAX_INTENTOS_ERROR_SERVIDOR + 2; intento++) {
      await offlineDb.outboxMutations.update(id, { nextRetryAt: 0 });
      await processOutboxQueue();
    }

    const fila = await offlineDb.outboxMutations.get(id);
    expect(fila?.status).toBe('failed');
    expect(fila?.attempts).toBe(MAX_INTENTOS_ERROR_SERVIDOR + 2);
    expect(await getRejectedMutations()).toHaveLength(0);
  });
});

describe('offline-sync: sesión vencida conserva la cola', () => {
  it('sin sesión activa no procesa ni toca la cola', async () => {
    setAuthToken(null);
    const id = await queueOfflineMutation('/sesiones/s1/iniciar', 'POST', {}, 'Iniciar sesión', 'key-sin-sesion');

    const result = await processOutboxQueue();

    expect(result.skipped).toBe(true);
    expect(mockedApiClient).not.toHaveBeenCalled();
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(0);
  });

  it('401 → vuelve a pendiente sin sumar intentos y detiene el bucle', async () => {
    const primera = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync 1', 'key-401-a');
    const segunda = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync 2', 'key-401-b');
    mockedApiClient.mockRejectedValue(httpError(401, 'Tu sesión venció'));

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 0, rejected: 0, skipped: false });
    // No se sigue quemando el resto de la cola contra un servidor que exige iniciar sesión.
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
    for (const id of [primera, segunda]) {
      const row = await offlineDb.outboxMutations.get(id);
      expect(row?.status).toBe('pending');
      expect(row?.attempts).toBe(0);
      expect(row?.nextRetryAt).toBeNull();
    }
    expect(await getRejectedMutations()).toHaveLength(0);
    expect(await getOutboxSummary()).toEqual({ pending: 2, failed: 0, rejected: 0 });
  });

  it('422 sigue siendo rechazo definitivo aunque exista el manejo de 401', async () => {
    await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Sync 3', 'key-422');
    mockedApiClient.mockRejectedValueOnce(httpError(422, 'Dato inválido'));

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ rejected: 1 });
    expect(await getRejectedMutations()).toHaveLength(1);
  });

  it('tras volver a iniciar sesión, la cola conservada se envía', async () => {
    setAuthToken(null);
    const id = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar', 'key-relogin');
    expect((await processOutboxQueue()).skipped).toBe(true);

    // Login de la misma persona: se persiste el token nuevo.
    setAuthToken('token-nuevo');
    mockedApiClient.mockResolvedValueOnce(null);
    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, skipped: false });
    expect(mockedApiClient.mock.calls[0][1]?.idempotencyKey).toBe('key-relogin');
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('synced');
  });
});

/** Sondeo por condición sin dependencias nuevas (este spec corre en entorno node). */
async function esperarHasta(condicion: () => boolean, mensaje: string): Promise<void> {
  const limite = Date.now() + 2_000;
  for (;;) {
    if (condicion()) return;
    if (Date.now() > limite) throw new Error(`timeout esperando: ${mensaje}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('offline-sync (E9) · U7: un grupo en vuelo no se envía y se drena solo al liberar', () => {
  it('U7 · con sesion:A en vuelo, processOutboxQueue no la envía; al liberar se procesa sola', async () => {
    // El registro de envíos en vuelo retiene al grupo hasta que se libera.
    const liberar = registrarEnvioEnVuelo('sesion:A');
    try {
      const id = await queueOfflineMutation('/sesiones/A/series', 'PUT', {}, 'Serie A', 'k-a');
      mockedApiClient.mockResolvedValue(null);

      const resultado = await processOutboxQueue();

      expect(resultado.processed).toBe(0);
      expect(mockedApiClient).not.toHaveBeenCalled();
      expect((await offlineDb.outboxMutations.get(id))?.status).toBe('pending');

      // Al liberar, la pasada se dispara sola: sin llamar a processOutboxQueue a mano.
      liberar();
      await esperarHasta(
        () => mockedApiClient.mock.calls.length > 0,
        'la cola de sesion:A debió enviarse sola al liberar el grupo'
      );
      expect((await offlineDb.outboxMutations.get(id))?.status).toBe('synced');
    } finally {
      reiniciarEnviosEnVueloParaTests();
    }
  });
});

describe('offline-sync (E9) · U8: llamada concurrente + pasada extra', () => {
  it('U8 · si se llama mientras procesa, devuelve skipped:true y lo encolado entre medias se envía', async () => {
    let resolverA: ((valor: unknown) => void) | null = null;
    mockedApiClient.mockImplementationOnce(
      () =>
        new Promise((resolver) => {
          resolverA = resolver as (valor: unknown) => void;
        })
    );
    mockedApiClient.mockResolvedValue(null);
    await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie A', 'k-a');

    const primera = processOutboxQueue();
    // Puerta por condición (40-R1): la primera pasada ya está en vuelo con A antes de
    // encolar B, así que la llamada concurrente ve `isSyncing` y devuelve `skipped:true`
    // de forma determinista (sin esta espera, `resolverA` podía seguir en `null`).
    await esperarHasta(
      () => resolverA !== null,
      'la primera pasada debió entrar en apiClient(A)'
    );
    const idB = await queueOfflineMutation('/sesiones/s1/series', 'PUT', {}, 'Serie B', 'k-b');
    const concurrente = await processOutboxQueue();
    expect(concurrente.skipped).toBe(true);

    (resolverA as ((valor: unknown) => void) | null)?.(null);
    const resultadoPrimera = await primera;

    // Sin llamada manual: B se envía al acabar (hoy, en la misma pasada de drenado; la
    // espera por condición lo deja robusto si el drenado cambia de forma).
    expect(resultadoPrimera.skipped).toBe(false);
    await esperarHasta(
      () =>
        (mockedApiClient.mock.calls.map((llamada) => llamada[1]?.idempotencyKey) as string[]).includes(
          'k-b'
        ),
      'B debió enviarse al acabar la primera pasada'
    );
    expect((await offlineDb.outboxMutations.get(idB))?.status).toBe('synced');
    expect(
      mockedApiClient.mock.calls.map((llamada) => llamada[1]?.idempotencyKey)
    ).toEqual(['k-a', 'k-b']);
  });
});
