/**
 * RF-018 P2 · regresión: tiempo límite por petición en el cliente de API.
 *
 * Contratos 1-4:
 * 1. `RequestOptions` acepta `tiempoLimiteMs?: number`.
 * 2. `ErrorTiempoAgotado extends Error` con `message === MENSAJE_TIEMPO_AGOTADO`.
 * 3. `MENSAJE_TIEMPO_AGOTADO` con el texto exacto.
 * 4. Comportamiento: si `fetch` no responde antes del límite se aborta la señal y se lanza
 *    `ErrorTiempoAgotado`; antes del límite responde normal y el temporizador queda limpio (4b);
 *    sin `tiempoLimiteMs` no hay límite; la señal propia abortada por quien llama se propaga
 *    como `AbortError` intacto, también con plazo activo (4e); si vence el plazo con una
 *    renovación de sesión en curso, se rechaza sin duplicar la petición original (4f).
 *
 * El contrato 1 es de tipos (no falsificable en runtime con vitest): su consecuencia observable
 * es el caso «1 y 4a», que pasa `{ tiempoLimiteMs }` y comprueba el vencimiento real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorTiempoAgotado,
  MENSAJE_TIEMPO_AGOTADO,
  apiClient,
  setAuthToken,
  setRefreshToken,
} from './api-client';

const MENSAJE_EXACTO =
  'No pudimos confirmar si se guardó: la conexión tardó demasiado. Recarga antes de volver a intentarlo.';

function respuestaJson(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function crearStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave: string, valor: string) => void datos.set(clave, String(valor)),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', crearStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('api-client: tiempo límite por petición (RF-018 P2)', () => {
  it('2: ErrorTiempoAgotado es un Error con el mensaje de tiempo agotado', () => {
    const error = new ErrorTiempoAgotado();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(MENSAJE_TIEMPO_AGOTADO);
  });

  it('3: MENSAJE_TIEMPO_AGOTADO tiene el texto exacto del contrato', () => {
    expect(MENSAJE_TIEMPO_AGOTADO).toBe(MENSAJE_EXACTO);
  });

  it('1 y 4a: con tiempoLimiteMs, si fetch no responde se aborta la señal y lanza ErrorTiempoAgotado', async () => {
    vi.useFakeTimers();
    let senal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      senal = init?.signal;
      return new Promise<Response>((_resolver, rechazar) => {
        senal?.addEventListener('abort', () =>
          rechazar(new DOMException('The operation was aborted.', 'AbortError'))
        );
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const capturado = apiClient.get('/lento', { tiempoLimiteMs: 1000 }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1000);

    expect(senal?.aborted).toBe(true);
    const error = await capturado;
    expect(error).toBeInstanceOf(ErrorTiempoAgotado);
    expect(error).toMatchObject({ message: MENSAJE_TIEMPO_AGOTADO });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4b (reliability H1): si fetch responde antes del límite, el resultado es normal y no queda temporizador', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => respuestaJson(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/rapido', { tiempoLimiteMs: 1000 })).resolves.toEqual({ ok: true });

    // El `.finally` de `peticion` limpia el temporizador: no queda ningún plazo pendiente.
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4c: sin tiempoLimiteMs no hay límite: una respuesta muy lenta llega igual', async () => {
    vi.useFakeTimers();
    let responder: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolver) => {
            responder = () => resolver(respuestaJson(200, { ok: true }));
          })
      )
    );

    let resultado: unknown = 'pendiente';
    const promesa = apiClient
      .get<{ ok: boolean }>('/lento-sin-limite', { skipAuth: true })
      .then((valor) => {
        resultado = valor;
      });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(resultado).toBe('pendiente');

    responder();
    await promesa;
    expect(resultado).toEqual({ ok: true });
  });

  it('4d: si quien llama aborta su propia señal, el AbortError se propaga intacto', async () => {
    const controlador = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolver, rechazar) => {
            init?.signal?.addEventListener('abort', () =>
              rechazar(new DOMException('The operation was aborted.', 'AbortError'))
            );
          })
      )
    );

    const capturado = apiClient
      .get('/cancelado', { signal: controlador.signal, skipAuth: true })
      .catch((error: unknown) => error);
    controlador.abort();
    const error = await capturado;

    expect((error as Error).name).toBe('AbortError');
    expect(error).not.toBeInstanceOf(ErrorTiempoAgotado);
  });

  it('4e (reliability H2): con plazo activo, abortar la señal externa propaga AbortError y el fetch ve la señal abortada', async () => {
    vi.useFakeTimers();
    const controlador = new AbortController();
    let senalRecibida: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        senalRecibida = init?.signal;
        return new Promise<Response>((_resolver, rechazar) => {
          senalRecibida?.addEventListener('abort', () =>
            rechazar(new DOMException('The operation was aborted.', 'AbortError'))
          );
        });
      })
    );

    const capturado = apiClient
      .get('/cancelado-con-plazo', { signal: controlador.signal, tiempoLimiteMs: 1000 })
      .catch((error: unknown) => error);
    controlador.abort();
    const error = await capturado;

    expect((error as Error).name).toBe('AbortError');
    expect(error).not.toBeInstanceOf(ErrorTiempoAgotado);
    expect(senalRecibida?.aborted).toBe(true);
    // La cancelación externa también limpia el temporizador del plazo.
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('4f (risk H3): al vencer el plazo con un refresco en curso se rechaza ErrorTiempoAgotado y no hay reintento con éxito tardío', async () => {
    vi.useFakeTimers();
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo');

    let liberarRefresco: () => void = () => undefined;
    const refrescoPendiente = new Promise<void>((resolver) => {
      liberarRefresco = resolver;
    });
    const llamadas: Array<{ url: string; abortadaAlLlamar: boolean }> = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const texto = String(url);
      llamadas.push({ url: texto, abortadaAlLlamar: init?.signal?.aborted === true });
      if (texto.includes('/auth/refresh')) {
        return refrescoPendiente.then(() =>
          respuestaJson(200, { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo' })
        );
      }
      if (init?.signal?.aborted) {
        // Un `fetch` real con la señal ya abortada rechaza sin llegar a la red.
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
      return Promise.resolve(respuestaJson(401, { statusCode: 401, message: 'Token expirado' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const capturado = apiClient
      .post(
        '/usuarios/me/password',
        { passwordActual: 'a', passwordNueva: 'bbbbbbbb' },
        { tiempoLimiteMs: 1000 }
      )
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1000);
    const vencimiento = await capturado;
    expect(vencimiento).toBeInstanceOf(ErrorTiempoAgotado);

    // El refresco responde bien DESPUÉS del vencimiento: la promesa ya rechazada no cambia a éxito.
    liberarRefresco();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(await capturado).toBeInstanceOf(ErrorTiempoAgotado);
    expect(llamadas.filter((llamada) => llamada.url.includes('/auth/refresh'))).toHaveLength(1);
    const alEndpoint = llamadas.filter((llamada) => llamada.url.includes('/usuarios/me/password'));
    // La petición original se pidió una sola vez (el reintento, si se intenta, va con la señal abortada).
    expect(alEndpoint.filter((llamada) => !llamada.abortadaAlLlamar)).toHaveLength(1);
    expect(alEndpoint.slice(1).every((llamada) => llamada.abortadaAlLlamar)).toBe(true);
  });
});
