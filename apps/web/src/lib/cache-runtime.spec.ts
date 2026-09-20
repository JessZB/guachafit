import { describe, expect, it, vi } from 'vitest';
import { API_RUNTIME_CACHE_NAME, esCacheRuntime, limpiarCachesRuntime } from './cache-runtime';

describe('esCacheRuntime', () => {
  it('reconoce la caché de API configurada (Workbox la usa sin prefijo)', () => {
    expect(esCacheRuntime('api-cache')).toBe(true);
    expect(esCacheRuntime(API_RUNTIME_CACHE_NAME)).toBe(true);
  });

  it('reconoce el prefijo por defecto de las cachés runtime de Workbox', () => {
    expect(esCacheRuntime('workbox-runtime-http://localhost:3000/')).toBe(true);
    expect(esCacheRuntime('workbox-runtime-https://app.guachafit.com/')).toBe(true);
  });

  it('NUNCA marca el precache del app shell', () => {
    expect(esCacheRuntime('workbox-precache-v2-http://localhost:3000/')).toBe(false);
    expect(esCacheRuntime('workbox-precache-v2-https://app.guachafit.com/')).toBe(false);
  });

  it('conserva cualquier otra caché desconocida', () => {
    expect(esCacheRuntime('workbox-google-analytics')).toBe(false);
    expect(esCacheRuntime('mi-cache-manual')).toBe(false);
    expect(esCacheRuntime('api-cache-v2')).toBe(false);
    expect(esCacheRuntime('')).toBe(false);
  });
});

function fakeCacheStorage(nombres: string[], fallarEn: string[] = []) {
  const borradas: string[] = [];
  return {
    borradas,
    keys: async () => [...nombres],
    delete: async (nombre: string) => {
      if (fallarEn.includes(nombre)) throw new Error(`delete falló para ${nombre}`);
      borradas.push(nombre);
      return true;
    },
  };
}

describe('limpiarCachesRuntime', () => {
  it('borra solo las cachés runtime/API y preserva el precache', async () => {
    const storage = fakeCacheStorage([
      'workbox-precache-v2-http://localhost:3000/',
      'api-cache',
      'workbox-runtime-http://localhost:3000/',
      'otra-cache',
    ]);

    const borradas = await limpiarCachesRuntime(storage);

    expect(borradas).toEqual(['api-cache', 'workbox-runtime-http://localhost:3000/']);
    expect(storage.borradas).toEqual(borradas);
  });

  it('devuelve [] sin lanzar cuando no hay Cache Storage disponible', async () => {
    await expect(limpiarCachesRuntime(undefined)).resolves.toEqual([]);
  });

  it('tolera que una caché individual falle y sigue con las demás', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = fakeCacheStorage(['api-cache', 'workbox-runtime-x'], ['api-cache']);

    const borradas = await limpiarCachesRuntime(storage);

    expect(borradas).toEqual(['workbox-runtime-x']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
