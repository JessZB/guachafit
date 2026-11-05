// @vitest-environment happy-dom
/**
 * Lote E4 (RF-001) · caso de página SIN modo demo: inicio rechazado con 4xx (H1/H6).
 *
 * Montaje:
 * - `useAuth` con `isDemoMode: false`: la página carga de verdad y permite el POST de inicio.
 * - `apiClient` mockeado (patrón de los specs de interacción): GET de la semana y GET de la
 *   sesión de hoy devuelven fixtures PLANIFICADOS; POST `/sesiones/{id}/iniciar` rechaza con un
 *   `ApiError` real del módulo (409, 4xx de datos: no se encola, la página revierte).
 * - `fake-indexeddb/auto`: `offline-db`/`offline-sync` se importan a nivel de módulo; la página
 *   cachea la sesión y la semana en Dexie al cargar.
 *
 * Lo que fija el contrato (H1): tras el rechazo la vista previa sigue en pantalla y el mensaje
 * del error se muestra DENTRO de la sección "Tu plan de hoy", junto al botón que lo disparó.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  EstadoSesion,
  type ProblemDetails,
  type SemanaEntrenamientoProgresoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({
  usuario: {
    id: 'a3333333-3333-4333-8333-333333333333',
    email: 'alumna@example.com',
    rol: 'alumno',
    modalidad: 'remoto',
    periodicidadAntropometria: null as string | null,
    antropometriaInicio: null as string | null,
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: false }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { ApiError, apiClient } from '../../lib/api-client';
import { EntrenamientoPage } from './EntrenamientoPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

/** Id de la sesión de hoy devuelta por el mock; el POST de inicio debe apuntarle a él. */
const SESION_ID = 'sesion-hoy-1';
const MENSAJE_RECHAZO = 'No se pudo iniciar la sesión';

const PROBLEMA_409: ProblemDetails = {
  type: 'https://api.guachafit.com/errors/conflicto-inicio',
  title: 'Conflicto al iniciar la sesión',
  status: 409,
  detail: 'La sesión ya no puede iniciarse en su estado actual.',
  timestampUtc: '2026-10-11T20:00:00.000Z',
};

const SEMANA: SemanaEntrenamientoProgresoDTO = {
  semanaIso: '2026-W41',
  inicioSemana: '2026-10-05',
  finSemana: '2026-10-11',
  totalBloques: 1,
  bloquesCompletados: 0,
  porcentajeCumplimiento: '0.00',
  bloques: [
    {
      bloqueId: 'b-1',
      titulo: 'Día 1 (Lunes): Fuerza',
      enfoque: 'Fuerza general',
      diaSugerido: 1,
      totalEjercicios: 1,
      completado: false,
      esSugeridoHoy: true,
      estadoSesion: null,
      motivoOmision: null,
    },
  ],
  siguienteBloqueSugeridoId: 'b-1',
  esDiaDescansoHoy: false,
  rachaDias: 0,
};

const SESION_HOY: SesionEntrenamientoDetalleDTO = {
  id: SESION_ID,
  alumnoId: sesionMock.usuario.id,
  bloqueId: 'b-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.PLANIFICADA,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    {
      id: 'es-1',
      sesionId: SESION_ID,
      ejercicioId: 'ej-1',
      orden: 1,
      ejercicio: {
        id: 'ej-1',
        nombre: 'Sentadilla',
        grupoMuscular: 'Piernas',
        activo: true,
        createdAtUtc: '2026-10-01T00:00:00.000Z',
      },
      series: [
        {
          id: 's-1',
          ejercicioSesionId: 'es-1',
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '60.00',
          rpe: null,
          descansoSegundos: 90,
          completada: false,
        },
      ],
    },
  ],
  createdAtUtc: '2026-10-01T00:00:00.000Z',
  updatedAtUtc: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    const metodo = opciones?.method ?? 'GET';
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
      return Promise.resolve(SEMANA);
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      return Promise.resolve(SESION_HOY);
    }
    if (metodo === 'POST' && endpoint === `/sesiones/${SESION_ID}/iniciar`) {
      // ApiError real del módulo (spread del actual en el mock): 409 = rechazo de datos.
      return Promise.reject(new ApiError(409, PROBLEMA_409, MENSAJE_RECHAZO));
    }
    return Promise.reject(new Error(`Llamada inesperada en este spec: ${metodo} ${endpoint}`));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EntrenamientoPage · inicio rechazado con 4xx sin modo demo (H1)', () => {
  it('con un 4xx al iniciar, la vista previa sigue y el error se muestra dentro de "Tu plan de hoy"', async () => {
    render(<EntrenamientoPage />);

    // La sesión de hoy llega PLANIFICADA: se pinta la vista previa. La cadena de carga pasa por
    // Dexie (fake-indexeddb): con la suite completa en paralelo, 1 s por defecto no alcanza.
    await screen.findByRole('heading', { name: 'Tu plan de hoy' }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar entrenamiento' }));

    // El POST falla con 4xx: la página revierte y la vista previa reaparece con el error dentro.
    const seccion = await screen.findByRole('region', { name: 'Tu plan de hoy' }, { timeout: 5000 });
    const alerta = await within(seccion).findByRole('alert', undefined, { timeout: 5000 });

    expect(alerta.textContent).toContain(MENSAJE_RECHAZO);
    // Sin banner duplicado en la parte superior: un único aviso con ese texto.
    expect(screen.getAllByText(MENSAJE_RECHAZO)).toHaveLength(1);
  });
});
