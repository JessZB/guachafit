/**
 * Ola 4 · U4 — frescura honesta de datos servidos por el Service Worker.
 *
 * Los GET de API pasan por la estrategia `NetworkFirst` (`api-cache` en `vite.config.ts`).
 * Sin conexión, el Service Worker devuelve la última copia cacheada sin avisar de su edad.
 * Este módulo la data usando el header `date` de la respuesta original.
 *
 * La parte pura (`evaluarFrescuraDeRespuesta`, `formatearEdadFrescura`) se testea en Node;
 * el acceso a Cache Storage (`consultarFrescuraDeCache`) es defensivo: si el navegador no
 * lo soporta, o la URL no está cacheada, devuelve `null` (nunca lanza).
 */

export interface FrescuraCache {
  /** Fecha UTC original de la respuesta cacheada (header `date`). */
  fechaUtc: string;
  /** Minutos transcurridos desde esa fecha hasta "ahora" (0 si es futura). */
  edadMinutos: number;
}

/** Fecha original de una respuesta 2xx; `null` si no es cacheable o no trae fecha válida. */
export function fechaDesdeRespuesta(
  respuesta: Pick<Response, 'ok' | 'headers'>
): string | null {
  if (!respuesta.ok) return null;
  const fecha = respuesta.headers.get('date');
  if (!fecha || Number.isNaN(Date.parse(fecha))) return null;
  return fecha;
}

/** Edad en minutos enteros desde una fecha ISO/HTTP; `null` si la fecha es inválida. */
export function edadEnMinutos(fechaUtc: string, ahora: number = Date.now()): number | null {
  const milisegundos = Date.parse(fechaUtc);
  if (Number.isNaN(milisegundos)) return null;
  return Math.max(0, Math.floor((ahora - milisegundos) / 60_000));
}

/**
 * Frescura de una respuesta cacheada: `{ fechaUtc, edadMinutos }` o `null` cuando no se puede
 * afirmar la edad (sin header `date`, respuesta no 2xx o fecha inválida).
 */
export function evaluarFrescuraDeRespuesta(
  respuesta: Pick<Response, 'ok' | 'headers'>,
  ahora: number = Date.now()
): FrescuraCache | null {
  const fechaUtc = fechaDesdeRespuesta(respuesta);
  if (!fechaUtc) return null;
  const edad = edadEnMinutos(fechaUtc, ahora);
  if (edad === null) return null;
  return { fechaUtc, edadMinutos: edad };
}

/** Texto humano y neutro para la edad de una copia cacheada ("hace 25 min", "hace 3 h"...). */
export function formatearEdadFrescura(edadMinutos: number): string {
  if (!Number.isFinite(edadMinutos) || edadMinutos < 1) return 'hace menos de un minuto';
  if (edadMinutos < 60) return `hace ${Math.floor(edadMinutos)} min`;
  const horas = Math.floor(edadMinutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

type CacheStorageMatchLike = Pick<CacheStorage, 'match'>;

/**
 * Busca la respuesta cacheada de `url` en Cache Storage y devuelve su frescura.
 *
 * `cacheStorage` es inyectable para tests. En el navegador usa `caches.match(url)`, que
 * recorre todas las cachés (la de API, la runtime de Workbox y el precache del shell).
 */
export async function consultarFrescuraDeCache(
  url: string,
  cacheStorage?: CacheStorageMatchLike,
  ahora: number = Date.now()
): Promise<FrescuraCache | null> {
  const storage =
    cacheStorage ?? (typeof caches !== 'undefined' ? (caches as CacheStorageMatchLike) : undefined);
  if (!storage) return null;

  try {
    const respuesta = await storage.match(url);
    if (!respuesta) return null;
    return evaluarFrescuraDeRespuesta(respuesta, ahora);
  } catch (error) {
    console.warn(`[frescura-cache] No se pudo leer la copia cacheada de ${url}:`, error);
    return null;
  }
}
