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

interface RequestOptions extends RequestInit {
  idempotent?: boolean;
  idempotencyKey?: string;
  skipAuth?: boolean;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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

  // Inject idempotency key for financial or declared mutations
  const isFinancialMutation =
    (options.method === 'POST' || options.method === 'PATCH') &&
    (endpoint.includes('/finanzas/') || idempotent);

  if (isFinancialMutation) {
    requestHeaders['X-Idempotency-Key'] = idempotencyKey || generateIdempotencyKey();
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

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
