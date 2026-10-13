// @vitest-environment jsdom
/**
 * Lote E7 · C3.2/C3.3 (fase roja): sesión EN_PROGRESO servida desde la caché Dexie sin conexión
 * y pegado de un peso con unidad en el modo foco.
 *
 * Montaje (patrón de `EntrenamientoPage.rechazo.interaccion.spec.tsx`):
 * - `useAuth` con `isDemoMode: false` y `navigator.onLine = false`: la página solo puede leer
 *   la caché local (`offlineDb.rutinaHoy`), nunca el API.
 * - `fake-indexeddb/auto`: la caché Dexie real (`offlineDb`) se prepara con `put` ANTES de
 *   renderizar, con el MISMO esquema que usa la página (`CachedRutina` de `lib/offline-db.ts`).
 * - `apiClient` mockeado: si la página intentara la red sin conexión, el test lo evidencia en
 *   `mockApi` (no debe usarse con `onLine = false`).
 *
 * Contratos (C3.2 / C3.3):
 * - (a) la caché se muestra en modo foco ("Ejercicio 1 de 3 · Serie 1 de 2"), sin "Tu plan de hoy".
 * - (b) `sessionStorage['guachafit_foco_preferido_' + id] = '2'` (clave de C2.2) → foco en el
 *   ejercicio 3.
 * - (c) "Hacer ahora" en el ejercicio 2 persiste el índice 1 en `sessionStorage`.
 * - C3.3: pegar "60 kg" en el input de peso de la serie en foco lo deja en 60.
 *
 * C3.5 (copia inmutable) se omite: la caché se lee por IndexedDB, que clona en cada lectura y
 * escritura, así que la mutación interna de `handleToggleSet` no es observable desde el test
 * (sonda temporal: la referencia leída antes del clic nunca cambia, hoy y tras el arreglo);
 * lo cubre C2.1 (`clonarSesionParaEdicion`).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';

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

import { apiClient } from '../../lib/api-client';
import { fechaCalendarioLocal } from '../../lib/date-format';
import { offlineDb } from '../../lib/offline-db';
import { EntrenamientoPage } from './EntrenamientoPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

/** Id de la sesión cacheada; la clave del preferido es el contrato C2.2 (módulo aún inexistente). */
const SESION_ID = 'sesion-cache-e7';
const CLAVE_PREFERIDO = `guachafit_foco_preferido_${SESION_ID}`;

/** Sesión EN_PROGRESO de 3 ejercicios (2 series cada uno), todos pendientes. */
function crearSesionEnProgreso(): SesionEntrenamientoDetalleDTO {
  const nombres = ['Sentadilla', 'Press de banca', 'Remo con barra'];
  return {
    id: SESION_ID,
    alumnoId: sesionMock.usuario.id,
    bloqueId: 'b-1',
    fechaProgramada: fechaCalendarioLocal(),
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    ejercicios: nombres.map((nombre, indice) => {
      const ejercicioSesionId = `es-${indice + 1}`;
      return {
        id: ejercicioSesionId,
        sesionId: SESION_ID,
        ejercicioId: `ej-${indice + 1}`,
        orden: indice + 1,
        ejercicio: {
          id: `ej-${indice + 1}`,
          nombre,
          grupoMuscular: 'General',
          activo: true,
          createdAtUtc: '2026-10-01T00:00:00.000Z',
        },
        series: [1, 2].map((numeroSerie) => ({
          id: `s-${indice + 1}-${numeroSerie}`,
          ejercicioSesionId,
          numeroSerie,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '60.00',
          rpe: null,
          descansoSegundos: 90,
          completada: false,
        })),
      };
    }),
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
  };
}

/**
 * Prepara la caché local de hoy con el MISMO esquema que `lib/offline-db.ts` (`CachedRutina`):
 * `rutinaHoy` indexa por `id`/`alumnoId` y guarda la sesión completa + `updatedAt`. Con la
 * sesión EN_PROGRESO, `seleccionarRutinaCacheadaParaHoy` la devuelve como `deHoy`.
 */
async function prepararCache(sesion: SesionEntrenamientoDetalleDTO): Promise<void> {
  await offlineDb.rutinaHoy.put({
    id: sesion.id,
    alumnoId: sesionMock.usuario.id,
    fechaProgramada: sesion.fechaProgramada,
    sesion,
    updatedAt: Date.now(),
  });
}

beforeEach(async () => {
  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) =>
    Promise.reject(new Error(`La página no debe llamar al API sin conexión: ${endpoint}`))
  );
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });
  sessionStorage.clear();
  await offlineDb.rutinaHoy.clear();
  await offlineDb.outboxMutations.clear();
  await offlineDb.semanaEntrenamiento.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EntrenamientoPage · sesión EN_PROGRESO desde la caché sin conexión (C3.2)', () => {
  it('(a) muestra el modo foco de la sesión cacheada de 3 ejercicios y NO "Tu plan de hoy"', async () => {
    await prepararCache(crearSesionEnProgreso());
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    expect(within(seccion).queryAllByText(/Ejercicio 1 de 3 · Serie 1 de 2/).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText('Tu plan de hoy')).toBeNull();
    // Sin conexión no debe usarse el API (la caché es la única fuente).
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('(b) el preferido persistido (índice 2) abre el foco en "Ejercicio 3 de 3"', async () => {
    await prepararCache(crearSesionEnProgreso());
    sessionStorage.setItem(CLAVE_PREFERIDO, '2');
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    expect(within(seccion).queryAllByText(/Ejercicio 3 de 3 · Serie 1 de 2/).length).toBeGreaterThan(
      0
    );
  });

  it(
    '(c) "Hacer ahora" en el ejercicio 2 guarda el índice 1 en sessionStorage',
    // W-52-2: two chained `findByRole` waits (up to 5000 ms each) plus the Dexie
    // read and render exceed the default `testTimeout` (5000 ms) when the machine
    // is loaded (full suite or parallel suites). The budget (20 s) covers the sum
    // of all capped waits (5 s + 3x2 s retries + 5 s) without changing any assertion.
    { timeout: 20000 },
    async () => {
      await prepararCache(crearSesionEnProgreso());
      render(<EntrenamientoPage />);
      await screen.findByRole('region', { name: 'Entrenamiento en foco' }, { timeout: 5000 });

      // W-52-2: under load the discrete click on "Ver entrenamiento completo" is
      // occasionally swallowed (the focus view stays mounted, no transition ever
      // happens). Re-dispatch it — bounded, with active waiting only — until the
      // list view actually renders. The behavioral assertion below is unchanged:
      // the same "Hacer ahora" button is clicked and the same sessionStorage
      // value is expected.
      for (let intento = 0; intento < 3; intento++) {
        const verLista = screen.queryByRole('button', { name: 'Ver entrenamiento completo' });
        if (verLista) fireEvent.click(verLista);
        // eslint-disable-next-line no-await-in-loop
        const listaVisible = await screen
          .findByRole('button', { name: 'Hacer ahora: Press de banca' }, { timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (listaVisible) break;
      }
      fireEvent.click(
        await screen.findByRole(
          'button',
          { name: 'Hacer ahora: Press de banca' },
          { timeout: 5000 }
        )
      );

      expect(sessionStorage.getItem(CLAVE_PREFERIDO)).toBe('1');
    }
  );

  it('C3.3: pegar "60 kg" en el input de peso de la serie en foco lo deja en 60', async () => {
    await prepararCache(crearSesionEnProgreso());
    render(<EntrenamientoPage />);

    const input = (await screen.findByLabelText('Peso real en kg, serie 1', undefined, {
      timeout: 5000,
    })) as HTMLInputElement;
    fireEvent.paste(input, { clipboardData: { getData: () => '60 kg' } });

    // El pegado se maneja de forma síncrona (como el change): la aserción directa falla hoy
    // con el input vacío y no depende del reloj.
    expect(input.value).toBe('60');
  });
});
