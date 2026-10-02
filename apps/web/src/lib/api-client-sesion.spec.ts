import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  ErrorDeConexion,
  apiClient,
  getAuthToken,
  getRefreshToken,
  registrarManejadorSesionExpirada,
  setAuthToken,
  setRefreshToken,
} from './api-client';
import {
  MENSAJE_CREDENCIALES_INCORRECTAS,
  MENSAJE_ERROR_GENERICO,
  MENSAJE_SESION_VENCIDA,
  MENSAJE_SIN_CONEXION,
} from './mensajes-error';

function crearStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave: string, valor: string) => void datos.set(clave, String(valor)),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

function respuestaJson(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Manejador = (url: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetchCon(manejador: Manejador) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    manejador(String(url), init)
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function llamadasA(fetchMock: ReturnType<typeof stubFetchCon>, fragmento: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(fragmento));
}

function headersDe(init?: RequestInit): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

let manejadorSesion: ReturnType<typeof vi.fn<(mensaje: string) => void>>;

beforeEach(() => {
  vi.stubGlobal('localStorage', crearStorage());
  manejadorSesion = vi.fn<(mensaje: string) => void>();
  registrarManejadorSesionExpirada(manejadorSesion);
});

afterEach(() => {
  registrarManejadorSesionExpirada(null);
  vi.unstubAllGlobals();
});

describe('api-client: renovación de sesión ante 401 (A1)', () => {
  it('guarda y lee el refresh token en almacenamiento local', () => {
    setRefreshToken('refresh-1234567890');
    expect(getRefreshToken()).toBe('refresh-1234567890');
    setRefreshToken(null);
    expect(getRefreshToken()).toBeNull();
  });

  it('renueva una vez con /auth/refresh y reintenta la petición original con el token nuevo', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    const fetchMock = stubFetchCon((url, init) => {
      if (url.includes('/auth/refresh')) {
        return respuestaJson(200, { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo-123' });
      }
      const auth = headersDe(init)['Authorization'];
      return auth === 'Bearer access-nuevo'
        ? respuestaJson(200, { ok: true })
        : respuestaJson(401, { statusCode: 401, message: 'Token inválido o expirado: jwt expired' });
    });

    const resultado = await apiClient.get<{ ok: boolean }>('/alumnos');

    expect(resultado).toEqual({ ok: true });
    expect(llamadasA(fetchMock, '/auth/refresh')).toHaveLength(1);
    const cuerpoRefresh = JSON.parse(String(llamadasA(fetchMock, '/auth/refresh')[0][1]?.body));
    expect(cuerpoRefresh).toEqual({ refreshToken: 'refresh-viejo-123' });
    expect(getAuthToken()).toBe('access-nuevo');
    expect(getRefreshToken()).toBe('refresh-nuevo-123');
    expect(manejadorSesion).not.toHaveBeenCalled();
  });

  it('deduplica refrescos concurrentes en una sola llamada', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    let liberarRefresh: () => void = () => undefined;
    const refreshPendiente = new Promise<void>((resolve) => {
      liberarRefresh = resolve;
    });

    const fetchMock = stubFetchCon(async (url, init) => {
      if (url.includes('/auth/refresh')) {
        await refreshPendiente;
        return respuestaJson(200, { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo-123' });
      }
      return headersDe(init)['Authorization'] === 'Bearer access-nuevo'
        ? respuestaJson(200, { ok: true })
        : respuestaJson(401, { statusCode: 401, message: 'Unauthorized' });
    });

    const peticiones = Promise.all([
      apiClient.get('/alumnos'),
      apiClient.get('/entrenador/perfil'),
      apiClient.get('/auth/me'),
    ]);
    // Deja que las tres peticiones reciban su 401 antes de liberar el refresco.
    await new Promise((resolve) => setTimeout(resolve, 0));
    liberarRefresh();
    await peticiones;

    expect(llamadasA(fetchMock, '/auth/refresh')).toHaveLength(1);
  });

  it('si se cierra la sesión con el refresco en vuelo, descarta los tokens nuevos sin otro cierre', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    let liberarRefresh: () => void = () => undefined;
    const refreshPendiente = new Promise<void>((resolve) => {
      liberarRefresh = resolve;
    });

    const fetchMock = stubFetchCon(async (url) => {
      if (url.includes('/auth/refresh')) {
        await refreshPendiente;
        return respuestaJson(200, { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo-123' });
      }
      return respuestaJson(401, { statusCode: 401, message: 'Unauthorized' });
    });

    const promesa = apiClient.get('/alumnos');
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Cierre de sesión (logout o vencimiento) mientras el refresco viaja.
    setAuthToken(null);
    setRefreshToken(null);
    liberarRefresh();

    await expect(promesa).rejects.toMatchObject({ status: 401, message: MENSAJE_SESION_VENCIDA });
    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(llamadasA(fetchMock, '/alumnos')).toHaveLength(1);
    expect(manejadorSesion).not.toHaveBeenCalled();
  });

  it('conserva la X-Idempotency-Key generada al reintentar una mutación', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    const fetchMock = stubFetchCon((url, init) => {
      if (url.includes('/auth/refresh')) {
        return respuestaJson(200, { accessToken: 'access-nuevo', refreshToken: 'refresh-nuevo-123' });
      }
      return headersDe(init)['Authorization'] === 'Bearer access-nuevo'
        ? respuestaJson(200, { ok: true })
        : respuestaJson(401, { statusCode: 401, message: 'Unauthorized' });
    });

    await apiClient.post('/finanzas/pagos', { monto: '10.00' });

    const pagos = llamadasA(fetchMock, '/finanzas/pagos');
    expect(pagos).toHaveLength(2);
    const primera = headersDe(pagos[0][1])['X-Idempotency-Key'];
    expect(primera).toBeTruthy();
    expect(headersDe(pagos[1][1])['X-Idempotency-Key']).toBe(primera);
  });

  it('si el refresco es rechazado, cierra la sesión con el aviso de sesión vencida', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    stubFetchCon((url) =>
      url.includes('/auth/refresh')
        ? respuestaJson(401, { statusCode: 401, message: 'Refresh token expirado o inválido.' })
        : respuestaJson(401, { statusCode: 401, message: 'Unauthorized' })
    );

    const promesa = apiClient.get('/alumnos');
    await expect(promesa).rejects.toBeInstanceOf(ApiError);
    await expect(promesa).rejects.toMatchObject({ status: 401, message: MENSAJE_SESION_VENCIDA });
    expect(manejadorSesion).toHaveBeenCalledTimes(1);
    expect(manejadorSesion).toHaveBeenCalledWith(MENSAJE_SESION_VENCIDA);
  });

  it('si el refresco es rechazado con un mensaje amigable (cascada), lo usa como aviso', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');
    const cascada =
      'Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.';

    stubFetchCon((url) =>
      url.includes('/auth/refresh')
        ? respuestaJson(401, { statusCode: 401, message: cascada })
        : respuestaJson(401, { statusCode: 401, message: 'Unauthorized' })
    );

    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ message: cascada });
    expect(manejadorSesion).toHaveBeenCalledWith(cascada);
  });

  it('sin refresh token guardado (sesión anterior a la renovación) cierra la sesión', async () => {
    setAuthToken('access-viejo');

    const fetchMock = stubFetchCon(() =>
      respuestaJson(401, { statusCode: 401, message: 'Unauthorized' })
    );

    await expect(apiClient.get('/alumnos')).rejects.toMatchObject({ status: 401 });
    expect(llamadasA(fetchMock, '/auth/refresh')).toHaveLength(0);
    expect(manejadorSesion).toHaveBeenCalledWith(MENSAJE_SESION_VENCIDA);
  });

  it('sin red durante el refresco NO cierra la sesión (modo offline)', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    stubFetchCon((url) => {
      if (url.includes('/auth/refresh')) throw new TypeError('Failed to fetch');
      return respuestaJson(401, { statusCode: 401, message: 'Unauthorized' });
    });

    await expect(apiClient.get('/alumnos')).rejects.toBeInstanceOf(ErrorDeConexion);
    expect(manejadorSesion).not.toHaveBeenCalled();
    expect(getAuthToken()).toBe('access-viejo');
  });

  it('un error temporal del servidor al refrescar NO cierra la sesión', async () => {
    setAuthToken('access-viejo');
    setRefreshToken('refresh-viejo-123');

    stubFetchCon((url) =>
      url.includes('/auth/refresh')
        ? respuestaJson(503, { statusCode: 503, message: 'Service Unavailable' })
        : respuestaJson(401, { statusCode: 401, message: 'Unauthorized' })
    );

    await expect(apiClient.get('/alumnos')).rejects.toMatchObject({ status: 401 });
    expect(manejadorSesion).not.toHaveBeenCalled();
  });

  it('no intenta renovar en el login ni en peticiones sin sesión', async () => {
    const fetchMock = stubFetchCon(() =>
      respuestaJson(401, { statusCode: 401, message: 'Credenciales inválidas.' })
    );

    await expect(
      apiClient('/auth/login', { method: 'POST', body: '{}', skipAuth: true })
    ).rejects.toMatchObject({ status: 401, message: 'Credenciales inválidas.' });
    expect(llamadasA(fetchMock, '/auth/refresh')).toHaveLength(0);
    expect(manejadorSesion).not.toHaveBeenCalled();
  });

  it('no renueva ni cierra la sesión de demostración', async () => {
    setAuthToken('mock_jwt_token_entrenador_123');
    const fetchMock = stubFetchCon(() =>
      respuestaJson(401, { statusCode: 401, message: 'Unauthorized' })
    );

    await expect(apiClient.get('/alumnos')).rejects.toMatchObject({ status: 401 });
    expect(llamadasA(fetchMock, '/auth/refresh')).toHaveLength(0);
    expect(manejadorSesion).not.toHaveBeenCalled();
  });
});

describe('api-client: traducción centralizada de errores (B1-B5, B9)', () => {
  it('un fallo de red (TypeError de fetch) se convierte en el aviso de sin conexión', async () => {
    stubFetchCon(() => {
      throw new TypeError('Failed to fetch');
    });

    const promesa = apiClient.get('/alumnos', { skipAuth: true });
    await expect(promesa).rejects.toBeInstanceOf(ErrorDeConexion);
    await expect(promesa).rejects.toMatchObject({ message: MENSAJE_SIN_CONEXION });
  });

  it('una cancelación (AbortError) se propaga intacta', async () => {
    stubFetchCon(() => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    await expect(apiClient.get('/alumnos', { skipAuth: true })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('el login muestra el mensaje genérico de credenciales si el servidor no es amigable', async () => {
    stubFetchCon(() => respuestaJson(401, { statusCode: 401, message: 'Unauthorized' }));

    await expect(
      apiClient('/auth/login', { method: 'POST', body: '{}', skipAuth: true })
    ).rejects.toMatchObject({ message: MENSAJE_CREDENCIALES_INCORRECTAS });
  });

  it('un cuerpo de error que no es JSON se traduce al mensaje genérico', async () => {
    stubFetchCon(
      () => new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })
    );

    await expect(apiClient.get('/alumnos', { skipAuth: true })).rejects.toMatchObject({
      status: 502,
      message: MENSAJE_ERROR_GENERICO,
    });
  });

  it('conserva el texto original del servidor en mensajeServidor', async () => {
    stubFetchCon(() =>
      respuestaJson(409, { statusCode: 409, message: 'Este correo ya se encuentra registrado.' })
    );

    await expect(
      apiClient('/alumnos/registro-publico', { method: 'POST', body: '{}', skipAuth: true })
    ).rejects.toMatchObject({
      status: 409,
      message: 'Este correo ya se encuentra registrado.',
      mensajeServidor: 'Este correo ya se encuentra registrado.',
    });
  });
});
