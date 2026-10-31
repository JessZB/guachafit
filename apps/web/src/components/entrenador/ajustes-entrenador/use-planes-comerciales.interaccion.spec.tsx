// @vitest-environment jsdom
/**
 * UX-18 · Contratos de interacción: usePlanesComerciales (HP1–HP5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

vi.mock('../../../lib/haptics', () => ({
  triggerHaptic: vi.fn(),
}));

import { apiClient } from '../../../lib/api-client';
import { usePlanesComerciales } from './use-planes-comerciales';

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

const PLAN_FIXTURE: PlanMembresiaDetalleDTO = {
  id: 'plan-1',
  entrenadorId: 'e1',
  nombre: 'Plan Básico',
  descripcion: 'Acceso general al gimnasio',
  beneficios: ['Rutina interactiva en app'],
  precioBaseUsd: '30.00',
  duracionMeses: 1,
  activo: true,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mockApiClient.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePlanesComerciales · interacción (UX-18)', () => {
  it('HP1 · Guardado fallido sin alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockApiClient.mockRejectedValueOnce(new Error('Fallo de red'));

    const { result } = renderHook(() => usePlanesComerciales(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.guardarPlan(
        {
          nombre: 'Plan Prueba',
          descripcion: 'Desc',
          precioBaseUsd: '50.00',
          duracionMeses: 1,
          beneficios: ['Beneficio 1'],
        },
        null,
        vi.fn()
      );
    });

    expect(ok).toBe(false);
    expect((result.current as any).errorGuardado).toBe('Fallo de red');
    expect(result.current.planesError).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('HP2 · Error de activación aparte', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('Error al actualizar'));

    const { result } = renderHook(() => usePlanesComerciales(false));

    await act(async () => {
      await result.current.toggleActivoPlan(PLAN_FIXTURE);
    });

    expect((result.current as any).errorToggle).not.toBeNull();
    expect(result.current.planesError).toBeNull();
  });

  it('HP3 · Un PATCH a la vez', async () => {
    let resolverPatch: (valor: any) => void = () => {};
    const promesaPatch = new Promise((resolve) => {
      resolverPatch = resolve;
    });
    mockApiClient.mockReturnValue(promesaPatch);

    const { result } = renderHook(() => usePlanesComerciales(false));

    let llamada1: Promise<void>;
    act(() => {
      llamada1 = result.current.toggleActivoPlan(PLAN_FIXTURE);
    });

    expect((result.current as any).planEnCurso).toBe(PLAN_FIXTURE.id);

    // Segunda llamada con el mismo plan mientras el primer PATCH sigue pendiente
    await act(async () => {
      await result.current.toggleActivoPlan(PLAN_FIXTURE);
    });

    expect(mockApiClient).toHaveBeenCalledTimes(1);

    // Resolver la petición inicial
    await act(async () => {
      resolverPatch({ ...PLAN_FIXTURE, activo: !PLAN_FIXTURE.activo });
      await llamada1!;
    });

    expect((result.current as any).planEnCurso).toBeNull();
  });

  it('HP4 · Un guardado a la vez', async () => {
    let resolverPost: (valor: any) => void = () => {};
    const promesaPost = new Promise((resolve) => {
      resolverPost = resolve;
    });
    mockApiClient.mockReturnValue(promesaPost);

    const { result } = renderHook(() => usePlanesComerciales(false));

    const datos = {
      nombre: 'Plan Nuevo',
      descripcion: 'Desc',
      precioBaseUsd: '50.00',
      duracionMeses: 1,
      beneficios: ['Beneficio 1'],
    };

    let llamada1: Promise<boolean>;
    let llamada2: Promise<boolean>;
    act(() => {
      llamada1 = result.current.guardarPlan(datos, null, vi.fn());
      llamada2 = result.current.guardarPlan(datos, null, vi.fn());
    });

    expect(mockApiClient).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolverPost({ ...PLAN_FIXTURE, id: 'plan-nuevo', ...datos });
      await llamada1!;
      await llamada2!;
    });
  });

  it('HP5 · cargarPlanes limpia errorToggle', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('Error al actualizar'));

    const { result } = renderHook(() => usePlanesComerciales(false));

    await act(async () => {
      await result.current.toggleActivoPlan(PLAN_FIXTURE);
    });

    expect(result.current.errorToggle).not.toBeNull();

    mockApiClient.mockResolvedValueOnce([PLAN_FIXTURE]);

    await act(async () => {
      await result.current.cargarPlanes();
    });

    expect(result.current.errorToggle).toBeNull();
  });
});
