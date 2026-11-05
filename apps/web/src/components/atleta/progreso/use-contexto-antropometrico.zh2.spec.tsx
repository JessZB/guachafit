// @vitest-environment happy-dom
/**
 * ZH-2: tests en fase roja para `useContextoAntropometrico`.
 * Contrato 8:
 * `hoyLocal` del contexto devuelto = fecha del día en la zona del perfil (Tokio -> 2026-11-04).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { Modalidad, PeriodicidadAntropometria, type AuthUserDTO } from '@guachafit/shared';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn().mockResolvedValue({ usuario: null }),
}));

import { useContextoAntropometrico } from './use-contexto-antropometrico';

function crearUsuario(zonaHoraria: string): AuthUserDTO {
  return {
    id: 'alumno-antropo-1',
    email: 'antropo@example.com',
    rol: 'alumno' as any,
    modalidad: Modalidad.REMOTO,
    periodicidadAntropometria: PeriodicidadAntropometria.QUINCENAL,
    antropometriaInicio: '2026-10-01',
    zonaHoraria,
  } as unknown as AuthUserDTO;
}

describe('ZH-2 · useContextoAntropometrico', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Tokio y reloj de referencia, hoyLocal del contexto devuelto es 2026-11-04', () => {
    const user = crearUsuario('Asia/Tokyo');
    const { result } = renderHook(() => useContextoAntropometrico(user, false));

    const hoyLocalDevuelto = result.current.hoyLocal;

    expect(hoyLocalDevuelto).toBe('2026-11-04');
    expect(result.current.estadoVentana.hoyLocal).toBe('2026-11-04');
  });

  it('regresión Caracas: con perfil America/Caracas, hoyLocal es 2026-11-03', () => {
    const user = crearUsuario('America/Caracas');
    const { result } = renderHook(() => useContextoAntropometrico(user, false));

    const hoyLocalDevuelto = result.current.hoyLocal;

    expect(hoyLocalDevuelto).toBe('2026-11-03');
    expect(result.current.estadoVentana.hoyLocal).toBe('2026-11-03');
  });
});
