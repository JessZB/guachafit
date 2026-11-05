// @vitest-environment happy-dom
/**
 * ZH-2 (revisión): tests de las correcciones de `useContextoAntropometrico`.
 * Contratos:
 * 1. Con `user.zonaHoraria='America/Caracas'` y `/auth/me` devolviendo `usuario.zonaHoraria='Asia/Tokyo'`,
 *    `hoyLocal` y `zonaPerfil` del hook pasan a `2026-11-04` / `Asia/Tokyo` (`/auth/me` fresco gana al login).
 * 2. Si `/auth/me` falla (rechaza), usa la zona del `user` (`America/Caracas`, `2026-11-03`).
 * 3. En modo demo (`isDemoMode=true`) con `user.zonaHoraria='Asia/Tokyo'`, `hoyLocal` es la fecha del
 *    dispositivo (`2026-11-03`) y el escenario `remoto-ventana` queda con la ventana abierta
 *    (`estadoVentana.permiteRegistrar === true`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Modalidad, PeriodicidadAntropometria, type AuthUserDTO } from '@guachafit/shared';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';

const { mockApi } = vi.hoisted(() => ({
  mockApi: vi.fn(),
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: mockApi,
}));

import { useContextoAntropometrico } from './use-contexto-antropometrico';

function crearUsuario(zonaHoraria: string): AuthUserDTO {
  return {
    id: 'alumno-antropo-rev-1',
    email: 'antropo-rev@example.com',
    rol: 'alumno' as any,
    modalidad: Modalidad.REMOTO,
    periodicidadAntropometria: PeriodicidadAntropometria.QUINCENAL,
    antropometriaInicio: '2026-10-01',
    zonaHoraria,
  } as unknown as AuthUserDTO;
}

describe('ZH-2 (revisión) · useContextoAntropometrico', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
    mockApi.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con user America/Caracas y /auth/me devolviendo Asia/Tokyo, hoyLocal y zonaPerfil son 2026-11-04 y Asia/Tokyo', async () => {
    const userLogin = crearUsuario('America/Caracas');
    const usuarioFresco = crearUsuario('Asia/Tokyo');
    mockApi.mockResolvedValue({ usuario: usuarioFresco });

    const { result } = renderHook(() => useContextoAntropometrico(userLogin, false));

    await waitFor(() => {
      expect(result.current.zonaPerfil).toBe('Asia/Tokyo');
    });

    expect(result.current.hoyLocal).toBe('2026-11-04');
    expect(result.current.estadoVentana.hoyLocal).toBe('2026-11-04');
  });

  it('si /auth/me rechaza, conserva la zona del user del login (America/Caracas, 2026-11-03)', async () => {
    const userLogin = crearUsuario('America/Caracas');
    mockApi.mockRejectedValue(new Error('Fallo de red en /auth/me'));

    const { result } = renderHook(() => useContextoAntropometrico(userLogin, false));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi).toHaveBeenCalledWith('/auth/me');
    expect(result.current.zonaPerfil).toBe('America/Caracas');
    expect(result.current.hoyLocal).toBe('2026-11-03');
    expect(result.current.estadoVentana.hoyLocal).toBe('2026-11-03');
  });

  it('en modo demo con user Asia/Tokyo, hoyLocal es la fecha del dispositivo (2026-11-03) y remoto-ventana tiene permiteRegistrar === true', () => {
    const userTokio = crearUsuario('Asia/Tokyo');

    const { result } = renderHook(() => useContextoAntropometrico(userTokio, true));

    expect(result.current.escenarioDemo).toBe('remoto-ventana');
    expect(result.current.hoyLocal).toBe('2026-11-03');
    expect(result.current.estadoVentana.hoyLocal).toBe('2026-11-03');
    expect(result.current.estadoVentana.permiteRegistrar).toBe(true);
    expect(mockApi).not.toHaveBeenCalled();
  });
});
