import { describe, expect, it } from 'vitest';
import { buildApiCachePattern, construirRuntimeCachingApi } from './api-cache-pattern';

describe('buildApiCachePattern (WU4: runtimeCaching de la API)', () => {
  it('matchea la API local configurada en VITE_API_URL', () => {
    const pattern = buildApiCachePattern('http://localhost:4001/api/v1');
    expect(pattern.test('http://localhost:4001/api/v1/alumnos/me/sesiones/hoy?timezone=UTC')).toBe(true);
    expect(pattern.test('http://localhost:4001/api/v1/alumnos/me/rutina/semana-actual')).toBe(true);
    expect(pattern.test('https://api.guachafit.com/api/v1/alumnos')).toBe(false);
  });

  it('matchea la API de producción y no otro origen', () => {
    const pattern = buildApiCachePattern('https://api.guachafit.com/api/v1/');
    expect(pattern.test('https://api.guachafit.com/api/v1/sesiones/abc')).toBe(true);
    expect(pattern.test('https://evil.example.com/api/v1/sesiones/abc')).toBe(false);
    expect(pattern.test('https://api.guachafit.com/otra-ruta')).toBe(false);
  });

  it('soporta paths relativos', () => {
    const pattern = buildApiCachePattern('/api/v1');
    expect(pattern.test('http://localhost:4001/api/v1/alumnos')).toBe(true);
  });

  it('D4: excluye las rutas /auth/ de la caché runtime (sesión, login y renovación)', () => {
    const local = buildApiCachePattern('http://localhost:4001/api/v1');
    expect(local.test('http://localhost:4001/api/v1/auth/me')).toBe(false);
    expect(local.test('http://localhost:4001/api/v1/auth/refresh')).toBe(false);
    expect(local.test('http://localhost:4001/api/v1/auth/entrenadores?limit=25')).toBe(false);
    expect(local.test('http://localhost:4001/api/v1/alumnos/me/perfil')).toBe(true);
    expect(local.test('http://localhost:4001/api/v1/autorizaciones')).toBe(true);

    const relativo = buildApiCachePattern('/api/v1');
    expect(relativo.test('http://localhost:4001/api/v1/auth/me')).toBe(false);

    const fallback = buildApiCachePattern(undefined);
    expect(fallback.test('https://api.guachafit.com/api/v1/auth/me')).toBe(false);
    expect(fallback.test('https://api.guachafit.com/api/auth/me')).toBe(false);
    expect(fallback.test('https://api.guachafit.com/api/v1/alumnos')).toBe(true);
  });

  it('D4: la estrategia NetworkFirst de la API corta a los 4 segundos y usa la caché de API', () => {
    const [regla] = construirRuntimeCachingApi('http://localhost:4001/api/v1');
    expect(regla.handler).toBe('NetworkFirst');
    expect(regla.method).toBe('GET');
    expect(regla.options.networkTimeoutSeconds).toBe(4);
    expect(regla.options.cacheName).toBe('api-cache');
    expect((regla.urlPattern as RegExp).test('http://localhost:4001/api/v1/auth/me')).toBe(false);
  });

  it('sin configuración cae a un fallback sobre el path /api/', () => {
    const pattern = buildApiCachePattern(undefined);
    expect(pattern.test('http://localhost:4001/api/v1/alumnos')).toBe(true);
    expect(pattern.test('https://api.guachafit.com/api/v1/sesiones')).toBe(true);
    expect(pattern.test('https://example.com/alumnos')).toBe(false);
  });
});
