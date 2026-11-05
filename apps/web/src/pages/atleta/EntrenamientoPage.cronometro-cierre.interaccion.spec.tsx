// @vitest-environment happy-dom
/**
 * 06 · entrenamiento-ux · tests de robustez para EntrenamientoPage:
 * - Cierre del cronómetro al terminar la sesión (COMPLETADA / OMITIDA y modal de finalizar).
 * - Desbloqueo de audio al pulsar «Sumar 15 segundos» y «Restar 15 segundos».
 * - Resiliencia ante copia local corrupta en offlineDb.rutinaHoy (ejercicios undefined).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  EstadoSesion,
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
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: sesionMock.isDemoMode }),
}));

const mockDesbloquearAudio = vi.fn();
vi.mock('../../lib/aviso-descanso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/aviso-descanso')>();
  return {
    ...actual,
    desbloquearAudio: () => {
      mockDesbloquearAudio();
      return actual.desbloquearAudio();
    },
  };
});

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

import { apiClient } from '../../lib/api-client';
import { offlineDb } from '../../lib/offline-db';
import { EntrenamientoPage } from './EntrenamientoPage';
import { clonar } from './entrenamiento.spec-helper';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

const SESION_ID = 'sesion-cierre-spec-1';

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

const SESION_BASE: SesionEntrenamientoDetalleDTO = {
  id: SESION_ID,
  alumnoId: sesionMock.usuario.id,
  bloqueId: 'b-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
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

describe('EntrenamientoPage · Cierre de cronómetro, audio y robustez de carga', () => {
  beforeEach(async () => {
    sesionMock.isDemoMode = false;
    localStorage.clear();
    await offlineDb.rutinaHoy.clear();
    await offlineDb.outboxMutations.clear();
    mockDesbloquearAudio.mockReset();

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();
  });

  afterEach(async () => {
    cleanup();
    await offlineDb.rutinaHoy.clear();
    await offlineDb.outboxMutations.clear();
    vi.restoreAllMocks();
  });

  const configurarApiSesion = (sesionDevuelta: SesionEntrenamientoDetalleDTO) => {
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
      const metodo = opciones?.method ?? 'GET';
      if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
        return Promise.resolve(clonar(SEMANA));
      }
      if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
        return Promise.resolve(clonar(sesionDevuelta));
      }
      if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
        return Promise.resolve({});
      }
      if (metodo === 'PATCH' && endpoint === `/sesiones/${SESION_ID}/finalizar`) {
        return Promise.resolve({
          ...sesionDevuelta,
          estado: EstadoSesion.COMPLETADA,
          porcentajeCumplimiento: '100.00',
        });
      }
      return Promise.reject(new Error(`Llamada inesperada: ${metodo} ${endpoint}`));
    });
  };

  describe('Cierre al terminar la sesión (contrato 5a y 5b)', () => {
    it('5a (COMPLETADA): con sesión del servidor COMPLETADA y cronómetro en localStorage, role="timer" no aparece y se elimina la clave', async () => {
      const claveStorage = `guachafit_cronometro_${SESION_ID}`;
      localStorage.setItem(
        claveStorage,
        JSON.stringify({
          v: 1,
          sesionId: SESION_ID,
          serieId: 's-1',
          duracionMs: 90_000,
          finEnMs: Date.now() + 60_000,
          pausadoRestanteMs: null,
          notificadoFin: false,
          actualizadoEnMs: Date.now(),
        })
      );

      const sesionCompletada: SesionEntrenamientoDetalleDTO = {
        ...SESION_BASE,
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
      };
      configurarApiSesion(sesionCompletada);

      render(<EntrenamientoPage />);

      await screen.findByText('¡Sesión de entrenamiento finalizada con éxito!');

      await waitFor(() => {
        expect(localStorage.getItem(claveStorage)).toBeNull();
      });
      expect(screen.queryByRole('timer')).toBeNull();
    });

    it('5a (OMITIDA): con sesión del servidor OMITIDA y cronómetro en localStorage, role="timer" no aparece y se elimina la clave', async () => {
      const claveStorage = `guachafit_cronometro_${SESION_ID}`;
      localStorage.setItem(
        claveStorage,
        JSON.stringify({
          v: 1,
          sesionId: SESION_ID,
          serieId: 's-1',
          duracionMs: 90_000,
          finEnMs: Date.now() + 60_000,
          pausadoRestanteMs: null,
          notificadoFin: false,
          actualizadoEnMs: Date.now(),
        })
      );

      const sesionOmitida: SesionEntrenamientoDetalleDTO = {
        ...SESION_BASE,
        estado: EstadoSesion.OMITIDA,
        porcentajeCumplimiento: '0.00',
      };
      configurarApiSesion(sesionOmitida);

      render(<EntrenamientoPage />);

      await screen.findByText('Día registrado como incompleto');

      await waitFor(() => {
        expect(localStorage.getItem(claveStorage)).toBeNull();
      });
      expect(screen.queryByRole('timer')).toBeNull();
    });

    it('5b: con sesión en progreso, marcar última serie abre cronómetro; confirmar finalizar elimina widget y clave', async () => {
      const claveStorage = `guachafit_cronometro_${SESION_ID}`;
      configurarApiSesion(SESION_BASE);

      render(<EntrenamientoPage />);

      const seccion = await screen.findByRole(
        'region',
        { name: 'Entrenamiento en foco' },
        { timeout: 5000 }
      );

      const botonMarcar = within(seccion).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      });
      fireEvent.click(botonMarcar);

      // Abre el widget con role="timer" y persiste en localStorage
      const timer = await screen.findByRole('timer', undefined, { timeout: 5000 });
      expect(timer).toBeTruthy();
      expect(localStorage.getItem(claveStorage)).not.toBeNull();

      // Abrir modal de finalización
      const botonAbrirFinalizar = screen.getByRole('button', { name: /finalizar entrenamiento/i });
      fireEvent.click(botonAbrirFinalizar);

      // Confirmar en el modal «Finalizar»
      const botonConfirmar = screen.getByRole('button', {
        name: /guardar y enviar a mi entrenador/i,
      });
      fireEvent.click(botonConfirmar);

      // El widget debe desaparecer y la clave de localStorage eliminarse
      await waitFor(() => {
        expect(screen.queryByRole('timer')).toBeNull();
        expect(localStorage.getItem(claveStorage)).toBeNull();
      });
    });
  });

  describe('Audio (desbloquearAudio)', () => {
    it('pulsar «Sumar 15 segundos» y «Restar 15 segundos» invoca desbloquearAudio', async () => {
      configurarApiSesion(SESION_BASE);

      render(<EntrenamientoPage />);

      // Abrir cronómetro desde el FAB (abre directamente el panel expandido)
      const botonFab = await screen.findByRole('button', {
        name: 'Abrir cronómetro de descanso',
      });
      fireEvent.click(botonFab);

      mockDesbloquearAudio.mockClear();

      const botonSumar = await screen.findByRole('button', { name: 'Sumar 15 segundos' });
      fireEvent.click(botonSumar);
      expect(mockDesbloquearAudio).toHaveBeenCalled();

      mockDesbloquearAudio.mockClear();

      const botonRestar = await screen.findByRole('button', { name: 'Restar 15 segundos' });
      fireEvent.click(botonRestar);
      expect(mockDesbloquearAudio).toHaveBeenCalled();
    });
  });

  describe('Copia local corrupta (contrato 2 y 5)', () => {
    it('con un registro en offlineDb.rutinaHoy cuyo sesion.ejercicios es undefined, la página muestra la sesión del servidor y NO error de carga', async () => {
      await offlineDb.rutinaHoy.put({
        id: SESION_ID,
        alumnoId: sesionMock.usuario.id,
        fechaProgramada: '2026-10-11',
        sesion: {
          id: SESION_ID,
          alumnoId: sesionMock.usuario.id,
          // ejercicios es undefined de forma irrecuperable
        } as any,
        updatedAt: Date.now(),
      });

      configurarApiSesion(SESION_BASE);

      render(<EntrenamientoPage />);

      // Debe mostrar la sesión válida del servidor (ejercicio Sentadilla)
      expect(await screen.findByText('Sentadilla', undefined, { timeout: 5000 })).toBeTruthy();

      // No debe mostrar el estado de error de carga
      expect(screen.queryByText(/no pudimos cargar tu entrenamiento/i)).toBeNull();
    });
  });
});
