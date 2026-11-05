// @vitest-environment happy-dom
/**
 * 11 · EntrenamientoPage.aviso-serie.fiabilidad · correcciones H-01 y H-02.
 *
 * Casos:
 * 1. H-01:
 *    (a) Marcar la serie 1 muestra «Serie 1 completada». Desmarcarla por otra vía que no
 *        sea «Deshacer» (abrir «Ver entrenamiento completo» -> tocar fila compacta de la serie 1
 *        -> «Marcar serie 1 como pendiente») hace desaparecer la franja de inmediato (sin esperar los 6 s).
 *    (b) Al cambiar de bloque/sesión mediante los chips de la semana, la franja de la serie
 *        anterior desaparece en ese render sin esperar el timeout.
 * 2. H-02:
 *    Con una serie 2 cuyo dato es inválido (peso "abc" no representable que hace fallar
 *    validarSerieParaEnviar), marcar la serie 1 (activa el bloqueo) y dentro de los 600 ms
 *    intentar completar la serie 2 NO muestra error inline de esa serie y no llama a
 *    triggerHaptic('warning'). Pasados 600 ms, el mismo intento SÍ muestra el error inline
 *    y llama a triggerHaptic('warning').
 */
import 'fake-indexeddb/auto';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../../lib/haptics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/haptics')>();
  return {
    ...actual,
    triggerHaptic: vi.fn(),
  };
});

let llamadasPutSeries: Array<{ endpoint: string; cuerpo: any }> = [];

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn((endpoint: string, cuerpo: any) => {
        if (endpoint.includes('/series')) {
          llamadasPutSeries.push({ endpoint, cuerpo });
        }
        return Promise.resolve({});
      }),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { triggerHaptic } from '../../lib/haptics';
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

const SESION_ID_1 = 'sesion-aviso-serie-1';
const SESION_ID_2 = 'sesion-aviso-serie-2';

const SEMANA_UN_BLOQUE: SemanaEntrenamientoProgresoDTO = {
  semanaIso: '2026-W41',
  inicioSemana: '2026-10-05',
  finSemana: '2026-10-11',
  totalBloques: 1,
  bloquesCompletados: 0,
  porcentajeCumplimiento: '0.00',
  bloques: [
    {
      bloqueId: 'b-1',
      titulo: 'Día 1: Fuerza',
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

const SEMANA_DOS_BLOQUES: SemanaEntrenamientoProgresoDTO = {
  semanaIso: '2026-W41',
  inicioSemana: '2026-10-05',
  finSemana: '2026-10-11',
  totalBloques: 2,
  bloquesCompletados: 0,
  porcentajeCumplimiento: '0.00',
  bloques: [
    {
      bloqueId: 'b-1',
      titulo: 'Día 1: Fuerza',
      enfoque: 'Fuerza general',
      diaSugerido: 1,
      totalEjercicios: 1,
      completado: false,
      esSugeridoHoy: true,
      estadoSesion: null,
      motivoOmision: null,
    },
    {
      bloqueId: 'b-2',
      titulo: 'Día 2: Hipertrofia',
      enfoque: 'Hipertrofia torso',
      diaSugerido: 2,
      totalEjercicios: 1,
      completado: false,
      esSugeridoHoy: false,
      estadoSesion: null,
      motivoOmision: null,
    },
  ],
  siguienteBloqueSugeridoId: 'b-1',
  esDiaDescansoHoy: false,
  rachaDias: 0,
};

const SESION_BASE_1: SesionEntrenamientoDetalleDTO = {
  id: SESION_ID_1,
  alumnoId: sesionMock.usuario.id,
  bloqueId: 'b-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    {
      id: 'es-1',
      sesionId: SESION_ID_1,
      ejercicioId: 'ej-1',
      orden: 1,
      ejercicio: {
        id: 'ej-1',
        nombre: 'Sentadilla',
        grupoMuscular: 'Piernas',
        activo: true,
        videoUrl: 'https://ejemplo.com/sentadilla.mp4',
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
        {
          id: 's-2',
          ejercicioSesionId: 'es-1',
          numeroSerie: 2,
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

const SESION_BASE_2: SesionEntrenamientoDetalleDTO = {
  id: SESION_ID_2,
  alumnoId: sesionMock.usuario.id,
  bloqueId: 'b-2',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    {
      id: 'es-2',
      sesionId: SESION_ID_2,
      ejercicioId: 'ej-2',
      orden: 1,
      ejercicio: {
        id: 'ej-2',
        nombre: 'Press Militar',
        grupoMuscular: 'Hombros',
        activo: true,
        videoUrl: null,
        createdAtUtc: '2026-10-01T00:00:00.000Z',
      },
      series: [
        {
          id: 's-2-1',
          ejercicioSesionId: 'es-2',
          numeroSerie: 1,
          repsObjetivo: 8,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '40.00',
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

function renderPagina() {
  return render(
    <MemoryRouter>
      <EntrenamientoPage />
    </MemoryRouter>
  );
}

function configurarApiSesion(
  sesion: SesionEntrenamientoDetalleDTO = SESION_BASE_1,
  semana: SemanaEntrenamientoProgresoDTO = SEMANA_UN_BLOQUE,
  sesionBloque2?: SesionEntrenamientoDetalleDTO
) {
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
    const metodo = opciones?.method ?? 'GET';
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
      return Promise.resolve(clonar(semana));
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      if (endpoint.includes('bloqueId=b-2') && sesionBloque2) {
        return Promise.resolve(clonar(sesionBloque2));
      }
      return Promise.resolve(clonar(sesion));
    }
    if (metodo === 'PUT' && endpoint.includes('/series')) {
      const cuerpo = JSON.parse(opciones?.body ?? '{}');
      llamadasPutSeries.push({ endpoint, cuerpo });
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`Llamada inesperada: ${metodo} ${endpoint}`));
  });
}

function buscarAvisoSerie(numeroSerie?: number): HTMLElement | undefined {
  const patron =
    numeroSerie !== undefined
      ? new RegExp(`serie ${numeroSerie} completada`, 'i')
      : /serie \d+ completada/i;
  return screen.queryAllByRole('status').find((el) => patron.test(el.textContent ?? ''));
}

describe('EntrenamientoPage · Aviso de serie · Fiabilidad (H-01 y H-02)', () => {
  beforeEach(async () => {
    sesionMock.isDemoMode = false;
    localStorage.clear();
    await offlineDb.rutinaHoy.clear();
    await offlineDb.outboxMutations.clear();
    await offlineDb.semanaEntrenamiento.clear();
    llamadasPutSeries = [];
    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.put.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    vi.mocked(triggerHaptic).mockClear();
  });

  afterEach(async () => {
    sesionMock.isDemoMode = false;
    await offlineDb.rutinaHoy.clear();
    await offlineDb.outboxMutations.clear();
    await offlineDb.semanaEntrenamiento.clear();
    localStorage.clear();
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('H-01: avisoSerieCompletada derivado y desmarcado por vía distinta a Deshacer', () => {
    it('(a) marcar serie 1 muestra la franja; desmarcarla desde la lista completa la oculta de inmediato sin esperar 6 s', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion();
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      const botonSerie1 = within(seccion).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      });
      fireEvent.click(botonSerie1);

      await waitFor(() => expect(llamadasPutSeries.length).toBeGreaterThan(0));

      // Franja visible tras marcar
      const aviso = buscarAvisoSerie(1);
      expect(aviso).toBeDefined();
      expect(aviso!.textContent).toContain('Serie 1 completada');

      // Abre «Ver entrenamiento completo»
      fireEvent.click(screen.getByRole('button', { name: 'Ver entrenamiento completo' }));

      // Toca la fila compacta de la serie 1 para expandirla
      const filaCompacta = screen.getByRole('button', {
        name: (nombre) => /serie 1/i.test(nombre) && /corregir/i.test(nombre),
      });
      fireEvent.click(filaCompacta);

      // Desmarca la serie 1 pulsando «Marcar serie 1 como pendiente»
      const botonDesmarcar = screen.getByRole('button', {
        name: 'Marcar serie 1 como pendiente',
      });
      fireEvent.click(botonDesmarcar);

      // La franja desaparece DE INMEDIATO (sin necesidad de avanzar 6000 ms)
      expect(buscarAvisoSerie()).toBeUndefined();

      // Confirma que se envió PUT con completada: false
      await waitFor(() => {
        const ultimoPut = llamadasPutSeries[llamadasPutSeries.length - 1];
        expect(ultimoPut.cuerpo.series[0].serieId).toBe('s-1');
        expect(ultimoPut.cuerpo.series[0].completada).toBe(false);
      });
    });

    it('(b) cambiar de bloque/sesión mediante los chips de la semana no muestra la franja de la serie anterior', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion(SESION_BASE_1, SEMANA_DOS_BLOQUES, SESION_BASE_2);
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      const botonSerie1 = within(seccion).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      });
      fireEvent.click(botonSerie1);

      await waitFor(() => expect(llamadasPutSeries.length).toBeGreaterThan(0));

      // Franja visible tras marcar en Día 1
      expect(buscarAvisoSerie(1)).toBeDefined();

      // Cambiar a Día 2 a través de los chips de la semana
      const chipDia2 = screen.getByRole('button', { name: /Día 2/i });
      fireEvent.click(chipDia2);

      // Esperar a que cargue la sesión del bloque 2
      await screen.findByRole('heading', { name: 'Press Militar' });

      // La franja de la serie anterior ya no se ve tras cambiar de sesión
      expect(buscarAvisoSerie()).toBeUndefined();
    });
  });

  describe('H-02: bloqueo de 600 ms protege antes de validación y de hápticos', () => {
    it('intento de completar serie con dato inválido dentro de 600 ms no muestra error inline ni háptico warning; pasados 600 ms sí', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      // Serie 2 con dato inválido: peso "abc" que hace fallar validarSerieParaEnviar
      const sesionConSerie2Invalida = clonar(SESION_BASE_1);
      sesionConSerie2Invalida.ejercicios[0].series[1].pesoKg = 'abc';

      configurarApiSesion(sesionConSerie2Invalida);
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });

      // 1. Marcar serie 1 (activa el bloqueo de 600 ms)
      const botonSerie1 = within(seccion).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      });
      fireEvent.click(botonSerie1);

      await waitFor(() => expect(llamadasPutSeries.length).toBe(1));
      expect(llamadasPutSeries[0].cuerpo.series[0].serieId).toBe('s-1');

      // Avanzar dentro de la ventana de bloqueo (100 ms < 600 ms)
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Serie 2 ahora está en foco; el botón está bloqueado
      const botonSerie2 = within(seccion).getByRole('button', {
        name: 'Marcar serie 2 como completada',
      }) as HTMLButtonElement;
      expect(botonSerie2.disabled).toBe(true);

      // Limpiamos llamadas a triggerHaptic previas (ej. success por marcar serie 1)
      vi.mocked(triggerHaptic).mockClear();

      // Intento de completar serie 2 dentro de los 600 ms
      fireEvent.click(botonSerie2);

      // NO muestra error inline de la serie 2
      expect(screen.queryByText(/Peso inválido/i)).toBeNull();
      // NO llama a triggerHaptic('warning')
      expect(triggerHaptic).not.toHaveBeenCalledWith('warning');
      // No hubo un segundo PUT
      expect(llamadasPutSeries).toHaveLength(1);

      // Avanzar hasta superar los 600 ms (500 ms restantes)
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // El botón ya no está deshabilitado
      expect(botonSerie2.disabled).toBe(false);

      // El mismo intento pasados los 600 ms
      fireEvent.click(botonSerie2);

      // SÍ muestra el error inline de validarSerieParaEnviar
      expect(screen.getByText('Peso inválido: corrige el valor (ej. 28.5)')).toBeTruthy();
      // SÍ llama a triggerHaptic('warning')
      expect(triggerHaptic).toHaveBeenCalledWith('warning');
      // No genera PUT debido a la validación fallida
      expect(llamadasPutSeries).toHaveLength(1);
    });
  });
});
