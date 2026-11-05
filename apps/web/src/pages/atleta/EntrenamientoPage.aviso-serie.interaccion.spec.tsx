// @vitest-environment jsdom
/**
 * 08 · EntrenamientoPage.aviso-serie · contrato E (fase roja).
 *
 * Integración en la página (EntrenamientoPage + use-entrenamiento/use-marcado-serie):
 * (a) Marcar serie 1 muestra role="status" con «Serie 1 completada» y un botón «Deshacer».
 * (b) Inmediatamente después el botón «Marcar serie 2 como completada» está deshabilitado
 *     y un clic sobre él no genera un PUT para la serie 2; tras 600 ms está habilitado
 *     y marcar la serie 2 sustituye la franja por «Serie 2 completada».
 * (c) «Deshacer» tras marcar serie 1: vuelve a pendiente, franja desaparece, cronómetro
 *     de descanso queda cerrado (reposo [data-estado="fab"]) y envía PUT con completada: false.
 * (d) La franja desaparece sola a los 6000 ms (no a los 5999 ms).
 * (e) El bloqueo de 600 ms no impide desmarcar: usar «Deshacer» dentro de los 600 ms funciona.
 * (f) Con matchMedia ausente (no mockeado) el aviso y el bloqueo se comportan con normalidad.
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

const SESION_ID = 'sesion-aviso-serie-1';

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
        {
          id: 's-3',
          ejercicioSesionId: 'es-1',
          numeroSerie: 3,
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
  sesion: SesionEntrenamientoDetalleDTO = SESION_BASE,
  semana: SemanaEntrenamientoProgresoDTO = SEMANA
) {
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
    const metodo = opciones?.method ?? 'GET';
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
      return Promise.resolve(clonar(semana));
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      return Promise.resolve(clonar(sesion));
    }
    if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
      const cuerpo = JSON.parse(opciones?.body ?? '{}');
      llamadasPutSeries.push({ endpoint, cuerpo });
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`Llamada inesperada: ${metodo} ${endpoint}`));
  });
}

function buscarAvisoSerie(numeroSerie?: number): HTMLElement | undefined {
  const patron = numeroSerie !== undefined ? new RegExp(`serie ${numeroSerie} completada`, 'i') : /serie \d+ completada/i;
  return screen.queryAllByRole('status').find((el) => patron.test(el.textContent ?? ''));
}

describe('EntrenamientoPage · Contrato E · Aviso de serie completada y bloqueo de Listo', () => {
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

  it('(a) marcar la serie 1 muestra un role="status" con «Serie 1 completada» y un botón «Deshacer»', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configurarApiSesion();
    renderPagina();

    const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
    const botonSerie1 = within(seccion).getByRole('button', {
      name: 'Marcar serie 1 como completada',
    });
    fireEvent.click(botonSerie1);

    await waitFor(() => expect(llamadasPutSeries.length).toBeGreaterThan(0));

    const aviso = buscarAvisoSerie(1);
    expect(aviso).toBeDefined();
    expect(aviso!.textContent).toContain('Serie 1 completada');
    expect(within(aviso!).getByRole('button', { name: 'Deshacer' })).toBeTruthy();
  });

  it('(b) inmediatamente después el botón «Marcar serie 2 como completada» está deshabilitado y un clic no genera PUT; tras 600 ms se habilita y marcar serie 2 sustituye la franja', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configurarApiSesion();
    renderPagina();

    const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    await waitFor(() => expect(llamadasPutSeries.length).toBe(1));
    expect(llamadasPutSeries[0].cuerpo.series[0].serieId).toBe('s-1');

    // Inmediatamente después, el botón de serie 2 en foco está deshabilitado
    const botonSerie2 = within(seccion).getByRole('button', {
      name: 'Marcar serie 2 como completada',
    }) as HTMLButtonElement;
    expect(botonSerie2.disabled).toBe(true);

    // Un clic sobre él es ignorado y no genera un segundo PUT
    fireEvent.click(botonSerie2);
    expect(llamadasPutSeries).toHaveLength(1);

    // Tras avanzar 600 ms, se vuelve a habilitar
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(botonSerie2.disabled).toBe(false);

    // Marcar la serie 2 ahora funciona y genera su PUT
    fireEvent.click(botonSerie2);
    await waitFor(() => expect(llamadasPutSeries.length).toBe(2));
    expect(llamadasPutSeries[1].cuerpo.series[0].serieId).toBe('s-2');

    // Y sustituye la franja por «Serie 2 completada»
    const avisoSerie2 = buscarAvisoSerie(2);
    expect(avisoSerie2).toBeDefined();
    expect(avisoSerie2!.textContent).toContain('Serie 2 completada');
    expect(buscarAvisoSerie(1)).toBeUndefined();
  });

  it('(c) «Deshacer» tras marcar la serie 1 vuelve la serie a pendiente, oculta la franja, cierra el cronómetro (reposo [data-estado="fab"]) y envía PUT con completada: false', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configurarApiSesion();
    renderPagina();

    const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    await waitFor(() => expect(llamadasPutSeries.length).toBeGreaterThan(0));

    // Aviso visible y cronómetro abierto (en píldora con role="timer")
    const aviso = buscarAvisoSerie(1);
    expect(aviso).toBeDefined();
    expect(screen.queryByRole('timer')).not.toBeNull();

    // Pulsar "Deshacer"
    const botonDeshacer = within(aviso!).getByRole('button', { name: 'Deshacer' });
    fireEvent.click(botonDeshacer);

    // En modo foco la serie 1 vuelve a ser la serie actual pendiente
    expect(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    ).toBeTruthy();

    // La franja de aviso desaparece
    expect(buscarAvisoSerie()).toBeUndefined();

    // El cronómetro se cierra y el botón flotante vuelve al estado de reposo [data-estado="fab"]
    expect(screen.queryByRole('timer')).toBeNull();
    expect(document.querySelector('[data-estado="fab"]')).not.toBeNull();

    // Se envió PUT con completada: false para la serie 1
    await waitFor(() => {
      const ultimoPut = llamadasPutSeries[llamadasPutSeries.length - 1];
      expect(ultimoPut.cuerpo.series[0].serieId).toBe('s-1');
      expect(ultimoPut.cuerpo.series[0].completada).toBe(false);
    });
  });

  it('(d) la franja desaparece sola a los 6000 ms (no a los 5999 ms)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configurarApiSesion();
    renderPagina();

    const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    expect(buscarAvisoSerie(1)).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(5999);
    });
    expect(buscarAvisoSerie(1)).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(buscarAvisoSerie(1)).toBeUndefined();
  });

  it('(e) el bloqueo no impide desmarcar: marcar y dentro de los 600 ms usar «Deshacer» funciona', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configurarApiSesion();
    renderPagina();

    const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    await waitFor(() => expect(llamadasPutSeries.length).toBeGreaterThan(0));

    // Avanzar solo 100 ms (dentro de los 600 ms de bloqueo)
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const aviso = buscarAvisoSerie(1);
    expect(aviso).toBeDefined();

    const botonDeshacer = within(aviso!).getByRole('button', { name: 'Deshacer' });
    fireEvent.click(botonDeshacer);

    // La serie se desmarca con éxito sin quedar bloqueada
    expect(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    ).toBeTruthy();
    expect(buscarAvisoSerie()).toBeUndefined();

    await waitFor(() => {
      const ultimoPut = llamadasPutSeries[llamadasPutSeries.length - 1];
      expect(ultimoPut.cuerpo.series[0].serieId).toBe('s-1');
      expect(ultimoPut.cuerpo.series[0].completada).toBe(false);
    });
  });

  it('(f) con matchMedia ausente no cambia nada de lo anterior (los tests no mockean matchMedia)', async () => {
    expect(window.matchMedia).toBeUndefined();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    configurarApiSesion();
    renderPagina();

    const seccion = await screen.findByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    await waitFor(() => expect(llamadasPutSeries.length).toBeGreaterThan(0));

    const aviso = buscarAvisoSerie(1);
    expect(aviso).toBeDefined();

    const botonSerie2 = within(seccion).getByRole('button', {
      name: 'Marcar serie 2 como completada',
    }) as HTMLButtonElement;
    expect(botonSerie2.disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(botonSerie2.disabled).toBe(false);
  });
});
