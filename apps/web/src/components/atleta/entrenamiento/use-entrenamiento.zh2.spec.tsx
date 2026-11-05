// @vitest-environment happy-dom
/**
 * ZH-2: tests en fase roja para `useEntrenamiento`.
 * Contrato 3:
 * Con perfil Asia/Tokyo, TODAS las peticiones con timezone (semana y carga de sesión)
 * llevan Asia/Tokyo, los POST de iniciar/entrenar-hoy envían timezoneCliente: 'Asia/Tokyo',
 * y la lectura de la caché de rutina de hoy (getCachedRutinaParaHoy) recibe la fecha del día
 * en Tokio (2026-11-04), no la del dispositivo.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { SemanaEntrenamientoProgresoDTO, SesionEntrenamientoDetalleDTO } from '@guachafit/shared';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';

const { authMock, mockGetCachedRutinaParaHoy, mockApi } = vi.hoisted(() => ({
  authMock: {
    user: {
      id: 'alumno-zh2-tokyo',
      email: 'alumno.tokyo@example.com',
      rol: 'alumno',
      zonaHoraria: 'Asia/Tokyo',
    },
    isDemoMode: false,
  },
  mockGetCachedRutinaParaHoy: vi.fn(),
  mockApi: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  }),
}));

vi.mock('../../../context/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    isDemoMode: authMock.isDemoMode,
  }),
}));

vi.mock('../../../lib/offline-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/offline-db')>();
  return {
    ...actual,
    getCachedRutinaParaHoy: (...args: unknown[]) => mockGetCachedRutinaParaHoy(...args),
    leerSemanaCacheada: vi.fn().mockResolvedValue(null),
    guardarSemanaCacheada: vi.fn().mockResolvedValue(undefined),
    hayMutacionesSinEnviarDeGrupo: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    apiClient: mockApi,
    generateIdempotencyKey: () => 'idemp-zh2-test',
  };
});

import { useEntrenamiento } from './use-entrenamiento';

function parsearLlamadasApi(): { url: string; metodo: string; cuerpo: Record<string, unknown> }[] {
  return mockApi.mock.calls.map(([url, opciones]) => {
    let cuerpo: Record<string, unknown> = {};
    const bodyRaw = (opciones as { body?: unknown } | undefined)?.body;
    if (typeof bodyRaw === 'string') {
      try {
        cuerpo = JSON.parse(bodyRaw) as Record<string, unknown>;
      } catch {
        cuerpo = {};
      }
    } else if (bodyRaw && typeof bodyRaw === 'object') {
      cuerpo = bodyRaw as Record<string, unknown>;
    }
    return {
      url: decodeURIComponent(String(url)),
      metodo: ((opciones as { method?: string } | undefined)?.method ?? 'GET').toUpperCase(),
      cuerpo,
    };
  });
}

function crearSesionBase(id = 'sesion-1', bloqueId = 'bloque-1'): SesionEntrenamientoDetalleDTO {
  return {
    id,
    alumnoId: authMock.user.id,
    bloqueId,
    estado: 'planificada' as any,
    fechaProgramada: '2026-11-04',
    ejercicios: [],
    series: [],
  } as unknown as SesionEntrenamientoDetalleDTO;
}

function crearSemanaBase(): SemanaEntrenamientoProgresoDTO {
  return {
    totalBloques: 1,
    bloquesCompletados: 0,
    bloques: [],
  } as unknown as SemanaEntrenamientoProgresoDTO;
}

describe('ZH-2 · useEntrenamiento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
    authMock.isDemoMode = false;
    authMock.user = {
      id: 'alumno-zh2-tokyo',
      email: 'alumno.tokyo@example.com',
      rol: 'alumno',
      zonaHoraria: 'Asia/Tokyo',
    };

    mockGetCachedRutinaParaHoy.mockReset();
    mockGetCachedRutinaParaHoy.mockResolvedValue({
      deHoy: null,
      ultimaDeOtroDia: null,
    });

    mockApi.mockReset();
    mockApi.mockImplementation(async (endpoint: string) => {
      const decoded = decodeURIComponent(endpoint);
      if (decoded.includes('/rutina/semana-actual')) {
        return crearSemanaBase();
      }
      if (decoded.includes('/sesiones/hoy')) {
        return crearSesionBase();
      }
      if (decoded.includes('/entrenar-hoy')) {
        return crearSesionBase('sesion-nueva', 'bloque-1');
      }
      if (decoded.includes('/iniciar')) {
        return crearSesionBase('sesion-iniciada', 'bloque-1');
      }
      return null;
    });

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Asia/Tokyo, las consultas de semana y sesión de hoy solicitan timezone=Asia/Tokyo', async () => {
    renderHook(() => useEntrenamiento());

    await waitFor(() => {
      const llamadas = parsearLlamadasApi();
      const llamadaSemana = llamadas.find((l) => l.url.includes('/rutina/semana-actual'));
      const llamadaSesion = llamadas.find((l) => l.url.includes('/sesiones/hoy'));
      expect(llamadaSemana).toBeDefined();
      expect(llamadaSesion).toBeDefined();
      expect(llamadaSemana?.url).toContain('timezone=Asia/Tokyo');
      expect(llamadaSesion?.url).toContain('timezone=Asia/Tokyo');
    });
  });

  it('con perfil Asia/Tokyo, la lectura offline de caché invoca getCachedRutinaParaHoy con la fecha de Tokio (2026-11-04)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

    renderHook(() => useEntrenamiento());

    await waitFor(() => {
      expect(mockGetCachedRutinaParaHoy).toHaveBeenCalled();
    });

    expect(mockGetCachedRutinaParaHoy).toHaveBeenCalledWith('alumno-zh2-tokyo', '2026-11-04');
  });

  it('con perfil Asia/Tokyo, handleEntrenarBloqueHoy envía timezoneCliente=Asia/Tokyo en el POST', async () => {
    const { result } = renderHook(() => useEntrenamiento());

    await waitFor(() => {
      const llamadas = parsearLlamadasApi();
      expect(llamadas.some((l) => l.url.includes('/sesiones/hoy'))).toBe(true);
    });

    await act(async () => {
      await result.current.handleEntrenarBloqueHoy('bloque-1');
    });

    const llamadas = parsearLlamadasApi();
    const llamadaEntrenar = llamadas.find(
      (l) => l.metodo === 'POST' && l.url.includes('/bloques/bloque-1/entrenar-hoy')
    );
    expect(llamadaEntrenar).toBeDefined();
    expect(llamadaEntrenar?.cuerpo.timezoneCliente).toBe('Asia/Tokyo');
  });

  it('con perfil Asia/Tokyo, handleStartSession envía timezoneCliente=Asia/Tokyo en el POST', async () => {
    const { result } = renderHook(() => useEntrenamiento());

    await waitFor(() => {
      expect(result.current.sesion).toBeTruthy();
    });

    await act(async () => {
      await result.current.handleStartSession();
    });

    const llamadas = parsearLlamadasApi();
    const llamadaIniciar = llamadas.find(
      (l) => l.metodo === 'POST' && l.url.includes('/iniciar')
    );
    expect(llamadaIniciar).toBeDefined();
    expect(llamadaIniciar?.cuerpo.timezoneCliente).toBe('Asia/Tokyo');
  });

  it('regresión Caracas: con perfil America/Caracas las peticiones llevan America/Caracas y la fecha es 2026-11-03', async () => {
    authMock.user = {
      id: 'alumno-zh2-caracas',
      email: 'alumno.caracas@example.com',
      rol: 'alumno',
      zonaHoraria: 'America/Caracas',
    };

    const { result } = renderHook(() => useEntrenamiento());

    await waitFor(() => {
      const llamadas = parsearLlamadasApi();
      const llamadaSemana = llamadas.find((l) => l.url.includes('/rutina/semana-actual'));
      expect(llamadaSemana).toBeDefined();
      expect(llamadaSemana?.url).toContain('timezone=America/Caracas');
    });

    await act(async () => {
      await result.current.handleEntrenarBloqueHoy('bloque-1');
    });

    const llamadas = parsearLlamadasApi();
    const llamadaEntrenar = llamadas.find(
      (l) => l.metodo === 'POST' && l.url.includes('/bloques/bloque-1/entrenar-hoy')
    );
    expect(llamadaEntrenar?.cuerpo.timezoneCliente).toBe('America/Caracas');
  });
});
