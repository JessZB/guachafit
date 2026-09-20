import { describe, expect, it } from 'vitest';
import { buildApiCachePattern } from './api-cache-pattern';

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

  it('sin configuración cae a un fallback sobre el path /api/', () => {
    const pattern = buildApiCachePattern(undefined);
    expect(pattern.test('http://localhost:4001/api/v1/alumnos')).toBe(true);
    expect(pattern.test('https://api.guachafit.com/api/v1/sesiones')).toBe(true);
    expect(pattern.test('https://example.com/alumnos')).toBe(false);
  });
});
