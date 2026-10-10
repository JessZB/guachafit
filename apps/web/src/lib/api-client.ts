import { ProblemDetails } from '@guachafit/shared';
import {
  extraerMensajeServidor,
  esMensajeAmigable,
  MENSAJE_ERROR_GENERICO,
  MENSAJE_SESION_VENCIDA,
  MENSAJE_SIN_CONEXION,
  traducirErrorHttp,
  type ContextoErrorHttp,
} from './mensajes-error';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const ACCESS_TOKEN_KEY = 'guachafit_token';
const REFRESH_TOKEN_KEY = 'guachafit_refresh_token';

/** Prefijo de los tokens ficticios del modo demo: nunca se renuevan ni cierran sesión. */
export const DEMO_TOKEN_PREFIX = 'mock_jwt_token_';

export class ApiError extends Error {
  /** Texto original del servidor (`detail`/`message`), sin traducir. `null` si no había. */
  public readonly mensajeServidor: string | null;

  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
    message?: string
  ) {
    const mensajeServidor = extraerMensajeServidor(problem);
    super(message || traducirErrorHttp(status, mensajeServidor, 'general'));
    this.name = 'ApiError';
    this.mensajeServidor = mensajeServidor;
  }
}

/**
 * Fallo de red (sin conexión, DNS, CORS caído): `fetch` lanza `TypeError`. Se conserva como
 * `TypeError` para no alterar a quien ya distingue errores de red, pero con un mensaje humano.
 */
export class ErrorDeConexion extends TypeError {
  constructor(public readonly causa?: unknown) {
    super(MENSAJE_SIN_CONEXION);
    this.name = 'ErrorDeConexion';
  }
}

export const MENSAJE_TIEMPO_AGOTADO =
  'No pudimos confirmar si se guardó: la conexión tardó demasiado. Recarga antes de volver a intentarlo.';

/**
 * RF-018: la petición superó `tiempoLimiteMs` y se canceló. El servidor pudo haberla procesado,
 * por eso el mensaje no dice "no se guardó" sino que pide recargar antes de repetir.
 */
export class ErrorTiempoAgotado extends Error {
  constructor() {
    super(MENSAJE_TIEMPO_AGOTADO);
    this.name = 'ErrorTiempoAgotado';
  }
}

function leerStorage(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirStorage(clave: string, valor: string | null): void {
  try {
    if (valor) {
      localStorage.setItem(clave, valor);
    } else {
      localStorage.removeItem(clave);
    }
  } catch {
    // Almacenamiento bloqueado (modo privado): la sesión vive solo en memoria de la pestaña.
  }
}

export function getAuthToken(): string | null {
  return leerStorage(ACCESS_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  escribirStorage(ACCESS_TOKEN_KEY, token);
}

export function getRefreshToken(): string | null {
  return leerStorage(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null): void {
  escribirStorage(REFRESH_TOKEN_KEY, token);
}

export function esTokenDemo(token: string | null | undefined): boolean {
  return !!token && token.startsWith(DEMO_TOKEN_PREFIX);
}

// ---------------------------------------------------------------------------
// Sesión vencida (A1): el AuthProvider registra cómo cerrar la sesión.
// ---------------------------------------------------------------------------

type ManejadorSesionExpirada = (mensaje: string) => void;
let manejadorSesionExpirada: ManejadorSesionExpirada | null = null;

export function registrarManejadorSesionExpirada(manejador: ManejadorSesionExpirada | null): void {
  manejadorSesionExpirada = manejador;
}

function notificarSesionExpirada(mensaje: string): void {
  try {
    manejadorSesionExpirada?.(mensaje);
  } catch (error) {
    console.warn('[apiClient] Falló el cierre de sesión por vencimiento:', error);
  }
}

type ResultadoRefresco =
  | { ok: true }
  | { ok: false; motivo: 'sin_conexion' }
  | { ok: false; motivo: 'rechazado'; mensaje: string }
  | { ok: false; motivo: 'temporal' }
  | { ok: false; motivo: 'descartado' };

let refrescoEnCurso: Promise<ResultadoRefresco> | null = null;

async function ejecutarRefresco(): Promise<ResultadoRefresco> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { ok: false, motivo: 'rechazado', mensaje: MENSAJE_SESION_VENCIDA };
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(resolverUrlApi('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return { ok: false, motivo: 'sin_conexion' };
  }

  const cuerpo = await leerCuerpoJson(respuesta);

  if (respuesta.status === 401 || respuesta.status === 403) {
    // Mientras el refresco viajaba, otra pestaña (o un cambio de contraseña, RF-018 RN-08) guardó
    // tokens nuevos: el rechazo es del refresh token viejo y no debe cerrar la sesión vigente.
    if (getRefreshToken() !== refreshToken) {
      return { ok: false, motivo: 'descartado' };
    }
    const mensajeServidor = extraerMensajeServidor(cuerpo.datos);
    return {
      ok: false,
      motivo: 'rechazado',
      mensaje: esMensajeAmigable(mensajeServidor) ? mensajeServidor.trim() : MENSAJE_SESION_VENCIDA,
    };
  }

  const tokens = cuerpo.datos as { accessToken?: unknown; refreshToken?: unknown } | null;
  if (!respuesta.ok || !tokens || typeof tokens.accessToken !== 'string') {
    return { ok: false, motivo: 'temporal' };
  }

  // Carrera con el cierre de sesión: si mientras el refresco viajaba se cerró la sesión (o la
  // cambió otra), el refresh token guardado ya no es el enviado y la respuesta se descarta.
  if (getRefreshToken() !== refreshToken) {
    return { ok: false, motivo: 'descartado' };
  }

  setAuthToken(tokens.accessToken);
  if (typeof tokens.refreshToken === 'string') {
    setRefreshToken(tokens.refreshToken);
  }
  return { ok: true };
}

/**
 * Renueva la sesión con `POST /auth/refresh`. Las llamadas concurrentes comparten la MISMA
 * promesa: N peticiones con 401 simultáneo producen un único refresco.
 */
export function refrescarSesion(): Promise<ResultadoRefresco> {
  if (!refrescoEnCurso) {
    refrescoEnCurso = ejecutarRefresco().finally(() => {
      refrescoEnCurso = null;
    });
  }
  return refrescoEnCurso;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * U4: URL absoluta que `fetch` usa para un endpoint (misma construcción que `apiClientBase`).
 * La UI de frescura la necesita para consultar en Cache Storage la copia guardada por el SW.
 */
export function resolverUrlApi(endpoint: string): string {
  return endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

export interface RequestOptions extends RequestInit {
  idempotent?: boolean;
  idempotencyKey?: string;
  skipAuth?: boolean;
  /** Uso interno: la petición ya se reintentó tras renovar la sesión (solo un reintento). */
  reintentoTrasRefresco?: boolean;
  /**
   * Límite total de la operación (incluye una renovación de sesión y su reintento). Al vencer se
   * cancela el `fetch` y se lanza `ErrorTiempoAgotado`. Sin valor no hay límite.
   */
  tiempoLimiteMs?: number;
}

async function leerCuerpoJson(response: Response): Promise<{ esJson: boolean; datos: unknown }> {
  try {
    const texto = await response.text();
    if (!texto) return { esJson: false, datos: null };
    return { esJson: true, datos: JSON.parse(texto) };
  } catch {
    return { esJson: false, datos: null };
  }
}

function contextoDeError(endpoint: string, skipAuth?: boolean): ContextoErrorHttp {
  if (/\/auth\/login(\?|$)/.test(endpoint)) return 'login';
  return skipAuth ? 'publico' : 'general';
}

async function apiClientBase<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const {
    idempotent,
    idempotencyKey,
    skipAuth,
    reintentoTrasRefresco,
    headers = {},
    ...rest
  } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  const tokenEnviado = skipAuth ? null : getAuthToken();
  if (tokenEnviado) {
    requestHeaders['Authorization'] = `Bearer ${tokenEnviado}`;
  }

  // WU4: idempotencia en mutaciones financieras, de sesiones (RF-001 offline) y declaradas.
  // La cola offline pasa la key persistida para reutilizarla en cada reintento.
  const isFinancialMutation =
    (options.method === 'POST' || options.method === 'PATCH') &&
    (endpoint.includes('/finanzas/') || idempotent);
  const isSessionMutation =
    (options.method === 'POST' ||
      options.method === 'PUT' ||
      options.method === 'PATCH' ||
      options.method === 'DELETE') &&
    endpoint.includes('/sesiones/');

  if (isFinancialMutation || isSessionMutation) {
    requestHeaders['X-Idempotency-Key'] = idempotencyKey || generateIdempotencyKey();
  }

  const url = resolverUrlApi(endpoint);

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: requestHeaders,
    });
  } catch (error) {
    // B1: `fetch` lanza TypeError sin red; una cancelación (AbortError) se propaga intacta.
    if (error instanceof TypeError) throw new ErrorDeConexion(error);
    throw error;
  }

  if (!response.ok) {
    const cuerpo = await leerCuerpoJson(response);
    const problem: ProblemDetails =
      cuerpo.esJson && cuerpo.datos && typeof cuerpo.datos === 'object'
        ? (cuerpo.datos as ProblemDetails)
        : {
            type: 'https://api.guachafit.com/errors/unexpected',
            title: 'Error Inesperado',
            status: response.status,
            detail: response.statusText || 'Error de comunicación con el servidor',
            timestampUtc: new Date().toISOString(),
          };

    const mensajeServidor = cuerpo.esJson ? extraerMensajeServidor(cuerpo.datos) : null;
    const mensaje = traducirErrorHttp(
      response.status,
      mensajeServidor,
      contextoDeError(endpoint, skipAuth)
    );

    // A1: 401 con sesión real → un único intento de renovación y reintento.
    if (response.status === 401 && tokenEnviado && !esTokenDemo(tokenEnviado)) {
      if (!reintentoTrasRefresco) {
        const reintentar = () =>
          apiClientBase<T>(endpoint, {
            ...options,
            idempotencyKey: requestHeaders['X-Idempotency-Key'] ?? idempotencyKey,
            reintentoTrasRefresco: true,
          });

        // Otra petición ya renovó la sesión mientras esta viajaba: basta con reintentar.
        const tokenActual = getAuthToken();
        if (tokenActual && tokenActual !== tokenEnviado) return reintentar();

        const resultado = await refrescarSesion();
        if (resultado.ok) return reintentar();
        if (resultado.motivo === 'sin_conexion') throw new ErrorDeConexion();
        if (resultado.motivo === 'rechazado') {
          notificarSesionExpirada(resultado.mensaje);
          throw new ApiError(response.status, problem, resultado.mensaje);
        }
        // Los tokens cambiaron durante el refresco: con una sesión vigente se reintenta con ella;
        // si la sesión se cerró, no se renueva ni se fuerza otro cierre.
        if (resultado.motivo === 'descartado') {
          const tokenVigente = getAuthToken();
          if (tokenVigente && tokenVigente !== tokenEnviado) return reintentar();
          throw new ApiError(response.status, problem, MENSAJE_SESION_VENCIDA);
        }
        // Fallo temporal del servidor al renovar: no se cierra la sesión.
        throw new ApiError(response.status, problem, MENSAJE_ERROR_GENERICO);
      }

      // Ya se renovó y el servidor sigue rechazando: la cuenta dejó de tener acceso.
      notificarSesionExpirada(mensaje);
    }

    throw new ApiError(response.status, problem, mensaje);
  }

  // Si la respuesta es 204 No Content o no tiene cuerpo
  if (response.status === 204) {
    return null as unknown as T;
  }

  const text = await response.text();
  if (!text || text.trim() === '') {
    return null as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.warn('[apiClient] Advertencia al deserializar JSON de respuesta:', error);
    return null as unknown as T;
  }
}

/**
 * RF-018: aplica `tiempoLimiteMs` sobre toda la operación. La señal de quien llama se encadena:
 * si la aborta, se propaga su `AbortError` intacto; solo el vencimiento del plazo lanza
 * `ErrorTiempoAgotado` (se rechaza al vencer, aunque una renovación de sesión siga en curso).
 */
function peticion<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { tiempoLimiteMs, signal: senalExterna, ...resto } = options;
  if (!tiempoLimiteMs || tiempoLimiteMs <= 0) {
    return apiClientBase<T>(endpoint, { ...resto, signal: senalExterna });
  }

  const controlador = new AbortController();
  const alAbortarExterna = () => controlador.abort(senalExterna?.reason);
  if (senalExterna?.aborted) alAbortarExterna();
  else senalExterna?.addEventListener('abort', alAbortarExterna, { once: true });

  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(() => {
      rechazar(new ErrorTiempoAgotado());
      controlador.abort();
    }, tiempoLimiteMs);
    apiClientBase<T>(endpoint, { ...resto, signal: controlador.signal })
      .then(resolver, rechazar)
      .finally(() => {
        clearTimeout(temporizador);
        senalExterna?.removeEventListener('abort', alAbortarExterna);
      });
  });
}

export const apiClient = Object.assign(peticion, {
  get: <T>(endpoint: string, options: RequestOptions = {}) =>
    peticion<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: any, options: RequestOptions = {}) =>
    peticion<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(endpoint: string, body?: any, options: RequestOptions = {}) =>
    peticion<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(endpoint: string, body?: any, options: RequestOptions = {}) =>
    peticion<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string, options: RequestOptions = {}) =>
    peticion<T>(endpoint, { ...options, method: 'DELETE' }),
});
