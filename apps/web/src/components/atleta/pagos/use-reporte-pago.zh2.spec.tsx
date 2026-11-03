// @vitest-environment jsdom
/**
 * ZH-2: tests en fase roja para `useReportePago`.
 * Contrato 5:
 * Con perfil Tokio y reloj en el instante de referencia (2026-11-03T20:00:00Z):
 * - la fechaOperacion inicial es 2026-11-04.
 * - tras reiniciar el formulario (iniciarNuevoPago) vuelve a ser 2026-11-04.
 * - la validación de fecha de cobro acepta 2026-11-04 como hoy y rechaza 2026-11-05 como futura.
 * Con perfil Caracas y el mismo reloj, la inicial es 2026-11-03.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MENSAJE_FECHA_PAGO_FUTURA, type TasaCambioVigenteDTO } from '@guachafit/shared';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';

const authMock = vi.hoisted(() => ({
  user: {
    id: 'alumno-pago-zh2',
    email: 'pago@example.com',
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

describe('ZH-2 · useReportePago', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
    authMock.user = {
      id: 'alumno-pago-zh2',
      email: 'pago@example.com',
      rol: 'alumno',
      zonaHoraria: 'Asia/Tokyo',
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Tokio y reloj de referencia, fechaOperacion inicial es 2026-11-04', () => {
    const { result } = renderHook(() => useReportePago(crearOpciones()));
    expect(result.current.fechaOperacion).toBe('2026-11-04');
  });

  it('con perfil Tokio, tras iniciarNuevoPago() vuelve a ser 2026-11-04', () => {
    const { result } = renderHook(() => useReportePago(crearOpciones()));

    act(() => {
      result.current.alCambiarFecha('2026-10-15');
    });
    expect(result.current.fechaOperacion).toBe('2026-10-15');

    act(() => {
      result.current.iniciarNuevoPago();
    });
    expect(result.current.fechaOperacion).toBe('2026-11-04');
  });

  it('con perfil Tokio, acepta 2026-11-04 como hoy y rechaza 2026-11-05 como futura', async () => {
    const { result } = renderHook(() => useReportePago(crearOpciones()));

    // 2026-11-04 es hoy en Tokio: debe aceptarse sin errorFecha
    act(() => {
      result.current.alCambiarFecha('2026-11-04');
    });

    await act(async () => {
      const e = { preventDefault: vi.fn() } as unknown as React.FormEvent;
      await result.current.handleReportarPago(e);
    });

    expect(result.current.errorFecha).toBeNull();

    // 2026-11-05 es futura en Tokio: debe ser rechazada con mensaje de fecha futura
    act(() => {
      result.current.alCambiarFecha('2026-11-05');
    });

    await act(async () => {
      const e = { preventDefault: vi.fn() } as unknown as React.FormEvent;
      await result.current.handleReportarPago(e);
    });

    expect(result.current.errorFecha).toBe(MENSAJE_FECHA_PAGO_FUTURA);
  });

  it('regresión Caracas: con perfil America/Caracas la inicial es 2026-11-03', () => {
    authMock.user = {
      id: 'alumno-pago-caracas',
      email: 'caracas@example.com',
      rol: 'alumno',
      zonaHoraria: 'America/Caracas',
    };

    const { result } = renderHook(() => useReportePago(crearOpciones()));
    expect(result.current.fechaOperacion).toBe('2026-11-03');
  });
});
