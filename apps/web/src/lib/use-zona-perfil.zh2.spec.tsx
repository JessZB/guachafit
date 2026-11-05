// @vitest-environment happy-dom
/**
 * ZH-2: tests en fase roja para `useZonaPerfil`.
 * Contrato 2:
 * `lib/use-zona-perfil.ts` exporta `useZonaPerfil(): string` = `zonaPerfilEfectiva(useAuth().user?.zonaHoraria)`
 * Devuelve la zona del perfil; sin zona o inválida -> `America/Caracas`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

const authMock = vi.hoisted(() => ({
  usuario: null as { id?: string; zonaHoraria?: string | null } | null,
}));

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: authMock.usuario,
  }),
}));

import { useZonaPerfil } from './use-zona-perfil';

describe('ZH-2 · useZonaPerfil', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('devuelve la zona del perfil cuando es válida (Asia/Tokyo)', () => {
    authMock.usuario = { id: 'u1', zonaHoraria: 'Asia/Tokyo' };
    const { result } = renderHook(() => useZonaPerfil());
    expect(result.current).toBe('Asia/Tokyo');
  });

  it('devuelve la zona del perfil cuando es válida (Europe/Madrid)', () => {
    authMock.usuario = { id: 'u2', zonaHoraria: 'Europe/Madrid' };
    const { result } = renderHook(() => useZonaPerfil());
    expect(result.current).toBe('Europe/Madrid');
  });

  it('devuelve America/Caracas cuando el perfil no tiene zona horaria (null o undefined)', () => {
    authMock.usuario = { id: 'u3', zonaHoraria: null };
    const { result: resNull } = renderHook(() => useZonaPerfil());
    expect(resNull.current).toBe('America/Caracas');

    authMock.usuario = { id: 'u4' };
    const { result: resUndef } = renderHook(() => useZonaPerfil());
    expect(resUndef.current).toBe('America/Caracas');
  });

  it('devuelve America/Caracas cuando no hay usuario en sesión', () => {
    authMock.usuario = null;
    const { result } = renderHook(() => useZonaPerfil());
    expect(result.current).toBe('America/Caracas');
  });

  it('devuelve America/Caracas cuando la zona horaria del perfil es inválida', () => {
    authMock.usuario = { id: 'u5', zonaHoraria: 'Invalida/Zona' };
    const { result } = renderHook(() => useZonaPerfil());
    expect(result.current).toBe('America/Caracas');
  });

  it('regresión Caracas: devuelve America/Caracas con perfil configurado en Caracas', () => {
    authMock.usuario = { id: 'u6', zonaHoraria: 'America/Caracas' };
    const { result } = renderHook(() => useZonaPerfil());
    expect(result.current).toBe('America/Caracas');
  });
});
