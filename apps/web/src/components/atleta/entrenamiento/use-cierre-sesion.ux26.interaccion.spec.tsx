// @vitest-environment happy-dom
/**
 * UX-26 (Fase Roja / TDD) · Contratos para useCierreSesion:
 * - ENT-09b: rpeSesion arranca en null; al finalizar sin seleccionar no inventa [RPE: 8/10]
 * - ENT-09b: al seleccionar rpeSesion (ej: 7), incluye [RPE: 7/10] en notasCompletas
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { useCierreSesion } from './use-cierre-sesion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SESION_CON_SERIE_COMPLETA: SesionEntrenamientoDetalleDTO = {
  id: 'sesion-cierre-test',
  alumnoId: 'alumno-1',
  bloqueId: 'bloque-1',
  fechaProgramada: '2026-11-02',
  estado: EstadoSesion.EN_PROGRESO,
  fechaInicioUtc: '2026-11-02T10:00:00Z',
  fechaFinUtc: null,
  duracionMinutos: 45,
  notasAlumno: null,
  timezoneCliente: 'America/Caracas',
  porcentajeCumplimiento: '100%',
  createdAtUtc: '2026-11-02T10:00:00Z',
  updatedAtUtc: '2026-11-02T10:00:00Z',
  ejercicios: [
    {
      id: 'es-1',
      sesionId: 'sesion-cierre-test',
      orden: 1,
      ejercicioId: 'cat-1',
      ejercicio: {
        id: 'cat-1',
        nombre: 'Sentadilla',
        grupoMuscular: 'PIERNAS',
        patronMovimiento: 'SENTADILLA',
        esBilateral: true,
      } as any,
      series: [
        {
          id: 's-1',
          ejercicioSesionId: 'es-1',
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: 10,
          pesoKg: '100',
          pesoPrescritoKg: '100',
          rpe: null,
          descansoSegundos: 120,
          completada: true,
        },
      ],
    },
  ],
};

describe('useCierreSesion · UX-26', () => {
  it('ENT-09b: rpeSesion inicializa en null', () => {
    const { result } = renderHook(() =>
      useCierreSesion({
        sesion: SESION_CON_SERIE_COMPLETA,
        setSesion: vi.fn(),
        user: { id: 'u-1' },
        isDemoMode: true,
        semanaProgreso: null,
        setActionError: vi.fn(),
        setBloqueo: vi.fn(),
        cacheSesion: vi.fn().mockResolvedValue(undefined),
        refreshSemana: vi.fn().mockResolvedValue(undefined),
        enviarOEncolar: vi.fn(),
      })
    );

    expect(result.current.rpeSesion).toBeNull();
  });

  it('ENT-09b: al confirmar sin seleccionar esfuerzo, no inventa [RPE: 8/10] en notasAlumno', async () => {
    const setSesion = vi.fn();
    const { result } = renderHook(() =>
      useCierreSesion({
        sesion: SESION_CON_SERIE_COMPLETA,
        setSesion,
        user: { id: 'u-1' },
        isDemoMode: true,
        semanaProgreso: null,
        setActionError: vi.fn(),
        setBloqueo: vi.fn(),
        cacheSesion: vi.fn().mockResolvedValue(undefined),
        refreshSemana: vi.fn().mockResolvedValue(undefined),
        enviarOEncolar: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.confirmFinishSession();
    });

    expect(setSesion).toHaveBeenCalled();
    const sesionActualizada = setSesion.mock.calls[0][0];
    expect(sesionActualizada.notasAlumno).not.toContain('[RPE:');
  });

  it('ENT-09b: al seleccionar esfuerzo explícito (ej: 7), incluye [RPE: 7/10] en notasAlumno', async () => {
    const setSesion = vi.fn();
    const { result } = renderHook(() =>
      useCierreSesion({
        sesion: SESION_CON_SERIE_COMPLETA,
        setSesion,
        user: { id: 'u-1' },
        isDemoMode: true,
        semanaProgreso: null,
        setActionError: vi.fn(),
        setBloqueo: vi.fn(),
        cacheSesion: vi.fn().mockResolvedValue(undefined),
        refreshSemana: vi.fn().mockResolvedValue(undefined),
        enviarOEncolar: vi.fn(),
      })
    );

    act(() => {
      result.current.setRpeSesion(7);
    });

    await act(async () => {
      await result.current.confirmFinishSession();
    });

    expect(setSesion).toHaveBeenCalled();
    const sesionActualizada = setSesion.mock.calls[0][0];
    expect(sesionActualizada.notasAlumno).toContain('[RPE: 7/10]');
  });
});
