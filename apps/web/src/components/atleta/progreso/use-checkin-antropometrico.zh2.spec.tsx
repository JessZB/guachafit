// @vitest-environment happy-dom
/**
 * ZH-2: tests en fase roja para `useCheckinAntropometrico`.
 * Contrato 9:
 * `use-checkin-antropometrico.ts`: la fecha que se envía al guardar el check-in (fechaEvaluacion)
 * es la del día en la zona del perfil (Tokio -> 2026-11-04).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { AuthUserDTO } from '@guachafit/shared';
import type { EstadoVentanaCheckinCalculado } from '../../../lib/antropometria-ventana';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';
const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';

const { mockApi } = vi.hoisted(() => ({
  mockApi: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  }),
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: mockApi,
}));

import { useCheckinAntropometrico } from './use-checkin-antropometrico';

function crearUsuario(zonaHoraria: string): AuthUserDTO {
  return {
    id: ALUMNO_ID,
    email: 'checkin@example.com',
    rol: 'alumno' as any,
    zonaHoraria,
  } as unknown as AuthUserDTO;
}

function crearEstadoVentana(): EstadoVentanaCheckinCalculado {
  return {
    estado: 'abierta',
    aplica: true,
    permiteRegistrar: true,
    hoyLocal: '2026-11-04',
    ventanaVigente: null,
    proximaVentana: null,
    ultimaVentanaVencida: null,
    fechaProgramadaAnterior: null,
    proximaFechaProgramada: null,
    mensaje: '',
    motivoBloqueo: null,
  };
}

describe('ZH-2 · useCheckinAntropometrico', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
    mockApi.mockReset();
    mockApi.mockResolvedValue({});
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Tokio y reloj de referencia, envía fechaEvaluacion=2026-11-04 en el POST', async () => {
    const user = crearUsuario('Asia/Tokyo');
    const { result } = renderHook(() =>
      useCheckinAntropometrico({
        user,
        isDemoMode: false,
        evolucion: null,
        esSoloLectura: false,
        estadoVentana: crearEstadoVentana(),
        onAbrirFormulario: vi.fn(),
        onEvolucionActualizada: vi.fn(),
        onBloqueo: vi.fn(),
        onCheckinExitoso: vi.fn(),
      })
    );

    act(() => {
      result.current.actualizarMedida('pesoKg', '72.50');
    });

    const eventoFake = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSubmitCheckin(eventoFake);
    });

    const llamadaPost = mockApi.mock.calls.find(
      ([endpoint]) => endpoint === '/antropometria/checkin'
    );
    expect(llamadaPost).toBeDefined();

    const opciones = llamadaPost?.[1] as { body?: string } | undefined;
    const cuerpo = JSON.parse(opciones?.body ?? '{}') as Record<string, unknown>;

    expect(cuerpo.fechaEvaluacion).toBe('2026-11-04');
  });

  it('regresión Caracas: con perfil America/Caracas envía fechaEvaluacion=2026-11-03', async () => {
    const user = crearUsuario('America/Caracas');
    const { result } = renderHook(() =>
      useCheckinAntropometrico({
        user,
        isDemoMode: false,
        evolucion: null,
        esSoloLectura: false,
        estadoVentana: crearEstadoVentana(),
        onAbrirFormulario: vi.fn(),
        onEvolucionActualizada: vi.fn(),
        onBloqueo: vi.fn(),
        onCheckinExitoso: vi.fn(),
      })
    );

    act(() => {
      result.current.actualizarMedida('pesoKg', '72.50');
    });

    const eventoFake = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => {
      await result.current.handleSubmitCheckin(eventoFake);
    });

    const llamadaPost = mockApi.mock.calls.find(
      ([endpoint]) => endpoint === '/antropometria/checkin'
    );
    expect(llamadaPost).toBeDefined();

    const opciones = llamadaPost?.[1] as { body?: string } | undefined;
    const cuerpo = JSON.parse(opciones?.body ?? '{}') as Record<string, unknown>;

    expect(cuerpo.fechaEvaluacion).toBe('2026-11-03');
  });
});
