import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODIGO_CHECKIN_FUERA_DE_PLAZO,
  CODIGO_CHECKIN_YA_REGISTRADO,
  MENSAJE_CHECKIN_FUERA_DE_PLAZO,
  MENSAJE_CHECKIN_YA_REGISTRADO,
  SemaforoNutricional,
  TipoComida,
  type CheckinNutricionalDTO,
} from '@guachafit/shared';
import { apiClient, setAuthToken } from './api-client';
import { processOutboxQueue } from './offline-sync';
import { MENSAJE_REPORTE_CON_OTROS_DATOS } from './nutricion-checkin';
import {
  MAX_FOTOS_CHECKIN_NUTRICIONAL,
  MENSAJE_RANGO_FOTOS_REPORTE,
  discardMutation,
  getRejectedMutations,
  offlineDb,
  queueCheckinNutricionalConFotos,
  queueOfflineMutation,
  type FotoCheckinEnCola,
} from './offline-db';

vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = vi.mocked(apiClient);

const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';
const PRESIGN_ENDPOINT = '/antropometria/presigned-upload-url';
const CHECKIN_ENDPOINT = '/nutricion/checkin-diario';

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

/** Error como el de `ApiError`: estado HTTP y cuerpo del servidor con su `code` estable. */
function httpErrorConCodigo(status: number, message: string, code: string): Error & { status: number } {
  return Object.assign(new Error(message), { status, problem: { statusCode: status, message, code } });
}

/** localStorage en memoria (entorno node): la cola solo se procesa con sesión activa. */
function instalarSesionActiva(): void {
  const datos = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    removeItem: (clave: string) => void datos.delete(clave),
  });
  setAuthToken('token-sesion-activa');
}

function payloadCheckin(): CheckinNutricionalDTO {
  return {
    fecha: '2026-09-22',
    timezoneCliente: 'America/Caracas',
    semaforo: SemaforoNutricional.CUMPLIDO,
    notasAlumno: 'Día de prueba',
  };
}

function fotosDePrueba(cantidad: number): FotoCheckinEnCola[] {
  return Array.from({ length: cantidad }, (_, indice) => ({
    tipoComida: TipoComida.ALMUERZO,
    nombre: `foto-${indice}.webp`,
    contentType: 'image/webp',
    blob: new Blob([`foto-${indice}`], { type: 'image/webp' }),
    storageKey: null,
  }));
}

function respuestaPutOk(): { ok: boolean; status: number } {
  return { ok: true, status: 200 };
}

beforeEach(async () => {
  setNavigatorOnline(true);
  mockedApiClient.mockReset();
  vi.unstubAllGlobals();
  instalarSesionActiva();
  await offlineDb.outboxMutations.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('offline-db: check-in nutricional con fotos en la cola', () => {
  it('persiste payload, blobs y progreso por foto con una descripción humana', async () => {
    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(2), ALUMNO_ID);

    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.tipo).toBe('nutricion-checkin-fotos');
    expect(row?.endpoint).toBe(CHECKIN_ENDPOINT);
    expect(row?.alumnoId).toBe(ALUMNO_ID);
    expect(row?.status).toBe('pending');
    expect(row?.description).toBe('Reporte nutricional con 2 fotos · 2026-09-22');
    expect(row?.idempotencyKey).toBeTruthy();
    expect(row?.fotos).toHaveLength(2);
    expect(row?.fotos?.[0].blob).toBeInstanceOf(Blob);
    expect(await row?.fotos?.[0].blob.text()).toBe('foto-0');
    expect(row?.fotos?.every((foto) => foto.storageKey === null)).toBe(true);
    // El payload del contrato NO lleva fotosPlatos: las claves las compone el sincronizador.
    expect(row?.payload.fotosPlatos).toBeUndefined();
  });

  it('el reporte SIN fotos guarda el alumno dueño (sin cambiar el esquema local)', async () => {
    const id = await queueOfflineMutation(
      CHECKIN_ENDPOINT,
      'POST',
      payloadCheckin(),
      'Reporte nutricional del día',
      undefined,
      { alumnoId: ALUMNO_ID }
    );
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.alumnoId).toBe(ALUMNO_ID);
    expect(row?.tipo).toBeUndefined();
    expect(offlineDb.verno).toBe(2);
  });

  it('rechaza encolar fuera del rango 1–4 fotos (RN-03)', async () => {
    await expect(
      queueCheckinNutricionalConFotos(payloadCheckin(), [], ALUMNO_ID)
    ).rejects.toThrow(MENSAJE_RANGO_FOTOS_REPORTE);
    await expect(
      queueCheckinNutricionalConFotos(
        payloadCheckin(),
        fotosDePrueba(MAX_FOTOS_CHECKIN_NUTRICIONAL + 1),
        ALUMNO_ID
      )
    ).rejects.toThrow(MENSAJE_RANGO_FOTOS_REPORTE);
  });
});

describe('offline-sync: check-in nutricional con fotos', () => {
  it('sube las fotos en orden, postea UNA vez con las claves y purga los blobs al confirmar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaPutOk());
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/2', storageKey: 'comidas/a/2026-09-22/2.webp' })
      .mockResolvedValueOnce(null); // POST del check-in

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(2), ALUMNO_ID);
    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, failed: 0, rejected: 0, skipped: false });
    // 2 presigns (en orden) + 1 POST.
    expect(mockedApiClient).toHaveBeenCalledTimes(3);
    expect(mockedApiClient.mock.calls[0][0]).toBe(PRESIGN_ENDPOINT);
    expect(mockedApiClient.mock.calls[1][0]).toBe(PRESIGN_ENDPOINT);
    expect(mockedApiClient.mock.calls[2][0]).toBe(CHECKIN_ENDPOINT);
    expect(JSON.parse(mockedApiClient.mock.calls[0][1]?.body as string)).toMatchObject({
      modulo: 'comidas',
      alumnoId: ALUMNO_ID,
      mimeType: 'image/webp',
    });

    // PUT de cada blob, en orden, con su contentType.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT');
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>)['Content-Type']).toBe('image/webp');
    expect(await (((fetchMock.mock.calls[0][1] as RequestInit).body as Blob).text())).toBe('foto-0');
    expect(await (((fetchMock.mock.calls[1][1] as RequestInit).body as Blob).text())).toBe('foto-1');

    // POST con el MISMO contrato que el flujo online: payload + claves en orden.
    const cuerpo = JSON.parse(mockedApiClient.mock.calls[2][1]?.body as string);
    expect(cuerpo.fecha).toBe('2026-09-22');
    expect(cuerpo.notasAlumno).toBe('Día de prueba');
    expect(cuerpo.fotosPlatos).toEqual([
      { tipoComida: TipoComida.ALMUERZO, storageKey: 'comidas/a/2026-09-22/1.webp' },
      { tipoComida: TipoComida.ALMUERZO, storageKey: 'comidas/a/2026-09-22/2.webp' },
    ]);
    const row = await offlineDb.outboxMutations.get(id);
    expect(mockedApiClient.mock.calls[2][1]?.idempotencyKey).toBe(row?.idempotencyKey);

    // Éxito: fila `synced` y blobs purgados (la evidencia ya vive en la bóveda).
    expect(row?.status).toBe('synced');
    expect(row?.fotos).toEqual([]);
  });

  it('4xx del servidor → rejected conservando la evidencia y sin reintento automático', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaPutOk());
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockRejectedValueOnce(httpError(409, 'Ya existe un check-in nutricional para hoy.'));

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID);
    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 0, rejected: 1 });
    const rechazadas = await getRejectedMutations();
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].lastError).toContain('Ya existe un check-in');
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.fotos).toHaveLength(1);
    expect(row?.fotos?.[0].blob).toBeInstanceOf(Blob);

    // Una rechazada no se reintenta ni se borra sola.
    await processOutboxQueue();
    expect(mockedApiClient).toHaveBeenCalledTimes(2);
  });

  it('reintento tras fallo de red reanuda: no vuelve a subir las fotos ya subidas', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuestaPutOk())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/2', storageKey: 'comidas/a/2026-09-22/2.webp' });

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(2), ALUMNO_ID);
    const primerIntento = await processOutboxQueue();

    expect(primerIntento).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const trasFallo = await offlineDb.outboxMutations.get(id);
    expect(trasFallo?.status).toBe('failed');
    // Progreso persistido: la primera foto quedó con clave; la segunda sigue pendiente.
    expect(trasFallo?.fotos?.[0].storageKey).toBe('comidas/a/2026-09-22/1.webp');
    expect(trasFallo?.fotos?.[1].storageKey).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockedApiClient).toHaveBeenCalledTimes(2); // 2 presigns, POST nunca llegó

    // Al vencer el backoff, el reintento salta la foto ya subida.
    await offlineDb.outboxMutations.update(id, { nextRetryAt: 0 });
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(respuestaPutOk());
    mockedApiClient.mockClear();
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/2b', storageKey: 'comidas/a/2026-09-22/2.webp' })
      .mockResolvedValueOnce(null); // POST

    const segundoIntento = await processOutboxQueue();

    expect(segundoIntento).toMatchObject({ processed: 1, failed: 0, rejected: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo la foto pendiente
    expect(await (((fetchMock.mock.calls[0][1] as RequestInit).body as Blob).text())).toBe('foto-1');
    expect(mockedApiClient).toHaveBeenCalledTimes(2); // presign de la pendiente + POST
    expect(mockedApiClient.mock.calls[0][0]).toBe(PRESIGN_ENDPOINT);
    expect(mockedApiClient.mock.calls[1][0]).toBe(CHECKIN_ENDPOINT);
    const cuerpo = JSON.parse(mockedApiClient.mock.calls[1][1]?.body as string);
    expect(cuerpo.fotosPlatos).toHaveLength(2);
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('synced');
  });

  it('ventana/día cerrado en el POST → rejected con mensaje claro y evidencia retenida hasta descartar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaPutOk());
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockRejectedValueOnce(
        httpError(
          400,
          "El check-in nutricional solo se habilita entre las 18:00 y las 23:59 (hora local del alumno 'America/Caracas')."
        )
      );

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID);
    await processOutboxQueue();

    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('rejected');
    expect(row?.lastError).toContain('El día ya cerró');
    expect(row?.lastError).toContain('descartarlos');
    expect(row?.fotos).toHaveLength(1); // la evidencia NO se toca en el rechazo

    // El descarte manual elimina la fila completa: con ella, sus blobs.
    await discardMutation(id);
    expect(await offlineDb.outboxMutations.get(id)).toBeUndefined();
  });

  /** El reporte que el servidor ya tiene hoy, con los mismos datos del pendiente `payloadCheckin()`. */
  function reporteServidorIgual(fotos: number) {
    return {
      id: 'checkin-1',
      fecha: '2026-09-22',
      semaforo: SemaforoNutricional.CUMPLIDO,
      aguaLitros: null,
      caloriasReportadas: null,
      proteinaGramosReportada: null,
      notasAlumno: 'Día de prueba',
      fotosPlatos: Array.from({ length: fotos }, () => ({})),
    };
  }

  function errorYaRegistrado() {
    return httpErrorConCodigo(409, MENSAJE_CHECKIN_YA_REGISTRADO, CODIGO_CHECKIN_YA_REGISTRADO);
  }

  it('LOTE API-N1: 409 "ya registrado" y el servidor tiene ESTE reporte → sincronizado y blobs purgados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaPutOk());
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockRejectedValueOnce(errorYaRegistrado())
      .mockResolvedValueOnce(reporteServidorIgual(1));

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID);
    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, failed: 0, rejected: 0 });
    expect(mockedApiClient.mock.calls[2][0]).toBe(
      '/nutricion/checkin/hoy?fecha=2026-09-22&timezoneCliente=America%2FCaracas'
    );
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('synced');
    expect(row?.fotos).toEqual([]);
  });

  it('LOTE API-N1: 409 "ya registrado" con OTROS datos en el servidor → rechazado visible y blobs intactos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaPutOk());
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockRejectedValueOnce(errorYaRegistrado())
      .mockResolvedValueOnce({ ...reporteServidorIgual(0), semaforo: SemaforoNutricional.NO_CUMPLIDO });

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID);
    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, rejected: 1 });
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('rejected');
    expect(row?.lastError).toBe(MENSAJE_REPORTE_CON_OTROS_DATOS);
    expect(row?.motivoRechazo).toBe('reporte-con-otros-datos');
    expect(row?.fotos).toHaveLength(1);
    expect(row?.fotos?.[0].blob).toBeInstanceOf(Blob);
    expect(await getRejectedMutations()).toHaveLength(1);
  });

  it('LOTE API-N1: 409 "ya registrado" y la consulta falla por red → reintentable (failed), ni synced ni rechazado', async () => {
    const id = await queueOfflineMutation(
      CHECKIN_ENDPOINT,
      'POST',
      payloadCheckin(),
      'Reporte nutricional del día',
      undefined,
      { alumnoId: ALUMNO_ID }
    );
    mockedApiClient
      .mockRejectedValueOnce(errorYaRegistrado())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('failed');
    expect(row?.nextRetryAt).toBeGreaterThan(0);
    expect(row?.motivoRechazo ?? null).toBeNull();
  });

  it('LOTE API-N1: 409 "ya registrado" y la consulta responde 5xx → reintentable y conserva las fotos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaPutOk());
    vi.stubGlobal('fetch', fetchMock);
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockRejectedValueOnce(errorYaRegistrado())
      .mockRejectedValueOnce(httpError(503, 'Servicio no disponible'));

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID);
    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 1, rejected: 0 });
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('failed');
    expect(row?.fallosServidor).toBe(1);
    expect(row?.fotos).toHaveLength(1);
    expect(row?.fotos?.[0].blob).toBeInstanceOf(Blob);
  });

  it('LOTE API-N1: 409 "ya registrado" y el servidor responde sin reporte (204) → rechazado visible', async () => {
    const id = await queueOfflineMutation(
      CHECKIN_ENDPOINT,
      'POST',
      payloadCheckin(),
      'Reporte nutricional del día',
      undefined,
      { alumnoId: ALUMNO_ID }
    );
    mockedApiClient.mockRejectedValueOnce(errorYaRegistrado()).mockResolvedValueOnce(null);

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, rejected: 1 });
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('rejected');
    expect(row?.lastError).toBe(MENSAJE_REPORTE_CON_OTROS_DATOS);
    expect(row?.motivoRechazo).toBe('reporte-con-otros-datos');
  });

  it('LOTE API-N1: 409 "ya registrado" sin fotos y con los mismos datos → sincronizado', async () => {
    const id = await queueOfflineMutation(
      CHECKIN_ENDPOINT,
      'POST',
      payloadCheckin(),
      'Reporte nutricional del día',
      undefined,
      { alumnoId: ALUMNO_ID }
    );
    mockedApiClient
      .mockRejectedValueOnce(errorYaRegistrado())
      .mockResolvedValueOnce(reporteServidorIgual(0));

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, failed: 0, rejected: 0 });
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('synced');
  });

  it('LOTE API-N1: un 409 con el mismo código en otro endpoint sigue siendo un rechazo visible', async () => {
    const id = await queueOfflineMutation('/sesiones/s1/finalizar', 'POST', {}, 'Finalizar', 'key-x');
    mockedApiClient.mockRejectedValueOnce(errorYaRegistrado());

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, rejected: 1 });
    expect((await offlineDb.outboxMutations.get(id))?.status).toBe('rejected');
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
  });

  it('las mutaciones sin fotos conservan el flujo existente (JSON directo, sin fetch a la bóveda)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await queueOfflineMutation('/sesiones/s1/series', 'PUT', { series: [1] }, 'Sync serie', 'key-plana');
    mockedApiClient.mockResolvedValueOnce(null);

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 1, failed: 0, rejected: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(mockedApiClient.mock.calls[0][1]?.body as string)).toEqual({ series: [1] });
    expect(mockedApiClient.mock.calls[0][1]?.idempotencyKey).toBe('key-plana');
  });
});

describe('LOTE API-N2: captura offline tardía en la cola', () => {
  // El alumno tocó Guardar a las 22:00 de Caracas; la cola envía 12 h después. El reloj del
  // teléfono solo se usa para medir cuánto tiempo pasó, nunca como hora absoluta.
  const CAPTURA_MS = Date.parse('2026-09-23T02:00:00.000Z');
  const ENVIO_MS = CAPTURA_MS + 12 * 3_600_000;

  function errorFueraDePlazo() {
    return httpErrorConCodigo(400, 'Texto del servidor', CODIGO_CHECKIN_FUERA_DE_PLAZO);
  }

  function cuerpoEnviado(indiceLlamada: number) {
    return JSON.parse(mockedApiClient.mock.calls[indiceLlamada][1]?.body as string);
  }

  it('sin fotos: al enviar calcula los segundos transcurridos desde que se tocó Guardar', async () => {
    await queueOfflineMutation(CHECKIN_ENDPOINT, 'POST', payloadCheckin(), 'Reporte', undefined, {
      alumnoId: ALUMNO_ID,
      capturadoEnMs: CAPTURA_MS,
    });
    mockedApiClient.mockResolvedValueOnce(null);
    vi.spyOn(Date, 'now').mockReturnValue(ENVIO_MS);

    await processOutboxQueue();

    expect(cuerpoEnviado(0)).toEqual({ ...payloadCheckin(), segundosDesdeCaptura: 43_200 });
  });

  it('con fotos: los segundos se calculan al enviar el reporte, después de subir las fotos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaPutOk()));
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockResolvedValueOnce(null);
    await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID, CAPTURA_MS);
    vi.spyOn(Date, 'now').mockReturnValue(ENVIO_MS);

    await processOutboxQueue();

    const cuerpo = cuerpoEnviado(1);
    expect(cuerpo.segundosDesdeCaptura).toBe(43_200);
    expect(cuerpo.fotosPlatos).toHaveLength(1);
    expect(cuerpo).not.toHaveProperty('capturadoEnUtc');
  });

  it('un pendiente del formato anterior (`capturadoEnUtc` en el payload) se envía en segundos', async () => {
    await queueOfflineMutation(
      CHECKIN_ENDPOINT,
      'POST',
      { ...payloadCheckin(), capturadoEnUtc: new Date(CAPTURA_MS).toISOString() },
      'Reporte',
      undefined,
      { alumnoId: ALUMNO_ID }
    );
    mockedApiClient.mockResolvedValueOnce(null);
    vi.spyOn(Date, 'now').mockReturnValue(ENVIO_MS);

    await processOutboxQueue();

    expect(cuerpoEnviado(0)).toEqual({ ...payloadCheckin(), segundosDesdeCaptura: 43_200 });
  });

  it('sin fotos: 400 CHECKIN_FUERA_DE_PLAZO → rechazo definitivo visible con el texto acordado, sin reintento', async () => {
    const id = await queueOfflineMutation(CHECKIN_ENDPOINT, 'POST', payloadCheckin(), 'Reporte', undefined, {
      alumnoId: ALUMNO_ID,
      capturadoEnMs: CAPTURA_MS,
    });
    mockedApiClient.mockRejectedValueOnce(errorFueraDePlazo());

    const result = await processOutboxQueue();

    expect(result).toMatchObject({ processed: 0, failed: 0, rejected: 1 });
    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('rejected');
    expect(row?.lastError).toBe(MENSAJE_CHECKIN_FUERA_DE_PLAZO);

    await processOutboxQueue();
    expect(mockedApiClient).toHaveBeenCalledTimes(1);
  });

  it('con fotos: 400 CHECKIN_FUERA_DE_PLAZO → rechazo con el texto acordado (no el de ventana) y evidencia retenida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaPutOk()));
    mockedApiClient
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.test/put/1', storageKey: 'comidas/a/2026-09-22/1.webp' })
      .mockRejectedValueOnce(errorFueraDePlazo());

    const id = await queueCheckinNutricionalConFotos(payloadCheckin(), fotosDePrueba(1), ALUMNO_ID, CAPTURA_MS);
    await processOutboxQueue();

    const row = await offlineDb.outboxMutations.get(id);
    expect(row?.status).toBe('rejected');
    expect(row?.lastError).toBe(MENSAJE_CHECKIN_FUERA_DE_PLAZO);
    expect(row?.fotos).toHaveLength(1);
  });

  it('las mutaciones que no son el reporte diario no reciben el campo', async () => {
    await queueOfflineMutation('/sesiones/s1/series', 'PUT', { series: [1] }, 'Sync serie', 'key-x', {
      capturadoEnMs: CAPTURA_MS,
    });
    mockedApiClient.mockResolvedValueOnce(null);

    await processOutboxQueue();

    expect(cuerpoEnviado(0)).toEqual({ series: [1] });
  });
});
