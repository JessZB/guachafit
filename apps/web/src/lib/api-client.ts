import { ProblemDetails } from '@guachafit/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
    message?: string
  ) {
    super(message || problem.detail || problem.title || `HTTP Error ${status}`);
    this.name = 'ApiError';
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('guachafit_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('guachafit_token', token);
  } else {
    localStorage.removeItem('guachafit_token');
  }
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
}

async function apiClientBase<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { idempotent, idempotencyKey, skipAuth, headers = {}, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getAuthToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
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

  const response = await fetch(url, {
    ...rest,
    headers: requestHeaders,
  });

  if (!response.ok) {
    let problem: ProblemDetails;
    try {
      const errorText = await response.text();
      problem = errorText
        ? JSON.parse(errorText)
        : {
            type: 'https://api.guachafit.com/errors/unexpected',
            title: 'Error Inesperado',
            status: response.status,
            detail: response.statusText || 'Error de comunicación con el servidor',
            timestampUtc: new Date().toISOString(),
          };
    } catch {
      problem = {
        type: 'https://api.guachafit.com/errors/unexpected',
        title: 'Error Inesperado',
        status: response.status,
        detail: response.statusText || 'Error de comunicación con el servidor',
        timestampUtc: new Date().toISOString(),
      };
    }
    throw new ApiError(response.status, problem);
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

export const apiClient = Object.assign(apiClientBase, {
  get: <T>(endpoint: string, options: RequestOptions = {}) =>
    apiClientBase<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: any, options: RequestOptions = {}) =>
    apiClientBase<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(endpoint: string, body?: any, options: RequestOptions = {}) =>
    apiClientBase<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string, options: RequestOptions = {}) =>
    apiClientBase<T>(endpoint, { ...options, method: 'DELETE' }),
});
