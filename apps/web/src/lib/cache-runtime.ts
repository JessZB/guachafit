/**
 * WU22 — higiene de logout en dispositivos compartidos.
 *
 * Workbox usa dos familias de cachés en Cache Storage:
 * - PRECACHE del app shell: `workbox-precache-v2-<scope>` (prefijo `workbox` +
 *   constante `precache-v2` + scope). Se CONSERVA al cerrar sesión: contiene
 *   solo assets estáticos de la app, no datos de usuario.
 * - RUNTIME (respuestas de API): cuando la estrategia define `cacheName`, Workbox
 *   usa ese nombre tal cual (`api-cache` en `vite.config.ts`, sin prefijo); si no
 *   lo define, usa `workbox-runtime-<scope>`. Estas cachés SÍ contienen GET
 *   autenticados y se BORRAN al cerrar sesión.
 *
 * Criterio de `esCacheRuntime`: lista positiva y explícita (la caché de API
 * configurada + el prefijo por defecto de Workbox runtime). Cualquier otra
 * caché se conserva: el objetivo es no borrar el precache ni cachés ajenas.
 */
export const API_RUNTIME_CACHE_NAME = 'api-cache';
export const WORKBOX_RUNTIME_CACHE_PREFIX = 'workbox-runtime-';

export function esCacheRuntime(nombre: string): boolean {
  return nombre === API_RUNTIME_CACHE_NAME || nombre.startsWith(WORKBOX_RUNTIME_CACHE_PREFIX);
}

type CacheStorageLike = Pick<CacheStorage, 'keys' | 'delete'>;

/**
 * Borra de `caches` SOLO las cachés runtime/API y devuelve los nombres borrados.
 *
 * Tolerante por diseño: si una caché individual no se puede borrar, continúa con
 * las demás; si el navegador no soporta Cache Storage devuelve [] sin lanzar.
 * El llamador (logout) la envuelve igualmente en try/catch.
 */
export async function limpiarCachesRuntime(cacheStorage?: CacheStorageLike): Promise<string[]> {
  const storage = cacheStorage ?? (typeof caches !== 'undefined' ? caches : undefined);
  if (!storage) return [];

  let nombres: string[];
  try {
    nombres = await storage.keys();
  } catch (error) {
    console.warn('No se pudieron enumerar las cachés del navegador:', error);
    return [];
  }

  const borradas: string[] = [];
  for (const nombre of nombres) {
    if (!esCacheRuntime(nombre)) continue;
    try {
      await storage.delete(nombre);
      borradas.push(nombre);
    } catch (error) {
      console.warn(`No se pudo borrar la caché runtime "${nombre}":`, error);
    }
  }
  return borradas;
}
