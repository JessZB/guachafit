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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { clonar, tarjetaDe } from './entrenamiento.spec-helper';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Marca una serie dentro de la tarjeta del ejercicio nombrado (vista de lista completa). */
function marcarSerieEnEjercicio(nombreEjercicio: string, numeroSerie: number): void {
  // H-05: reutiliza el `tarjetaDe` compartido; solo el clic queda local.
  const tarjeta = tarjetaDe(nombreEjercicio);
  const boton = within(tarjeta).getByRole('button', {
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

/** PUT de series con promesa controlada por serie (el cuerpo trae `series[0].serieId`). */
type ResolutorPut = {
  resolver: (valor: unknown) => void;
  rechazar: (motivo: unknown) => void;
};

/** PUT de series con promesa controlada por serie (el cuerpo trae `series[0].serieId`). */
function mockPutsControlados(pendientes: Map<string, ResolutorPut>): void {
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
    const metodo = opciones?.method ?? 'GET';
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
      return Promise.resolve(clonar(SEMANA));
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      return Promise.resolve(clonar(SESION_HOY));
    }
    if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
      const cuerpo = JSON.parse(opciones?.body ?? '{}') as {
        series?: Array<{ serieId?: string }>;
      };
      const serieId = cuerpo.series?.[0]?.serieId ?? 'desconocida';
      return new Promise((resolver, rechazar) => {
        pendientes.set(serieId, { resolver, rechazar });
      });
    }
    return Promise.reject(new Error(`Llamada inesperada en este spec: ${metodo} ${endpoint}`));
  });
}

describe('EntrenamientoPage · W1: edición en vuelo durante un rechazo 4xx (contrato 1)', () => {
  it('un peso editado a "62,5" mientras el PUT está en vuelo se conserva tras el rechazo', async () => {
    const pendientes = new Map<string, ResolutorPut>();
    mockPutsControlados(pendientes);
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // La edición en vuelo se hace en la lista: el foco solo pinta la serie vigente.
    fireEvent.click(within(seccion).getByRole('button', { name: 'Ver entrenamiento completo' }));
    await screen.findByRole('button', { name: 'Volver al enfoque' }, { timeout: 5000 });

    const peso = within(tarjetaDe('Sentadilla')).getByLabelText(
      'Peso real en kg, serie 1'
    ) as HTMLInputElement;
    fireEvent.change(peso, { target: { value: '60' } });
    expect(peso.value).toBe('60');

    // Marca con el PUT pendiente (promesa controlada): la fila queda completada y compacta.
    marcarSerieEnEjercicio('Sentadilla', 1);
    const corregir = await within(tarjetaDe('Sentadilla')).findByRole(
      'button',
      { name: /Completada, toca para corregir/ },
      { timeout: 5000 }
    );
    fireEvent.click(corregir);

    // Edición en vuelo: antes de la respuesta el peso pasa a 62,5.
    const pesoEnVuelo = within(tarjetaDe('Sentadilla')).getByLabelText(
      'Peso real en kg, serie 1'
    ) as HTMLInputElement;
    expect(pesoEnVuelo.value).toBe('60');
    fireEvent.change(pesoEnVuelo, { target: { value: '62,5' } });
    expect(pesoEnVuelo.value).toBe('62,5');

    // El PUT de s-1 sigue sin responder.
    await waitFor(() => expect(pendientes.has('s-1')).toBe(true), { timeout: 5000 });

    await act(async () => {
      pendientes.get('s-1')?.rechazar(new ApiError(409, PROBLEMA_409, MENSAJE_RECHAZO));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // La serie vuelve a pendiente, el peso en vuelo se conserva y el error queda inline.
    const tarjeta = tarjetaDe('Sentadilla');
    expect(
      within(tarjeta).getByRole('button', { name: 'Marcar serie 1 como completada' })
    ).toBeTruthy();
    const pesoTrasRechazo = within(tarjeta).getByLabelText(
      'Peso real en kg, serie 1'
    ) as HTMLInputElement;
    expect(pesoTrasRechazo.value).toBe('62,5');
    const alerta = await within(tarjeta).findByRole('alert', undefined, { timeout: 5000 });
    expect(alerta.textContent).toContain(MENSAJE_RECHAZO);

    // Al salir del campo el borrador se descarta y se ve el valor canónico persistido
    // ('62.50' → '62.5'): con la reversión anterior (`{ ...serieAntes }`) aquí se vería '60'.
    fireEvent.blur(pesoTrasRechazo);
    expect(
      (within(tarjetaDe('Sentadilla')).getByLabelText(
        'Peso real en kg, serie 1'
      ) as HTMLInputElement).value
    ).toBe('62.5');
  });
});

describe('EntrenamientoPage · rama "no cerrar" del cronómetro (contrato 4)', () => {
  it('si se rechaza otra serie distinta de la vigente, el cronómetro sigue abierto', async () => {
    const pendientes = new Map<string, ResolutorPut>();
    mockPutsControlados(pendientes);
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );

    // Serie A (Sentadilla 1): el PUT queda en vuelo y el foco avanza a la serie 2.
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );
    await screen.findByText(/Ejercicio 1 de 2 · Serie 2 de 2/, undefined, { timeout: 5000 });

    // Serie B (Sentadilla 2): el cronómetro vigente pasa a ser el suyo.
    const seccionB = screen.getByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccionB).getByRole('button', { name: 'Marcar serie 2 como completada' })
    );
    await screen.findByText(/Ejercicio 2 de 2 · Serie 1 de 1/, undefined, { timeout: 5000 });
    expect(
      screen.getByRole('button', { name: 'Cerrar cronómetro de descanso' })
    ).toBeTruthy();

    await waitFor(() => expect(pendientes.has('s-1')).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(pendientes.has('s-2')).toBe(true), { timeout: 5000 });

    // Se rechaza A, no la vigente B: el cronómetro de B sigue abierto y el aviso sube al
    // banner (el foco vigente ya está en otro ejercicio).
    await act(async () => {
      pendientes.get('s-1')?.rechazar(new ApiError(409, PROBLEMA_409, MENSAJE_RECHAZO));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      screen.getByRole('button', { name: 'Cerrar cronómetro de descanso' })
    ).toBeTruthy();
    const banner = await screen.findByText(`Sentadilla, serie 1: ${MENSAJE_RECHAZO}`, undefined, {
      timeout: 5000,
    });
    expect(banner.closest('[role="alert"]')).not.toBeNull();

    // Limpieza: el PUT de B termina con éxito para no dejar promesas en vuelo.
    await act(async () => {
      pendientes.get('s-2')?.resolver({});
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
