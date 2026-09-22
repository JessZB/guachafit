import { describe, expect, it, vi } from 'vitest';
import {
  consultarFrescuraDeCache,
  edadEnMinutos,
  evaluarFrescuraDeRespuesta,
  fechaDesdeRespuesta,
  formatearEdadFrescura,
  type FrescuraCache,
} from './frescura-cache';

const AHORA = Date.parse('2026-09-21T12:00:00.000Z');

function respuestaConFecha(date: string, status = 200): Response {
  return new Response('{}', { status, headers: { date } });
}

describe('frescura-cache: edad de una respuesta cacheada', () => {
  it('convierte la fecha del header date a minutos enteros transcurridos', () => {
    expect(edadEnMinutos('2026-09-21T11:35:00.000Z', AHORA)).toBe(25);
    expect(edadEnMinutos('2026-09-21T11:59:30.000Z', AHORA)).toBe(0);
  });

  it('una fecha futura (reloj desfasado) se reporta como edad 0, nunca negativa', () => {
    expect(edadEnMinutos('2026-09-21T12:05:00.000Z', AHORA)).toBe(0);
  });

  it('una fecha inválida no produce edad', () => {
    expect(edadEnMinutos('no-es-fecha', AHORA)).toBeNull();
  });

  it('solo acepta respuestas 2xx con header date parseable', () => {
    expect(fechaDesdeRespuesta(respuestaConFecha('2026-09-21T11:00:00.000Z'))).toBe(
      '2026-09-21T11:00:00.000Z'
    );
    expect(fechaDesdeRespuesta(new Response(null, { status: 204 }))).toBeNull();
    expect(
      fechaDesdeRespuesta(new Response(null, { status: 500, headers: { date: 'x' } }))
    ).toBeNull();
    expect(fechaDesdeRespuesta(new Response('{}', { status: 200 }))).toBeNull();
  });

  it('evaluarFrescuraDeRespuesta devuelve fecha y edad, o null si no hay date', () => {
    expect(evaluarFrescuraDeRespuesta(respuestaConFecha('2026-09-21T11:00:00.000Z'), AHORA)).toEqual({
      fechaUtc: '2026-09-21T11:00:00.000Z',
      edadMinutos: 60,
    });
    expect(evaluarFrescuraDeRespuesta(new Response('{}', { status: 200 }), AHORA)).toBeNull();
  });
});

describe('frescura-cache: formato humano de la edad', () => {
  it('distingue menos de un minuto, minutos, horas y días', () => {
    expect(formatearEdadFrescura(0)).toBe('hace menos de un minuto');
    expect(formatearEdadFrescura(1)).toBe('hace 1 min');
    expect(formatearEdadFrescura(25)).toBe('hace 25 min');
    expect(formatearEdadFrescura(59)).toBe('hace 59 min');
    expect(formatearEdadFrescura(60)).toBe('hace 1 h');
    expect(formatearEdadFrescura(23 * 60)).toBe('hace 23 h');
    expect(formatearEdadFrescura(24 * 60)).toBe('hace 1 día');
    expect(formatearEdadFrescura(3 * 24 * 60)).toBe('hace 3 días');
  });

  it('no produce texto para valores no finitos', () => {
    expect(formatearEdadFrescura(Number.NaN)).toBe('hace menos de un minuto');
  });
});

describe('frescura-cache: consulta a Cache Storage', () => {
  it('devuelve la frescura cuando la URL está cacheada', async () => {
    const match = vi.fn(async () => respuestaConFecha('2026-09-21T11:30:00.000Z'));
    const frescura = await consultarFrescuraDeCache('http://localhost:4001/api/v1/x', { match }, AHORA);
    expect(frescura).toEqual({ fechaUtc: '2026-09-21T11:30:00.000Z', edadMinutos: 30 });
    expect(match).toHaveBeenCalledWith('http://localhost:4001/api/v1/x');
  });

  it('devuelve null si no hay copia cacheada', async () => {
    const match = vi.fn(async () => undefined);
    expect(await consultarFrescuraDeCache('http://localhost:4001/api/v1/x', { match }, AHORA)).toBeNull();
  });

  it('es tolerante a fallos de Cache Storage (nunca lanza)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const match = vi.fn(async () => {
      throw new Error('Cache Storage no disponible');
    });
    expect(await consultarFrescuraDeCache('http://localhost:4001/api/v1/x', { match }, AHORA)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('devuelve null cuando el navegador no expone Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    const frescura: FrescuraCache | null = await consultarFrescuraDeCache(
      'http://localhost:4001/api/v1/x',
      undefined,
      AHORA
    );
    expect(frescura).toBeNull();
    vi.unstubAllGlobals();
  });
});
