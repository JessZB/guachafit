// @vitest-environment jsdom
/**
 * UX-20 · Contrato C1 (CFG-20): hook usePlantillasBanco (recarga honesta y estados).
 *
 * Contrato:
 * - Expone cargandoInicial: boolean (true solo mientras carga y aún no hay ninguna plantilla cargada con éxito)
 *   y recargando: boolean (true mientras una recarga corre habiendo datos previos). isLoading deja de existir.
 * - Una llamada posterior a cargarPlantillas() con datos ya cargados: cargandoInicial permanece false,
 *   plantillas conserva la lista previa durante la recarga y recargando es true hasta que termina.
 * - Si esa recarga falla con datos previos: plantillas sigue siendo la lista previa (no se vacía) y error contiene el mensaje.
 * - Si la carga inicial falla: plantillas vacía, error con mensaje, cargandoInicial false.
 * - Al reintentar con éxito, error vuelve a null y se llena la lista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { NivelObjetivoPlantilla, type PlantillaRutinaResumenDTO } from '@guachafit/shared';

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

vi.mock('../../../lib/haptics', () => ({
  triggerHaptic: vi.fn(),
}));

import { apiClient } from '../../../lib/api-client';
import { usePlantillasBanco } from './use-plantillas-banco';

type MockFn = ReturnType<typeof vi.fn>;
const mockApiClient = apiClient as unknown as MockFn;

type HookNuevo = {
  plantillas: PlantillaRutinaResumenDTO[];
  cargandoInicial: boolean;
  recargando: boolean;
  isLoading?: unknown;
  error: string | null;
  cargarPlantillas: () => Promise<void>;
};

const PLANTILLA_FIXTURE_1: PlantillaRutinaResumenDTO = {
  id: 'p-ux20-1',
  entrenadorId: 'e-1',
  nombre: 'Rutina Hipertrofia A',
  nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
  totalDias: 3,
  totalEjercicios: 12,
  activa: true,
  createdAtUtc: '2026-10-01T10:00:00.000Z',
  updatedAtUtc: '2026-10-15T10:00:00.000Z',
};

const PLANTILLA_FIXTURE_2: PlantillaRutinaResumenDTO = {
  id: 'p-ux20-2',
  entrenadorId: 'e-1',
  nombre: 'Rutina Hipertrofia B',
  nivelObjetivo: NivelObjetivoPlantilla.AVANZADO,
  totalDias: 4,
  totalEjercicios: 16,
  activa: true,
  createdAtUtc: '2026-10-01T10:00:00.000Z',
  updatedAtUtc: '2026-10-15T10:00:00.000Z',
};

beforeEach(() => {
  mockApiClient.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePlantillasBanco · contrato C1 (CFG-20)', () => {
  it('C1.1 · carga inicial exitosa expone cargandoInicial y recargando, e isLoading deja de existir', async () => {
    let resolverLista!: (valor: PlantillaRutinaResumenDTO[]) => void;
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') {
        return new Promise<PlantillaRutinaResumenDTO[]>((resolve) => {
          resolverLista = resolve;
        });
      }
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePlantillasBanco(false));
    const estadoInicial = result.current as unknown as HookNuevo;

    // Durante la carga inicial
    expect(estadoInicial.cargandoInicial).toBe(true);
    expect(estadoInicial.recargando).toBe(false);
    expect(estadoInicial.plantillas).toEqual([]);
    expect('isLoading' in result.current).toBe(false);

    // Resolver carga inicial con éxito
    await act(async () => {
      resolverLista([PLANTILLA_FIXTURE_1]);
    });

    const estadoFinal = result.current as unknown as HookNuevo;
    expect(estadoFinal.cargandoInicial).toBe(false);
    expect(estadoFinal.recargando).toBe(false);
    expect(estadoFinal.plantillas).toEqual([PLANTILLA_FIXTURE_1]);
    expect(estadoFinal.error).toBeNull();
    expect('isLoading' in result.current).toBe(false);
  });

  it('C1.2 · recarga con datos previos mantiene cargandoInicial=false, conserva plantillas y activa recargando=true', async () => {
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') return Promise.resolve([PLANTILLA_FIXTURE_1]);
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePlantillasBanco(false));
    await act(async () => {});
    expect((result.current as unknown as HookNuevo).plantillas).toEqual([PLANTILLA_FIXTURE_1]);

    // Preparar recarga diferida
    let resolverRecarga!: (valor: PlantillaRutinaResumenDTO[]) => void;
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') {
        return new Promise<PlantillaRutinaResumenDTO[]>((resolve) => {
          resolverRecarga = resolve;
        });
      }
      return Promise.resolve([]);
    });

    // Disparar recarga
    let promesaRecarga!: Promise<void>;
    act(() => {
      promesaRecarga = result.current.cargarPlantillas();
    });

    // Durante la recarga habiendo datos previos
    const enRecarga = result.current as unknown as HookNuevo;
    expect(enRecarga.cargandoInicial).toBe(false);
    expect(enRecarga.recargando).toBe(true);
    expect(enRecarga.plantillas).toEqual([PLANTILLA_FIXTURE_1]);

    // Resolver recarga con nuevos datos
    await act(async () => {
      resolverRecarga([PLANTILLA_FIXTURE_1, PLANTILLA_FIXTURE_2]);
      await promesaRecarga;
    });

    const trasRecarga = result.current as unknown as HookNuevo;
    expect(trasRecarga.cargandoInicial).toBe(false);
    expect(trasRecarga.recargando).toBe(false);
    expect(trasRecarga.plantillas).toEqual([PLANTILLA_FIXTURE_1, PLANTILLA_FIXTURE_2]);
  });

  it('C1.3 · recarga fallida con datos previos conserva la lista previa, recargando pasa a false y expone error', async () => {
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') return Promise.resolve([PLANTILLA_FIXTURE_1]);
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePlantillasBanco(false));
    await act(async () => {});
    expect((result.current as unknown as HookNuevo).plantillas).toEqual([PLANTILLA_FIXTURE_1]);

    // La recarga posterior falla
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') return Promise.reject(new Error('Fallo de red al recargar plantillas'));
      return Promise.resolve([]);
    });

    await act(async () => {
      await result.current.cargarPlantillas();
    });

    const trasFallo = result.current as unknown as HookNuevo;
    expect(trasFallo.plantillas).toEqual([PLANTILLA_FIXTURE_1]);
    expect(trasFallo.cargandoInicial).toBe(false);
    expect(trasFallo.recargando).toBe(false);
    expect(trasFallo.error).toBe('Fallo de red al recargar plantillas');
  });

  it('C1.4 · si la carga inicial falla deja plantillas vacía, error con mensaje y cargandoInicial false', async () => {
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') return Promise.reject(new Error('Error de conexión al cargar'));
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePlantillasBanco(false));
    await act(async () => {});

    const estado = result.current as unknown as HookNuevo;
    expect(estado.plantillas).toEqual([]);
    expect(estado.cargandoInicial).toBe(false);
    expect(estado.recargando).toBe(false);
    expect(estado.error).toBe('Error de conexión al cargar');
  });

  it('C1.5 · reintento exitoso tras error limpia error a null, actualiza estados y llena plantillas', async () => {
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') return Promise.reject(new Error('Error inicial'));
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePlantillasBanco(false));
    await act(async () => {});
    expect((result.current as unknown as HookNuevo).error).toBe('Error inicial');

    // Reintento exitoso
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') return Promise.resolve([PLANTILLA_FIXTURE_1]);
      return Promise.resolve([]);
    });

    await act(async () => {
      await result.current.cargarPlantillas();
    });

    const reintento = result.current as unknown as HookNuevo;
    expect(reintento.error).toBeNull();
    expect(reintento.cargandoInicial).toBe(false);
    expect(reintento.recargando).toBe(false);
    expect(reintento.plantillas).toEqual([PLANTILLA_FIXTURE_1]);
  });
});
