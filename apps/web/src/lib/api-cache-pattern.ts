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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildApiCachePattern(apiUrl?: string | null): RegExp {
  const trimmed = (apiUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return /^https?:\/\/[^/]+\/api\//;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return new RegExp(`^${escapeRegExp(parsed.origin + path)}/`);
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return new RegExp(`${escapeRegExp(path)}/`);
}
