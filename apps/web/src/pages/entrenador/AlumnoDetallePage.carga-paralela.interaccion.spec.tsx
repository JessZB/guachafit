// @vitest-environment happy-dom
/**
 * Verificación de la carga en paralelo del expediente del alumno.
 *
 * Contrato:
 * 1. El perfil (`/alumnos/:id`) se carga primero para obtener el `usuarioId`.
 * 2. Una vez resuelto el perfil, las peticiones secundarias (transacciones,
 *    planes, overrides/suscripción, última sesión/historial, catálogo de ejercicios,
 *    rutina activa y controles antropométricos) se emiten en PARALELO (sin cascada),
 *    quedando todas solicitadas antes de que ninguna de ellas se resuelva.
 * 3. Mientras cualquier petición siga pendiente, la página mantiene el estado de carga
 *    (role="status" con texto "Cargando Expediente Deportivo 360°..."). Al resolverse
 *    la última, se renderiza la ficha.
 * 4. Un fallo en una petición no crítica (p. ej. catálogo de planes rechazado)
 *    no bloquea la carga del resto de dominios ni impide mostrar la ficha con su aviso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
} from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import { AlumnoDetallePage } from './AlumnoDetallePage';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

const PERFIL: PerfilAlumnoDetalleDTO = {
  id: CLIENTE_ID,
  usuarioId: ALUMNO_USUARIO_ID,
  entrenadorId: COACH_ID,
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '12345678',
  nombres: 'María',
  apellidos: 'López',
  email: 'maria@example.com',
  fechaNacimiento: '1995-04-12',
  edadCalculada: 31,
  telefonoWhatsapp: '+584140000000',
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.ACTIVO,
  periodicidadAntropometria: null,
  antropometriaInicio: null,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  zonaHoraria: 'America/Caracas',
};

const PLAN_A: PlanMembresiaDetalleDTO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  entrenadorId: COACH_ID,
  nombre: 'Plan Presencial',
  descripcion: 'Acceso a sala',
  beneficios: ['Rutina interactiva'],
  precioBaseUsd: '40.00',
  duracionMeses: 1,
  activo: true,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

const RESUMEN_FINANCIERO: ResumenFinancieroAlumnoDTO = {
  alumnoId: CLIENTE_ID,
  usuarioId: ALUMNO_USUARIO_ID,
  saldoPendienteTotalUsd: '0.00',
  saldoAFavorUsd: '0.00',
  totalPagadoHistoricoUsd: '0.00',
  totalPagadoMesActualUsd: '0.00',
  cuotaMesActual: null,
  transaccionesTotal: 0,
  transacciones: [],
};

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: COACH_ID,
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  llamada: boolean;
  veces: number;
}

function crearDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve,
    reject,
    llamada: false,
    veces: 0,
  };
}

let defPerfil: Deferred<PerfilAlumnoDetalleDTO>;
let defTransacciones: Deferred<ResumenFinancieroAlumnoDTO>;
let defPlanes: Deferred<PlanMembresiaDetalleDTO[]>;
let defOverrides: Deferred<unknown[]>;
let defSuscripcion: Deferred<unknown>;
let defUltimaSesion: Deferred<unknown>;
let defHistorialSesiones: Deferred<{ items: unknown[]; total: number }>;
let defCatalogo: Deferred<unknown[]>;
let defRutina: Deferred<{ id: string; bloques: unknown[] }>;
let defControles: Deferred<{ evaluaciones: unknown[]; controlesTotal: number }>;

function montarFicha(tab = 'resumen'): void {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=${tab}`]}>
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AlumnoDetallePage · Carga en paralelo del expediente', () => {
  beforeEach(() => {
    sesionMock.isDemoMode = false;
    Element.prototype.scrollIntoView = vi.fn();

    defPerfil = crearDeferred<PerfilAlumnoDetalleDTO>();
    defTransacciones = crearDeferred<ResumenFinancieroAlumnoDTO>();
    defPlanes = crearDeferred<PlanMembresiaDetalleDTO[]>();
    defOverrides = crearDeferred<unknown[]>();
    defSuscripcion = crearDeferred<unknown>();
    defUltimaSesion = crearDeferred<unknown>();
    defHistorialSesiones = crearDeferred<{ items: unknown[]; total: number }>();
    defCatalogo = crearDeferred<unknown[]>();
    defRutina = crearDeferred<{ id: string; bloques: unknown[] }>();
    defControles = crearDeferred<{ evaluaciones: unknown[]; controlesTotal: number }>();

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();

    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === `/alumnos/${CLIENTE_ID}`) {
        defPerfil.llamada = true;
        defPerfil.veces += 1;
        return defPerfil.promise;
      }
      if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
        defTransacciones.llamada = true;
        defTransacciones.veces += 1;
        return defTransacciones.promise;
      }
      if (endpoint === '/finanzas/planes') {
        defPlanes.llamada = true;
        defPlanes.veces += 1;
        return defPlanes.promise;
      }
      if (endpoint.startsWith('/finanzas/planes/override')) {
        defOverrides.llamada = true;
        defOverrides.veces += 1;
        return defOverrides.promise;
      }
      if (endpoint.startsWith('/finanzas/suscripciones/')) {
        defSuscripcion.llamada = true;
        defSuscripcion.veces += 1;
        return defSuscripcion.promise;
      }
      if (endpoint === `/sesiones/alumno/${CLIENTE_ID}/ultima`) {
        defUltimaSesion.llamada = true;
        defUltimaSesion.veces += 1;
        return defUltimaSesion.promise;
      }
      if (endpoint.startsWith(`/sesiones/alumno/${CLIENTE_ID}/historial`)) {
        defHistorialSesiones.llamada = true;
        defHistorialSesiones.veces += 1;
        return defHistorialSesiones.promise;
      }
      if (endpoint === '/ejercicios/catalogo') {
        defCatalogo.llamada = true;
        defCatalogo.veces += 1;
        return defCatalogo.promise;
      }
      if (endpoint === `/rutinas/alumno/${CLIENTE_ID}/activa`) {
        defRutina.llamada = true;
        defRutina.veces += 1;
        return defRutina.promise;
      }
      if (endpoint.startsWith(`/antropometria/evolucion/${ALUMNO_USUARIO_ID}`)) {
        defControles.llamada = true;
        defControles.veces += 1;
        return defControles.promise;
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('emite en paralelo planes, última sesión, catálogo, rutina, transacciones y controles tras resolver el perfil, sin cascada', async () => {
    montarFicha();

    // 1. Inicialmente solo se emite la petición del perfil
    expect(defPerfil.llamada).toBe(true);
    expect(defTransacciones.llamada).toBe(false);
    expect(defPlanes.llamada).toBe(false);
    expect(defOverrides.llamada).toBe(false);
    expect(defUltimaSesion.llamada).toBe(false);
    expect(defCatalogo.llamada).toBe(false);
    expect(defRutina.llamada).toBe(false);
    expect(defControles.llamada).toBe(false);

    // 2. Se resuelve el perfil del alumno
    await act(async () => {
      defPerfil.resolve(PERFIL);
    });

    // 3. SIN que ninguna de las peticiones secundarias se resuelva todavía,
    // TODAS quedan emitidas concurrentemente (no hay cascada secuencial).
    await waitFor(() => {
      expect(defTransacciones.llamada).toBe(true);
      expect(defPlanes.llamada).toBe(true);
      expect(defOverrides.llamada).toBe(true);
      expect(defUltimaSesion.llamada).toBe(true);
      expect(defCatalogo.llamada).toBe(true);
      expect(defRutina.llamada).toBe(true);
      expect(defControles.llamada).toBe(true);
    });

    // 4. Limpieza: resolvemos todas para terminar el ciclo limpiamente
    await act(async () => {
      defTransacciones.resolve(RESUMEN_FINANCIERO);
      defPlanes.resolve([PLAN_A]);
      defOverrides.resolve([]);
      defSuscripcion.resolve(null);
      defUltimaSesion.resolve(null);
      defHistorialSesiones.resolve({ items: [], total: 0 });
      defCatalogo.resolve([]);
      defRutina.resolve({ id: 'r1', bloques: [] });
      defControles.resolve({ evaluaciones: [], controlesTotal: 0 });
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('mantiene el estado de carga mientras quede alguna petición pendiente y muestra la ficha al resolver la última', async () => {
    montarFicha();

    // Muestra el estado de carga inicial
    expect(screen.getByRole('status').textContent).toContain('Cargando Expediente Deportivo 360°...');
    expect(screen.queryByRole('heading', { name: /María López/i })).toBeNull();

    // Resuelve el perfil
    await act(async () => {
      defPerfil.resolve(PERFIL);
    });

    // Espera a que se disparen las peticiones paralelas
    await waitFor(() => {
      expect(defTransacciones.llamada).toBe(true);
      expect(defControles.llamada).toBe(true);
    });

    // Resuelve 6 de las 7 ramas paralelas (dejando solo controles pendiente)
    await act(async () => {
      defTransacciones.resolve(RESUMEN_FINANCIERO);
      defPlanes.resolve([PLAN_A]);
      defOverrides.resolve([]);
      defSuscripcion.resolve(null);
      defUltimaSesion.resolve(null);
      defHistorialSesiones.resolve({ items: [], total: 0 });
      defCatalogo.resolve([]);
      defRutina.resolve({ id: 'r1', bloques: [] });
    });

    // Aún debe seguir en carga porque falta la última petición (controles)
    expect(screen.getByRole('status').textContent).toContain('Cargando Expediente Deportivo 360°...');
    expect(screen.queryByRole('heading', { name: /María López/i })).toBeNull();

    // Resuelve la última petición pendiente
    await act(async () => {
      defControles.resolve({ evaluaciones: [], controlesTotal: 0 });
    });

    // Al resolverse la última, el estado de carga desaparece y la ficha se visualiza
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(screen.getByRole('heading', { name: /María López/i })).toBeTruthy();
  });

  it('un fallo en una petición no impide que las demás apliquen su estado ni bloquea la ficha', async () => {
    montarFicha('finanzas');

    await act(async () => {
      defPerfil.resolve(PERFIL);
    });

    await waitFor(() => {
      expect(defPlanes.llamada).toBe(true);
    });

    // Catálogo de planes falla (rechaza con error de red/servidor)
    await act(async () => {
      defPlanes.reject(new Error('Fallo de red en catálogo'));
      defTransacciones.resolve(RESUMEN_FINANCIERO);
      defOverrides.resolve([]);
      defSuscripcion.resolve(null);
      defUltimaSesion.resolve(null);
      defHistorialSesiones.resolve({ items: [], total: 0 });
      defCatalogo.resolve([]);
      defRutina.resolve({ id: 'r1', bloques: [] });
      defControles.resolve({ evaluaciones: [], controlesTotal: 0 });
    });

    // La ficha carga con éxito a pesar del fallo en planes
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(screen.getByRole('heading', { name: /María López/i })).toBeTruthy();
    // Se muestra el aviso específico del catálogo de planes sin ocultar la ficha
    expect(await screen.findByText('No se pudo cargar el catálogo de planes.')).toBeTruthy();
  });
});
