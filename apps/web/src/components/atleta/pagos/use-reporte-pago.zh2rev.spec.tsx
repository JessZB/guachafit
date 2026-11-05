// @vitest-environment happy-dom
/**
 * ZH-2 (revisión): tests de las correcciones de `useReportePago`.
 * Contrato:
 * Con perfil Tokio, si el reloj avanza (`vi.setSystemTime`) cruzando la medianoche de Tokio
 * entre el montaje y la llamada, `iniciarNuevoPago()` recalcula `fechaCalendarioEnZona(zonaPerfil)`
 * y deja `fechaOperacion` en la fecha NUEVA (montar a `2026-11-03T14:00:00Z` = 23:00 del día 3 en
 * Tokio; avanzar a `2026-11-03T16:00:00Z` = 01:00 del día 4; esperar `2026-11-04`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { TasaCambioVigenteDTO } from '@guachafit/shared';

const INSTANTE_ANTES_MEDIANOCHE_TOKIO = '2026-11-03T14:00:00Z'; // 2026-11-03 23:00 JST
const INSTANTE_DESPUES_MEDIANOCHE_TOKIO = '2026-11-03T16:00:00Z'; // 2026-11-04 01:00 JST

const authMock = vi.hoisted(() => ({
  user: {
    id: 'alumno-pago-zh2rev',
    email: 'pago-rev@example.com',
    rol: 'alumno',
    zonaHoraria: 'Asia/Tokyo',
  },
  isDemoMode: false,
}));

vi.mock('../../../context/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    isDemoMode: authMock.isDemoMode,
  }),
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

import { useReportePago } from './use-reporte-pago';

const TASA_VALIDA: TasaCambioVigenteDTO = {
  entrenadorId: 'coach-1',
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-11-03T12:00:00.000Z',
};

function crearOpciones() {
  return {
    cuota: null,
    tasa: TASA_VALIDA,
    tasaError: false,
    alReportarExito: vi.fn(),
  };
}

describe('ZH-2 (revisión) · useReportePago', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_ANTES_MEDIANOCHE_TOKIO));
    authMock.user = {
      id: 'alumno-pago-zh2rev',
      email: 'pago-rev@example.com',
      rol: 'alumno',
      zonaHoraria: 'Asia/Tokyo',
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Tokio, si el reloj cruza la medianoche de Tokio entre el montaje e iniciarNuevoPago(), fechaOperacion pasa al día nuevo (2026-11-04)', () => {
    const { result } = renderHook(() => useReportePago(crearOpciones()));

    // Al montar a las 23:00 del día 3 en Tokio, fechaOperacion es 2026-11-03
    expect(result.current.fechaOperacion).toBe('2026-11-03');

    // El reloj avanza a las 01:00 del día 4 en Tokio sin re-renderizar antes de iniciarNuevoPago
    vi.setSystemTime(new Date(INSTANTE_DESPUES_MEDIANOCHE_TOKIO));

    act(() => {
      result.current.iniciarNuevoPago();
    });

    expect(result.current.fechaOperacion).toBe('2026-11-04');
  });
});
