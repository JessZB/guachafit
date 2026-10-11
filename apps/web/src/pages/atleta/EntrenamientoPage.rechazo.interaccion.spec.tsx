// @vitest-environment jsdom
/**
 * Lote E5 (RF-001) · validación de las correcciones de la revisión 29 · rechazo 4xx de una serie
 * SIN modo demo (H1/H2): la sesión de hoy llega EN_PROGRESO y `PUT /sesiones/{id}/series`
 * responde con un `ApiError` real (409).
 *
 * Montaje (patrón de `EntrenamientoPage.inicio.interaccion.spec.tsx`):
 * - `useAuth` con `isDemoMode: false`: la página carga de verdad y permite el PUT de series.
 * - `apiClient` mockeado: GET de la semana y GET de la sesión de hoy devuelven fixtures; el PUT
 *   de series rechaza con un 4xx de datos (no se encola, la página revierte).
 * - `fake-indexeddb/auto`: `offline-db`/`offline-sync` se importan a nivel de módulo; la página
 *   cachea la sesión en Dexie al cargar y antes de enviar cada serie.
 *
 * Lo que fija el contrato (H1/H2):
 * - Serie EN FOCO rechazada: vuelve a pendiente, el foco vuelve a ella y su `role="alert"`
 *   inline muestra el mensaje del servidor; el cronómetro de esa serie se cierra.
 * - Serie de OTRO ejercicio rechazada (marcada desde la lista justo antes de volver al enfoque):
 *   el aviso sube al banner superior como "{ejercicio}, serie {n}: {mensaje}".
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

/** Id de la sesión de hoy devuelta por el mock; el PUT de series debe apuntarle a él. */
const SESION_ID = 'sesion-hoy-1';
const MENSAJE_RECHAZO = 'La serie fue rechazada por el servidor (validación)';

const PROBLEMA_409: ProblemDetails = {
  type: 'https://api.guachafit.com/errors/serie-rechazada',
  title: 'Serie rechazada',
  status: 409,
  detail: 'La serie no pudo registrarse en el servidor.',
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
      totalEjercicios: 2,
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

/** 2 ejercicios: "Sentadilla" (2 series) y "Press de banca" (1 serie). */
const SESION_HOY: SesionEntrenamientoDetalleDTO = {
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
    {
      id: 'es-2',
      sesionId: SESION_ID,
      ejercicioId: 'ej-2',
      orden: 2,
      ejercicio: {
        id: 'ej-2',
        nombre: 'Press de banca',
        grupoMuscular: 'Pecho',
        activo: true,
        createdAtUtc: '2026-10-01T00:00:00.000Z',
      },
      series: [
        {
          id: 's-3',
          ejercicioSesionId: 'es-2',
          numeroSerie: 1,
          repsObjetivo: 10,
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
      return Promise.resolve(clonar(SEMANA));
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      // Copia fresca por llamada: la página muta el objeto de sesión (spread superficial en
      // `handleToggleSet`) y el fixture no debe contaminar otros tests del archivo.
      return Promise.resolve(clonar(SESION_HOY));
    }
    if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
      // ApiError real del módulo (spread del actual en el mock): 409 = rechazo de datos.
      return Promise.reject(new ApiError(409, PROBLEMA_409, MENSAJE_RECHAZO));
    }
    return Promise.reject(new Error(`Llamada inesperada en este spec: ${metodo} ${endpoint}`));
  });
});

/** Copia profunda de un fixture JSON plano (evita compartir referencias entre tests). */
function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Marca una serie dentro de la tarjeta del ejercicio nombrado (vista de lista completa). */
function marcarSerieEnEjercicio(nombreEjercicio: string, numeroSerie: number): void {
  const encabezado = screen.getByRole('heading', { name: nombreEjercicio });
  const tarjeta = encabezado.closest('div[class*="rounded-3xl"]');
  expect(tarjeta).not.toBeNull();
  const boton = within(tarjeta as HTMLElement).getByRole('button', {
    name: `Marcar serie ${numeroSerie} como completada`,
  });
  fireEvent.click(boton);
}

describe('EntrenamientoPage · rechazo 4xx de una serie sin modo demo (H1/H2)', () => {
  it('la serie en foco rechazada vuelve a pendiente, el foco sigue en ella y su alerta inline muestra el mensaje', async () => {
    render(<EntrenamientoPage />);

    // La cadena de carga pasa por Dexie (fake-indexeddb): timeout explícito, como en `inicio`.
    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    expect(within(seccion).queryAllByText(/Ejercicio 1 de 2 · Serie 1 de 2/).length).toBeGreaterThan(
      0
    );

    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    // El 4xx revierte: la serie vuelve a pendiente y su fila (en foco) muestra el error inline.
    const alerta = await within(seccion).findByRole('alert', undefined, { timeout: 5000 });
    expect(alerta.textContent).toContain(MENSAJE_RECHAZO);

    expect(within(seccion).queryAllByText(/Ejercicio 1 de 2 · Serie 1 de 2/).length).toBeGreaterThan(
      0
    );
    expect(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    ).toBeTruthy();

    // H2: el cronómetro pertenecía a la serie rechazada, así que se cierra.
    expect(screen.queryByRole('button', { name: 'Cerrar cronómetro de descanso' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar cronómetro' })).toBeNull();
  });

  it('la serie de otro ejercicio rechazada al volver al enfoque sube al banner como "{ejercicio}, serie {n}: {mensaje}"', async () => {
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    // La carga resuelve fuera de `act` (cadena Dexie + apiClient mockeado) y el efecto
    // `[sesion.id]` que fija la vista en `foco` puede ejecutarse en un macrotask posterior:
    // se asienta el trabajo pendiente de React antes de interactuar.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(within(seccion).getByRole('button', { name: 'Ver entrenamiento completo' }));
    await screen.findByRole('button', { name: 'Volver al enfoque' }, { timeout: 5000 });

    // Serie 1 del ejercicio 2, marcada desde la lista justo antes de volver al enfoque: cuando
    // llega el 4xx el foco ya está en otra serie (la 1 del ejercicio 1), que es el caso H1.
    marcarSerieEnEjercicio('Press de banca', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al enfoque' }));

    const banner = await screen.findByText(
      `Press de banca, serie 1: ${MENSAJE_RECHAZO}`,
      undefined,
      { timeout: 5000 }
    );
    expect(banner.closest('[role="alert"]')).not.toBeNull();

    // El aviso vive en el banner, no en el foco: la fila rechazada no está renderizada ahí.
    const seccionTrasRechazo = screen.getByRole('region', { name: 'Entrenamiento en foco' });
    expect(within(seccionTrasRechazo).queryByText(MENSAJE_RECHAZO)).toBeNull();
  });
});
