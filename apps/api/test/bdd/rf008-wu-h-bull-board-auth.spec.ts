import { describe, it, expect, vi } from 'vitest';
import {
  BULL_BOARD_PASS_ENV,
  BULL_BOARD_USER_ENV,
  compararCredencialSegura,
  crearBullBoardAuthMiddleware,
} from '../../src/common/bull-board-auth.middleware';

/**
 * WU-H (ADR-008 §4.4): el dashboard Bull-Board en `/admin/queues` NUNCA puede quedar público.
 * - Sin envs configuradas: 404 (ruta deshabilitada, no se revela su existencia).
 * - Con envs: Basic Auth obligatorio (401 + WWW-Authenticate si falta o es inválido).
 */
describe('WU-H: protección del dashboard Bull-Board (/admin/queues)', () => {
  function crearResMock() {
    const res: any = { statusCode: 0, headers: {} as Record<string, string>, body: undefined };
    res.status = vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.json = vi.fn((body: any) => {
      res.body = body;
      return res;
    });
    res.set = vi.fn((clave: string, valor: string) => {
      res.headers[clave] = valor;
      return res;
    });
    return res;
  }

  function basicHeader(usuario: string, password: string): string {
    return `Basic ${Buffer.from(`${usuario}:${password}`, 'utf8').toString('base64')}`;
  }

  it('responde 404 cuando BULL_BOARD_USER/BULL_BOARD_PASS no están configuradas', () => {
    const middleware = crearBullBoardAuthMiddleware({});
    const res = crearResMock();
    const next = vi.fn();

    middleware({ headers: {} } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 404 si solo una de las dos envs está configurada', () => {
    const middleware = crearBullBoardAuthMiddleware({ [BULL_BOARD_USER_ENV]: 'admin' });
    const res = crearResMock();

    middleware({ headers: {} } as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('exige Basic Auth: sin cabecera responde 401 con WWW-Authenticate', () => {
    const middleware = crearBullBoardAuthMiddleware({
      [BULL_BOARD_USER_ENV]: 'admin',
      [BULL_BOARD_PASS_ENV]: 'secreto',
    });
    const res = crearResMock();
    const next = vi.fn();

    middleware({ headers: {} } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.headers['WWW-Authenticate']).toContain('Basic realm=');
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza credenciales incorrectas (usuario o password) sin dejar pasar', () => {
    const middleware = crearBullBoardAuthMiddleware({
      [BULL_BOARD_USER_ENV]: 'admin',
      [BULL_BOARD_PASS_ENV]: 'secreto',
    });

    const resUsuarioMalo = crearResMock();
    middleware(
      { headers: { authorization: basicHeader('otro', 'secreto') } } as any,
      resUsuarioMalo,
      vi.fn()
    );
    expect(resUsuarioMalo.status).toHaveBeenCalledWith(401);

    const resPasswordMala = crearResMock();
    middleware(
      { headers: { authorization: basicHeader('admin', 'incorrecto') } } as any,
      resPasswordMala,
      vi.fn()
    );
    expect(resPasswordMala.status).toHaveBeenCalledWith(401);
  });

  it('deja pasar con credenciales correctas', () => {
    const middleware = crearBullBoardAuthMiddleware({
      [BULL_BOARD_USER_ENV]: 'admin',
      [BULL_BOARD_PASS_ENV]: 'secreto',
    });
    const res = crearResMock();
    const next = vi.fn();

    middleware(
      { headers: { authorization: basicHeader('admin', 'secreto') } } as any,
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('la comparación de credenciales es en tiempo constante y tolera longitudes distintas', () => {
    expect(compararCredencialSegura('admin', 'admin')).toBe(true);
    expect(compararCredencialSegura('admin', 'admi')).toBe(false);
    expect(compararCredencialSegura('', 'admin')).toBe(false);
  });
});
