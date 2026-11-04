// @vitest-environment jsdom
/**
 * 08 · cronometro-fab · tests de integración para EntrenamientoPage (contrato C).
 *
 * Superficie probada:
 * - cronometroVisible: sesión en progreso y sin modales propios abiertos.
 * - FAB visible en sesión en curso (modo foco y lista completa).
 * - FAB ausente en: vista previa, carga, error, offline sin caché, sin sesión, COMPLETADA, OMITIDA, bloqueo.
 * - Modales: ocultamiento del FAB y del timer durante modales (finalizar, cierre vacío, video técnica, sync cola);
 *   el cronómetro sigue corriendo mientras está oculto.
 * - Tocar FAB: abre panel en pausa (1:30 sin avanzar), finEnMs: null en localStorage, invoca desbloquearAudio.
 * - Presets / reanudar arrancan la cuenta en marcha.
 * - Marcar serie abre píldora en marcha con descanso de la serie.
 * - Botones X (píldora y panel) eliminan role="timer" y dejan FAB visible.
 * - Contenedor raíz recibe pb-20 según cronometroVisible.
 * - Defecto 2 (regresión): FAB + sumar 15s realiza 0 peticiones PUT; modo demo no escribe en localStorage.
 */
import 'fake-indexeddb/auto';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  CODIGO_ALUMNO_BLOQUEADO,
  EstadoAlumno,
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

import { ApiError, apiClient } from '../../lib/api-client';
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

const SESION_ID = 'sesion-cronometro-fab-spec-1';

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

function renderPagina() {
  return render(
    <MemoryRouter>
      <EntrenamientoPage />
    </MemoryRouter>
  );
}

function configurarApiSesion(
  sesion: SesionEntrenamientoDetalleDTO | null,
  semana: SemanaEntrenamientoProgresoDTO = SEMANA
) {
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
    const metodo = opciones?.method ?? 'GET';
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
      return Promise.resolve(clonar(semana));
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      if (!sesion) return Promise.reject(new Error('Sesión no encontrada'));
      return Promise.resolve(clonar(sesion));
    }
    if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
      const cuerpo = JSON.parse(opciones?.body ?? '{}');
      llamadasPutSeries.push({ endpoint, cuerpo });
      return Promise.resolve({});
    }
    if (metodo === 'PATCH' && endpoint === `/sesiones/${SESION_ID}/finalizar`) {
      return Promise.resolve({
        ...(sesion ?? SESION_BASE),
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
      });
    }
    return Promise.reject(new Error(`Llamada inesperada: ${metodo} ${endpoint}`));
  });
}

describe('EntrenamientoPage · Cronómetro FAB flotante (contrato C)', () => {
  beforeEach(async () => {
    sesionMock.isDemoMode = false;
    localStorage.clear();
    await offlineDb.rutinaHoy.clear();
    await offlineDb.outboxMutations.clear();
    await offlineDb.semanaEntrenamiento.clear();
    mockDesbloquearAudio.mockClear();
    llamadasPutSeries = [];
    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.put.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
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

  describe('Visibilidad del FAB según el ciclo de vida de la sesión', () => {
    it('el FAB está visible en sesión EN_PROGRESO, tanto en modo foco como en lista completa', async () => {
      configurarApiSesion(SESION_BASE);
      renderPagina();

      await screen.findByRole('region', { name: 'Entrenamiento en foco' });

      // En modo foco (por defecto): el botón debe existir y pertenecer al ancla [data-estado="fab"]
      const fabFoco = await screen.findByRole(
        'button',
        { name: 'Abrir cronómetro de descanso' },
        { timeout: 5000 }
      );
      expect(fabFoco).toBeTruthy();
      expect(fabFoco.closest('[data-estado="fab"]')).not.toBeNull();

      // Cambiar a lista completa
      const botonLista = screen.getByRole('button', { name: /ver entrenamiento completo/i });
      fireEvent.click(botonLista);

      const fabLista = await screen.findByRole('button', {
        name: 'Abrir cronómetro de descanso',
      });
      expect(fabLista).toBeTruthy();
      expect(fabLista.closest('[data-estado="fab"]')).not.toBeNull();
    });

    it('el FAB está ausente en vista previa (sesión PLANIFICADA; el CTA Iniciar entrenamiento sí está)', async () => {
      const sesionPlanificada: SesionEntrenamientoDetalleDTO = {
        ...SESION_BASE,
        estado: EstadoSesion.PLANIFICADA,
      };
      configurarApiSesion(sesionPlanificada);

      renderPagina();

      // Esperar primero a que la vista previa esté visible
      const ctaIniciar = await screen.findByRole(
        'button',
        { name: /iniciar entrenamiento/i },
        { timeout: 5000 }
      );
      expect(ctaIniciar).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });

    it('el FAB está ausente en estado de carga', async () => {
      // API que nunca resuelve de inmediato
      mockApi.mockReturnValue(new Promise(() => {}));
      renderPagina();

      // Esperar a que exista el indicador de carga
      const estadoCarga = await screen.findByRole('status');
      expect(estadoCarga).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });

    it('el FAB está ausente en estado de error de carga', async () => {
      mockApi.mockRejectedValue(
        new ApiError(500, {
          type: 'https://api.guachafit.com/errors/internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Fallo de red',
          timestampUtc: '2026-10-11T00:00:00.000Z',
        } as any)
      );
      renderPagina();

      // Esperar primero a la alerta y heading propios del error de carga
      const alerta = await screen.findByRole('alert');
      expect(alerta).toBeTruthy();
      const tituloError = await screen.findByRole('heading', {
        level: 3,
        name: 'No pudimos cargar tu entrenamiento',
      });
      expect(tituloError).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });

    it('el FAB está ausente en estado offline sin caché', async () => {
      const spyOnLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      renderPagina();

      // Esperar primero al estado de offline sin caché
      const headingOffline = await screen.findByRole('heading', {
        level: 3,
        name: 'Sin conexión',
      });
      expect(headingOffline).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
      spyOnLine.mockRestore();
    });

    it('el FAB está ausente sin sesión asignada', async () => {
      const semanaVacia: SemanaEntrenamientoProgresoDTO = {
        ...SEMANA,
        totalBloques: 0,
        bloques: [],
        siguienteBloqueSugeridoId: null,
      };
      configurarApiSesion(null, semanaVacia);
      renderPagina();

      // Esperar primero al heading propio de sin sesión
      const headingSinSesion = await screen.findByRole('heading', {
        level: 3,
        name: 'Aún no tienes rutina asignada para hoy',
      });
      expect(headingSinSesion).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });

    it('el FAB está ausente en sesión COMPLETADA', async () => {
      const sesionCompletada: SesionEntrenamientoDetalleDTO = {
        ...SESION_BASE,
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
      };
      configurarApiSesion(sesionCompletada);
      renderPagina();

      // Esperar primero a que cargue la sesión y confirme el estado completado con su texto real
      expect(
        await screen.findByText('¡Sesión de entrenamiento finalizada con éxito!')
      ).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });

    it('el FAB está ausente en sesión OMITIDA', async () => {
      const sesionOmitida: SesionEntrenamientoDetalleDTO = {
        ...SESION_BASE,
        estado: EstadoSesion.OMITIDA,
        porcentajeCumplimiento: '0.00',
      };
      configurarApiSesion(sesionOmitida);
      renderPagina();

      // Esperar primero a que cargue la sesión y confirme el estado omitido con su texto real
      expect(
        await screen.findByText('Día registrado como incompleto')
      ).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });

    it('el FAB está ausente cuando el alumno tiene bloqueo de cuenta (RF-012)', async () => {
      mockApi.mockRejectedValue(
        new ApiError(403, {
          type: 'https://api.guachafit.com/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Cuenta inactiva',
          timestampUtc: '2026-10-11T00:00:00.000Z',
          code: CODIGO_ALUMNO_BLOQUEADO,
          estado: EstadoAlumno.INACTIVO_PAUSADO,
          motivo: 'ESTADO_ACTIVACION',
        } as any)
      );

      renderPagina();

      // Esperar primero al panel de bloqueo
      const tituloBloqueo = await screen.findByRole('heading', { level: 1 });
      expect(tituloBloqueo).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
    });
  });

  describe('Ocultamiento durante modales y continuidad en segundo plano', () => {
    it('modal de finalizar sesión: desaparecen FAB y timer; al cerrar vuelven', async () => {
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      fireEvent.click(
        within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
      );

      // El timer se abrió en píldora
      await screen.findByRole('timer');

      // Abrir modal de finalizar
      const botonFinalizar = screen.getByRole('button', { name: 'Finalizar entrenamiento' });
      fireEvent.click(botonFinalizar);

      await screen.findByRole('dialog', { name: /finalizar entrenamiento/i });

      // Durante el modal abierto no están ni FAB ni timer
      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
      expect(screen.queryByRole('timer')).toBeNull();

      // Cerrar modal
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sin finalizar' }));

      // Vuelven a estar presentes
      await waitFor(() => {
        expect(screen.getByRole('timer')).toBeTruthy();
      });
    });

    it('modal de cierre vacío: desaparecen FAB y timer; al cerrar vuelven', async () => {
      configurarApiSesion(SESION_BASE);
      renderPagina();

      await screen.findByRole('region', { name: 'Entrenamiento en foco' });

      // Abrir finalizar sin marcar series abre el modal de cierre vacío
      const botonFinalizar = screen.getByRole('button', { name: 'Finalizar entrenamiento' });
      fireEvent.click(botonFinalizar);

      await screen.findByRole('dialog', { name: /no has marcado ninguna serie/i });

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
      expect(screen.queryByRole('timer')).toBeNull();

      // Cerrar modal
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => {
        const fab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
        expect(fab).toBeTruthy();
        expect(fab.closest('[data-estado="fab"]')).not.toBeNull();
      });
    });

    it('modal de video de técnica: desaparecen FAB y timer; al cerrar vuelven', async () => {
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      const botonVideo = within(seccion).getByRole('button', {
        name: 'Ver técnica de Sentadilla',
      });
      fireEvent.click(botonVideo);

      await screen.findByRole('dialog', { name: /técnica del ejercicio/i });

      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
      expect(screen.queryByRole('timer')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar video demostrativo' }));

      await waitFor(() => {
        const fab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
        expect(fab).toBeTruthy();
        expect(fab.closest('[data-estado="fab"]')).not.toBeNull();
      });
    });

    it('el cronómetro sigue corriendo mientras está oculto por un modal y muestra el tiempo avanzado al reaparecer', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      fireEvent.click(
        within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
      );

      await screen.findByRole('timer');

      // Abrir video
      const botonVideo = within(seccion).getByRole('button', {
        name: 'Ver técnica de Sentadilla',
      });
      fireEvent.click(botonVideo);

      await screen.findByRole('dialog', { name: /técnica del ejercicio/i });
      expect(screen.queryByRole('timer')).toBeNull();

      // Avanzar 20 segundos con el modal abierto
      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });

      // Cerrar modal
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar video demostrativo' }));

      // Al reaparecer el timer refleja el tiempo avanzado (de 1:30 bajó a ~1:10)
      const timer = await screen.findByRole('timer');
      expect(timer.textContent).toContain('1:10');
    });
  });

  describe('Interacción con FAB: apertura en pausa, panel directo y persistencia', () => {
    it('tocar el FAB abre el panel en pausa, el reloj muestra 1:30 y no avanza, localStorage guarda finEnMs: null y llama a desbloquearAudio', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const botonFab = await screen.findByRole('button', {
        name: 'Abrir cronómetro de descanso',
      });

      mockDesbloquearAudio.mockClear();
      fireEvent.click(botonFab);

      // Aparece el panel directamente con botón «Reanudar descanso»
      const botonReanudar = await screen.findByRole('button', { name: 'Reanudar descanso' });
      expect(botonReanudar).toBeTruthy();

      // El reloj muestra 1:30
      const timer = screen.getByRole('timer');
      expect(timer.textContent).toContain('1:30');

      // Avanzar 3000 ms: el tiempo NO avanza porque está en pausa
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(timer.textContent).toContain('1:30');

      // localStorage guarda la clave con finEnMs: null (en pausa)
      const claveStorage = `guachafit_cronometro_${SESION_ID}`;
      const valorStorage = localStorage.getItem(claveStorage);
      expect(valorStorage).not.toBeNull();
      const datosStorage = JSON.parse(valorStorage!);
      expect(datosStorage.finEnMs).toBeNull();
      expect(datosStorage.pausadoRestanteMs).toBe(90_000);

      // Se llamó a desbloquearAudio
      expect(mockDesbloquearAudio).toHaveBeenCalled();

      // Pulsar «Reanudar descanso» arranca la cuenta
      fireEvent.click(botonReanudar);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(timer.textContent).toContain('1:28');
    });

    it('al tocar el FAB y elegir un preset («Descanso de 2 min») arranca la cuenta en marcha', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const botonFab = await screen.findByRole('button', {
        name: 'Abrir cronómetro de descanso',
      });
      fireEvent.click(botonFab);

      const preset2Min = await screen.findByRole('button', { name: 'Descanso de 2 min' });
      fireEvent.click(preset2Min);

      const timer = screen.getByRole('timer');
      expect(timer.textContent).toContain('2:00');

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(timer.textContent).toContain('1:58');
    });

    it('marcar una serie sigue abriendo la píldora EN MARCHA con el descanso de la serie', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      fireEvent.click(
        within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
      );

      // Abre en píldora con «Expandir cronómetro» y «Pausar descanso» (en marcha)
      await screen.findByRole('button', { name: 'Expandir cronómetro' });
      expect(screen.getByRole('button', { name: 'Pausar descanso' })).toBeTruthy();

      const timer = screen.getByRole('timer');
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(timer.textContent).toContain('1:28');
    });

    it('X de la píldora y X del panel dejan queryByRole("timer") en null y el FAB presente', async () => {
      configurarApiSesion(SESION_BASE);
      renderPagina();

      // Caso 1: X de la píldora tras marcar serie
      const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
      fireEvent.click(
        within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
      );

      const botonCerrarPildora = await screen.findByRole('button', {
        name: 'Cerrar cronómetro de descanso',
      });
      fireEvent.click(botonCerrarPildora);

      await waitFor(() => {
        expect(screen.queryByRole('timer')).toBeNull();
        const fab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
        expect(fab).toBeTruthy();
        expect(fab.closest('[data-estado="fab"]')).not.toBeNull();
      });

      // Caso 2: X del panel tras abrir FAB
      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      fireEvent.click(botonFab);

      const botonCerrarPanel = await screen.findByRole('button', { name: 'Cerrar cronómetro' });
      fireEvent.click(botonCerrarPanel);

      await waitFor(() => {
        expect(screen.queryByRole('timer')).toBeNull();
        const fab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
        expect(fab).toBeTruthy();
        expect(fab.closest('[data-estado="fab"]')).not.toBeNull();
      });
    });
  });

  describe('Padding inferior reactivo en contenedor raíz (pb-20 según cronometroVisible)', () => {
    it('el contenedor raíz recibe pb-20 cuando cronometroVisible es true, y no si es false', async () => {
      configurarApiSesion(SESION_BASE);
      const { container } = renderPagina();

      await screen.findByRole('region', { name: 'Entrenamiento en foco' });

      // Con sesión en progreso y sin modales (cronometroVisible=true), el contenedor raíz lleva pb-20
      const raiz = container.firstElementChild as HTMLElement;
      expect(raiz.className).toContain('pb-20');
    });

    it('el contenedor raíz NO lleva pb-20 en vista previa (cronometroVisible=false)', async () => {
      configurarApiSesion({ ...SESION_BASE, estado: EstadoSesion.PLANIFICADA });
      const { container } = renderPagina();

      await screen.findByRole('button', { name: /iniciar entrenamiento/i });

      const raiz = container.firstElementChild as HTMLElement;
      expect(raiz.className).not.toContain('pb-20');
    });
  });

  describe('Defecto 2 y Modo demo', () => {
    it('un descanso libre abierto con el FAB y luego «Sumar 15 segundos» 4 veces emite CERO peticiones PUT', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      configurarApiSesion(SESION_BASE);
      renderPagina();

      const botonFab = await screen.findByRole('button', {
        name: 'Abrir cronómetro de descanso',
      });
      fireEvent.click(botonFab);

      const botonSumar = await screen.findByRole('button', { name: 'Sumar 15 segundos' });
      fireEvent.click(botonSumar);
      fireEvent.click(botonSumar);
      fireEvent.click(botonSumar);
      fireEvent.click(botonSumar);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      const llamadasDescanso = llamadasPutSeries.filter(
        (l) => l.cuerpo.series?.[0]?.descansoSegundos !== undefined
      );
      expect(llamadasDescanso).toHaveLength(0);
    });

    it('en modo demo no escribe en localStorage al abrir el FAB', async () => {
      sesionMock.isDemoMode = true;
      renderPagina();

      const botonIniciar = await screen.findByRole(
        'button',
        { name: /Iniciar entrenamiento/i },
        { timeout: 5000 }
      );
      fireEvent.click(botonIniciar);

      await screen.findByRole(
        'region',
        { name: 'Entrenamiento en foco' },
        { timeout: 5000 }
      );

      const botonFab = await screen.findByRole(
        'button',
        { name: 'Abrir cronómetro de descanso' },
        { timeout: 5000 }
      );
      fireEvent.click(botonFab);

      await screen.findByRole('button', { name: 'Reanudar descanso' });

      const claves = Object.keys(localStorage).filter((k) =>
        k.startsWith('guachafit_cronometro_')
      );
      expect(claves).toHaveLength(0);
    });
  });
});
