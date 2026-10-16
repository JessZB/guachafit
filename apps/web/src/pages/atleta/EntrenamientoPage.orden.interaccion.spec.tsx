// @vitest-environment jsdom
/**
 * Lote E9 (RF-001 §7.10) · contratos P1–P6 del orden de los envíos de una sesión.
 *
 * Red lenta con promesas controladas (patrón de
 * `EntrenamientoPage.rechazo.interaccion.spec.tsx`: `fake-indexeddb/auto`,
 * `apiClient` mockeado, PUT con promesas controladas por `serieId`, sin modo
 * demo). Cada caso fija el comportamiento del diseño: con un PUT en vuelo el
 * segundo cambio se encola detrás (`use-envio-sesion.ts:60-69`) y la cola no
 * saca nada del grupo hasta que el vuelo se libera.
 *
 * Textos reales usados: "Ver entrenamiento completo", "Volver al enfoque",
 * "Marcar serie {n} como completada", "Completada, toca para corregir",
 * "Marcar serie {n} como pendiente", "Finalizar entrenamiento",
 * "Guardar y enviar a mi entrenador", insignia `Progreso` con
 * `{porcentajeCumplimiento}%` (`EntrenamientoPage.tsx:2230-2235`).
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

import { ApiError, apiClient, setAuthToken } from '../../lib/api-client';
import { hayEnvioEnVuelo } from '../../lib/envios-en-vuelo';
import { offlineDb } from '../../lib/offline-db';
import { processOutboxQueue } from '../../lib/offline-sync';
import { EntrenamientoPage } from './EntrenamientoPage';
import {
  clonar,
  filasFinalizarEncoladas,
  filasSerieEncolada,
  tarjetaDe,
} from './entrenamiento.spec-helper';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

/** Id de la sesión de hoy devuelta por el mock; los PUT de series apuntan a él. */
const SESION_ID = 'sesion-hoy-orden';
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

/** 2 ejercicios: "Sentadilla" (series s-1, s-2) y "Press de banca" (serie s-3). */
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

type ResolutorPut = {
  resolver: (valor: unknown) => void;
  rechazar: (motivo: unknown) => void;
};

/** PUT de series pendientes por `serieId:completada`; el resto lo decide `puestos`. */
const pendientes = new Map<string, ResolutorPut>();
/** Series cuyo PUT queda en vuelo (las demás se resuelven solas con `{}`). */
let seriesControladas: Set<string> = new Set();
/** Cuántos PUT de series se controlan antes de auto-resolver (P2: solo el primero). */
let putsControladosRestantes: number | null = null;

function clavePut(serieId: string, completada: unknown): string {
  return `${serieId}:${String(completada)}`;
}

function instalarMockBase(): void {
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

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
        series?: Array<{ serieId?: string; completada?: boolean }>;
      };
      const serieId = cuerpo.series?.[0]?.serieId ?? 'desconocida';
      const controlada =
        (putsControladosRestantes === null || putsControladosRestantes > 0) &&
        seriesControladas.has(serieId);
      if (putsControladosRestantes !== null) putsControladosRestantes -= 1;
      if (!controlada) return Promise.resolve({});
      return new Promise((resolver, rechazar) => {
        pendientes.set(clavePut(serieId, cuerpo.series?.[0]?.completada), { resolver, rechazar });
      });
    }
    if (metodo === 'POST' && endpoint === `/sesiones/${SESION_ID}/finalizar`) {
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`Llamada inesperada en este spec: ${metodo} ${endpoint}`));
  });
}

/** Llamadas PUT de series con su cuerpo interpretado, en orden de llegada. */
function putsSerie(): Array<{ serieId: string; completada: boolean }> {
  const llamadas = mockApi.mock.calls as Array<
    [string, { method?: string; body?: string } | undefined]
  >;
  return llamadas
    .filter(
      ([endpoint, opciones]) =>
        (opciones?.method ?? 'GET') === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`
    )
    .map(([, opciones]) => {
      const cuerpo = JSON.parse(opciones?.body ?? '{}') as {
        series?: Array<{ serieId?: string; completada?: boolean }>;
      };
      return {
        serieId: cuerpo.series?.[0]?.serieId ?? 'desconocida',
        completada: cuerpo.series?.[0]?.completada ?? false,
      };
    });
}

function postsFinalizar(): Array<unknown> {
  const llamadas = mockApi.mock.calls as Array<[string, { method?: string } | undefined]>;
  return llamadas.filter(
    ([endpoint, opciones]) =>
      (opciones?.method ?? 'GET') === 'POST' && endpoint === `/sesiones/${SESION_ID}/finalizar`
  );
}

function setNavigatorOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true, writable: true });
}

/** Lleva la página a la lista completa y espera la tarjeta del ejercicio. */
async function abrirListaCompleta(): Promise<void> {
  const seccion = await screen.findByRole(
    'region',
    { name: 'Entrenamiento en foco' },
    { timeout: 5000 }
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.click(within(seccion).getByRole('button', { name: 'Ver entrenamiento completo' }));
  await screen.findByRole('button', { name: 'Volver al enfoque' }, { timeout: 5000 });
}

function marcarSerieEnEjercicio(nombreEjercicio: string, numeroSerie: number): void {
  const tarjeta = tarjetaDe(nombreEjercicio);
  fireEvent.click(
    within(tarjeta).getByRole('button', { name: `Marcar serie ${numeroSerie} como completada` })
  );
}

function desmarcarSerieEnEjercicio(nombreEjercicio: string, numeroSerie: number): void {
  fireEvent.click(
    within(tarjetaDe(nombreEjercicio)).getByRole('button', {
      name: /Completada, toca para corregir/,
    })
  );
  fireEvent.click(
    within(tarjetaDe(nombreEjercicio)).getByRole('button', {
      name: `Marcar serie ${numeroSerie} como pendiente`,
    })
  );
}

beforeEach(async () => {
  instalarMockBase();
  pendientes.clear();
  seriesControladas = new Set();
  putsControladosRestantes = null;
  setNavigatorOnline(true);
  setAuthToken(null);
  await offlineDb.outboxMutations.clear();
  await offlineDb.rutinaHoy.clear();
});

afterEach(async () => {
  // Suelta los PUT que el test dejó en vuelo para no arrastrar promesas.
  for (const { resolver } of pendientes.values()) resolver({});
  pendientes.clear();
  setAuthToken(null);
  setNavigatorOnline(true);
  cleanup();
  vi.restoreAllMocks();
});

describe('EntrenamientoPage · orden de los envíos de una sesión', () => {
  it('P1, el caso del dueño: con el primer PUT en vuelo no sale un segundo PUT', async () => {
    seriesControladas = new Set(['s-1']);
    render(<EntrenamientoPage />);
    await abrirListaCompleta();

    marcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(() => expect(pendientes.has(clavePut('s-1', true))).toBe(true), {
      timeout: 5000,
    });

    desmarcarSerieEnEjercicio('Sentadilla', 1);
    // Con el diseño, mientras el primero está en vuelo el desmarcado se encola detrás.
    await waitFor(
      async () => {
        const filas = await offlineDb.outboxMutations.toArray();
        expect(filasSerieEncolada(filas, SESION_ID, { completada: false })).toHaveLength(1);
      },
      { timeout: 5000 }
    );
    // Mientras el primero está en vuelo no sale un segundo PUT.
    expect(putsSerie()).toHaveLength(1);
    expect(
      within(tarjetaDe('Sentadilla')).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    ).toBeTruthy();
  });

  it('P2, el directo falla y se reintenta en orden: el último PUT lleva completada:false', async () => {
    seriesControladas = new Set(['s-1']);
    putsControladosRestantes = 1; // solo el marcado directo queda en vuelo; los reintentos resuelven
    render(<EntrenamientoPage />);
    await abrirListaCompleta();

    marcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(() => expect(pendientes.has(clavePut('s-1', true))).toBe(true), {
      timeout: 5000,
    });

    // Sin red el desmarcado se encola; el marcado en vuelo falla después (red caída).
    setNavigatorOnline(false);
    desmarcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(
      async () => {
        const filas = await offlineDb.outboxMutations.toArray();
        expect(filasSerieEncolada(filas, SESION_ID)).toHaveLength(1);
      },
      { timeout: 5000 }
    );
    await act(async () => {
      pendientes.get(clavePut('s-1', true))?.rechazar(new TypeError('Failed to fetch'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Vuelve la red y la cola se procesa: el marcado (true) debe salir antes que el
    // desmarcado (false) porque su marca de acción es anterior.
    setNavigatorOnline(true);
    setAuthToken('token-sesion-activa');
    await processOutboxQueue();
    await waitFor(() => expect(putsSerie()).toHaveLength(3), { timeout: 5000 });

    const cuerpos = putsSerie();
    expect(cuerpos[cuerpos.length - 1]?.completada).toBe(false);
  });

  it('P3, finalizar no se adelanta: con una serie en vuelo no sale /finalizar', async () => {
    seriesControladas = new Set(['s-2']);
    render(<EntrenamientoPage />);
    await abrirListaCompleta();

    marcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(() => expect(putsSerie()).toHaveLength(1), { timeout: 5000 });
    marcarSerieEnEjercicio('Sentadilla', 2);
    await waitFor(() => expect(pendientes.has(clavePut('s-2', true))).toBe(true), {
      timeout: 5000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    const dialogo = await screen.findByRole('dialog', undefined, { timeout: 5000 });
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar y enviar a mi entrenador' })
    );

    // Con el diseño, /finalizar queda encolado detrás de la serie en vuelo.
    await waitFor(
      async () => {
        const filas = await offlineDb.outboxMutations.toArray();
        expect(filasFinalizarEncoladas(filas, SESION_ID)).toHaveLength(1);
      },
      { timeout: 5000 }
    );
    expect(postsFinalizar()).toHaveLength(0);
  });

  it('P4, G + opción A: el rechazo de una operación ya superada no revierte ni muestra error', async () => {
    seriesControladas = new Set(['s-1']);
    render(<EntrenamientoPage />);
    await abrirListaCompleta();

    marcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(() => expect(pendientes.has(clavePut('s-1', true))).toBe(true), {
      timeout: 5000,
    });
    desmarcarSerieEnEjercicio('Sentadilla', 1);
    // Con el diseño el desmarcado se encola detrás del primer PUT en vuelo.
    await waitFor(
      async () => {
        const filas = await offlineDb.outboxMutations.toArray();
        expect(filasSerieEncolada(filas, SESION_ID, { completada: false })).toHaveLength(1);
      },
      { timeout: 5000 }
    );

    // Se rechaza el primero (operación vieja): no revierte la intención más nueva y,
    // por decisión del dueño (opción A), tampoco avisa.
    await act(async () => {
      pendientes
        .get(clavePut('s-1', true))
        ?.rechazar(new ApiError(409, PROBLEMA_409, MENSAJE_RECHAZO));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Espera activa a que el rechazo se procese (el `finally` libera el vuelo):
    // solo entonces la ausencia de alerta es significativa.
    await waitFor(() => expect(hayEnvioEnVuelo(`sesion:${SESION_ID}`)).toBe(false), {
      timeout: 5000,
    });

    // La serie sigue pendiente (manda el desmarcado, que sigue encolado)…
    expect(
      within(tarjetaDe('Sentadilla')).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    ).toBeTruthy();
    // …y no hay alerta con el mensaje de rechazo ni en la tarjeta ni en el banner.
    expect(within(tarjetaDe('Sentadilla')).queryByRole('alert')).toBeNull();
    expect(screen.queryByText(`Sentadilla, serie 1: ${MENSAJE_RECHAZO}`)).toBeNull();
  });

  it('P5, G, porcentaje desde el estado actual: con 1 serie completada no muestra 0.00%', async () => {
    seriesControladas = new Set(['s-1']);
    render(<EntrenamientoPage />);
    await abrirListaCompleta();

    marcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(() => expect(pendientes.has(clavePut('s-1', true))).toBe(true), {
      timeout: 5000,
    });
    marcarSerieEnEjercicio('Sentadilla', 2);
    // Con el diseño el marcado de s-2 se encola detrás del PUT de s-1 en vuelo.
    await waitFor(
      async () => {
        const filas = await offlineDb.outboxMutations.toArray();
        expect(
          filasSerieEncolada(filas, SESION_ID, { serieId: 's-2', completada: true })
        ).toHaveLength(1);
      },
      { timeout: 5000 }
    );

    // Se rechaza la 1: vuelve a pendiente, la 2 sigue completada…
    await act(async () => {
      pendientes
        .get(clavePut('s-1', true))
        ?.rechazar(new ApiError(409, PROBLEMA_409, MENSAJE_RECHAZO));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      within(tarjetaDe('Sentadilla')).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    ).toBeTruthy();
    // …y el progreso visible refleja 1 serie completada de 3, no la instantánea 0.00%.
    expect(screen.queryByText('33.33%')).not.toBeNull();
  });

  it('P6, regresión: un solo marcado con éxito envía un PUT directo sin pasar por la cola', async () => {
    render(<EntrenamientoPage />);
    await abrirListaCompleta();

    marcarSerieEnEjercicio('Sentadilla', 1);
    await waitFor(() => expect(putsSerie()).toHaveLength(1), { timeout: 5000 });

    expect(putsSerie()).toEqual([{ serieId: 's-1', completada: true }]);
    expect(await offlineDb.outboxMutations.count()).toBe(0);
  });
});
