/**
 * WU4: Workbox cacheaba la API con un patrón fijo `https://api.guachafit.com/*` que nunca
 * matcheaba la URL configurada en desarrollo (`VITE_API_URL=http://localhost:4001/api/v1`),
 * por lo que el GET offline de rutina jamás se servía desde caché.
 *
 * Este helper deriva el patrón de la configuración real:
 * - URL absoluta → prefijo origen + path (`^http://localhost:4001/api/v1/`).
 * - Path relativo (`/api/v1`) → prefijo de path.
 * - Sin configuración → fallback sobre el path `/api/` de cualquier origen.
 */
import { API_RUNTIME_CACHE_NAME } from './cache-runtime';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * D4: las rutas `/auth/` (login, refresh, `/auth/me`, panel de entrenadores) NUNCA se guardan en la
 * caché runtime: una sesión vencida no debe "revivir" desde Cache Storage ni filtrarse entre
 * usuarios del mismo dispositivo.
 */
const EXCLUIR_AUTH = '(?!auth/)';

export function buildApiCachePattern(apiUrl?: string | null): RegExp {
  const trimmed = (apiUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    // Fallback: `/api/` con versión opcional (`/api/v1/`), sin rutas de auth.
    return /^https?:\/\/[^/]+\/api\/(?!(?:v\d+\/)?auth\/)/;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return new RegExp(`^${escapeRegExp(parsed.origin + path)}/${EXCLUIR_AUTH}`);
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return new RegExp(`${escapeRegExp(path)}/${EXCLUIR_AUTH}`);
}

/**
 * D4: regla `runtimeCaching` de Workbox para la API. `NetworkFirst` con corte a los 4 segundos:
 * con red lenta (gimnasio) se sirve la copia guardada en lugar de dejar la pantalla esperando.
 */
export function construirRuntimeCachingApi(apiUrl?: string | null) {
  return [
    {
      urlPattern: buildApiCachePattern(apiUrl),
      method: 'GET' as const,
      handler: 'NetworkFirst' as const,
      options: {
        cacheName: API_RUNTIME_CACHE_NAME,
        networkTimeoutSeconds: 4,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ];
}
