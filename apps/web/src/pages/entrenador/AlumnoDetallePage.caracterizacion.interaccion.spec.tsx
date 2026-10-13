// @vitest-environment jsdom
/**
 * B0 · caracterización del módulo `alumno-detalle`: pestaña `entrenamiento` + modal de rutina.
 *
 * Cierra el BLOCKER B-1 del reporte 40: ningún spec existente cubre la pestaña
 * `entrenamiento` (último entrenamiento, historial paginado, "Ver Series", rutina activa)
 * ni el modal de edición de rutina (~1330 líneas). Estos tests describen el comportamiento
 * ACTUAL sobre el código vigente: quedan en verde tal como está la página, no prescriben
 * cómo debería ser. Si un comportamiento parece un bug, se caracteriza y se reporta como
 * WARNING en el reporte 60, sin corregir producción.
 *
 * Montaje: IGUAL que los specs existentes (p. ej. `correcciones-1b:342-355`, sin
 * `QueryClientProvider`, B-2): `<MemoryRouter>` directo + `apiClient` parcialmente mockeado
 * (`get/post/patch/delete/put`) + auth mockeada. Selectores accesibles (rol, label, texto),
 * nunca clases ni estructura interna (W-6).
 *
 * Alcance: SOLO B-1. Resumen/finanzas/antropometría ya tienen cobertura y no se duplican.
 * "Quitar plan" / "Quitar override" viven en la pestaña resumen y ya están cubiertos por
 * `suscripcion` y `correcciones-1b`; aquí solo se ancla su no-duplicación en el reporte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  EstadoAlumno,
  EstadoSesion,
  Modalidad,
  TipoDocumento,
  type EjercicioCatalogoDetalleDTO,
  type PerfilAlumnoDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
const ENDPOINT_HISTORIAL = (limit: number, offset: number) =>
  `/sesiones/alumno/${CLIENTE_ID}/historial?limit=${limit}&offset=${offset}`;
const ENDPOINT_RUTINA = `/rutinas/alumno/${CLIENTE_ID}`;
const ENDPOINT_CATALOGO = '/ejercicios/catalogo';

const PERFIL_BASE: PerfilAlumnoDetalleDTO = {
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

function sesionFixture(
  indice: number,
  parcial: Partial<SesionEntrenamientoDetalleDTO> = {}
): SesionEntrenamientoDetalleDTO {
  const id = `5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e${String(indice).padStart(2, '0')}`;
  return {
    id,
    alumnoId: CLIENTE_ID,
    bloqueId: 'd1',
    fechaProgramada: `2026-10-${String(30 - indice).padStart(2, '0')}`,
    fechaInicioUtc: '2026-10-05T10:00:00.000Z',
    fechaFinUtc: '2026-10-05T11:00:00.000Z',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.COMPLETADA,
    porcentajeCumplimiento: '85.00',
    volumenTotalKg: '1200.00',
    notasAlumno: null,
    ejercicios: [],
    duracionMinutos: 60,
    createdAtUtc: '2026-10-05T11:00:00.000Z',
    updatedAtUtc: '2026-10-05T11:00:00.000Z',
    ...parcial,
  };
}

interface EjercicioRutinaFija {
  nombre: string;
  series: number;
  reps: string;
  peso: string;
  rpe: string;
  descansoSegundos: number;
}

interface BloqueRutinaFijo {
  diaId: string;
  titulo: string;
  enfoque?: string;
  ejercicios: EjercicioRutinaFija[];
}

const BLOQUE_EMPUJE: BloqueRutinaFijo = {
  diaId: 'd1',
  titulo: 'Día 1 (Lunes): Empuje',
  enfoque: 'Hipertrofia',
  ejercicios: [
    {
      nombre: 'Press Banca',
      series: 4,
      reps: '8-10',
      peso: '60 kg',
      rpe: '8',
      descansoSegundos: 90,
    },
  ],
};

const BLOQUE_TIRON: BloqueRutinaFijo = {
  diaId: 'd2',
  titulo: 'Día 2: Tirón',
  ejercicios: [{ nombre: 'Remo', series: 3, reps: '10', peso: '', rpe: '', descansoSegundos: 60 }],
};

const BLOQUE_VACIO: BloqueRutinaFijo = { diaId: 'd1', titulo: 'Día 1', ejercicios: [] };

function catalogoFixture(
  parcial: Partial<EjercicioCatalogoDetalleDTO> & { nombre: string }
): EjercicioCatalogoDetalleDTO {
  return {
    id: '11111111-1111-4111-8111-111111111c01',
    grupoMuscular: 'Piernas',
    activo: true,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    ...parcial,
  };
}

const NUEVO_EJ_ID = '22222222-2222-4222-8222-222222222222';

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: sesionMock.isDemoMode,
  }),
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
import { AlumnoDetallePage } from './AlumnoDetallePage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

function SondaUbicacion() {
  const ubicacion = useLocation();
  return <span data-testid="sonda-ubicacion">{`${ubicacion.pathname}${ubicacion.search}`}</span>;
}

// Estado mutable por test: lo que devuelve el servidor mockeado.
let perfilActual: PerfilAlumnoDetalleDTO | null = PERFIL_BASE;
let bloquearPerfil = false;
let resolverPerfil: ((valor: unknown) => void) | null = null;
let sesionesActuales: SesionEntrenamientoDetalleDTO[] = [];
let fallarHistorial = false;
let ultimaActual: SesionEntrenamientoDetalleDTO | null = null;
let rutinaActual: BloqueRutinaFijo[] | null = null;
let catalogoActual: EjercicioCatalogoDetalleDTO[] = [];
let cuerposPutRutina: Record<string, unknown>[] = [];
let fallarGuardarRutina: string | null = null;
let cuerposPostCatalogo: Record<string, unknown>[] = [];

/** Normaliza el cuerpo de una llamada al mock, venga por helper o por el callable. */
function cuerpoDeLlamada(llamada: unknown[]): Record<string, unknown> {
  const segundo = llamada[1];
  if (typeof segundo === 'string') return JSON.parse(segundo) as Record<string, unknown>;
  if (segundo && typeof segundo === 'object') {
    const conBody = segundo as { body?: unknown };
    if (typeof conBody.body === 'string') {
      return JSON.parse(conBody.body) as Record<string, unknown>;
    }
    return segundo as Record<string, unknown>;
  }
  return {};
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) {
    if (bloquearPerfil) {
      return new Promise((resolver) => {
        resolverPerfil = resolver as (valor: unknown) => void;
      });
    }
    return Promise.resolve(perfilActual);
  }
  if (endpoint === '/finanzas/planes') return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    return Promise.resolve(RESUMEN_FINANCIERO);
  }
  if (endpoint.startsWith(`/sesiones/alumno/${CLIENTE_ID}/ultima`)) {
    return Promise.resolve(ultimaActual);
  }
  if (endpoint.startsWith(`/sesiones/alumno/${CLIENTE_ID}/historial`)) {
    if (fallarHistorial) {
      return Promise.reject(new Error('No se pudo cargar el historial (500).'));
    }
    const query = endpoint.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    const limit = Number(params.get('limit') ?? '10');
    const offset = Number(params.get('offset') ?? '0');
    return Promise.resolve({
      items: sesionesActuales.slice(offset, offset + limit),
      total: sesionesActuales.length,
      limit,
      offset,
    });
  }
  if (endpoint === ENDPOINT_CATALOGO) return Promise.resolve(catalogoActual);
  if (endpoint === `${ENDPOINT_RUTINA}/activa`) {
    if (!rutinaActual) return Promise.resolve(null);
    return Promise.resolve({
      id: 'r1111111-1111-4111-8111-111111111111',
      alumnoId: CLIENTE_ID,
      entrenadorId: COACH_ID,
      nombre: 'Planificación Semanal Activa',
      activa: true,
      bloques: rutinaActual,
      createdAtUtc: '2026-01-01T00:00:00.000Z',
      updatedAtUtc: '2026-01-01T00:00:00.000Z',
    });
  }
  if (endpoint.startsWith('/antropometria/evolucion/')) {
    return Promise.resolve({ evaluaciones: [], controlesTotal: 0 });
  }
  return Promise.resolve(null);
}

function guardarRutinaMock(cuerpo: Record<string, unknown>): Promise<unknown> {
  if (fallarGuardarRutina) return Promise.reject(new Error(fallarGuardarRutina));
  cuerposPutRutina.push(cuerpo);
  return Promise.resolve({ ok: true });
}

function crearEjercicioMock(cuerpo: Record<string, unknown>): Promise<unknown> {
  cuerposPostCatalogo.push(cuerpo);
  const creado: EjercicioCatalogoDetalleDTO = {
    id: NUEVO_EJ_ID,
    nombre: String(cuerpo.nombre ?? ''),
    grupoMuscular: String(cuerpo.grupoMuscular ?? 'Pecho'),
    patronMovimiento: (cuerpo.patronMovimiento as string | null) ?? null,
    activo: true,
    createdAtUtc: '2026-10-09T00:00:00.000Z',
  };
  catalogoActual = [creado, ...catalogoActual];
  return Promise.resolve(creado);
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  Element.prototype.scrollIntoView = vi.fn();
  perfilActual = PERFIL_BASE;
  bloquearPerfil = false;
  resolverPerfil = null;
  sesionesActuales = [];
  fallarHistorial = false;
  ultimaActual = null;
  rutinaActual = null;
  catalogoActual = [];
  cuerposPutRutina = [];
  fallarGuardarRutina = null;
  cuerposPostCatalogo = [];

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    const metodo = opciones?.method;
    if (metodo === 'PUT' && String(endpoint).startsWith(`${ENDPOINT_RUTINA}`)) {
      return guardarRutinaMock(cuerpoDeLlamada([endpoint, opciones]));
    }
    if (metodo === 'POST' && endpoint === ENDPOINT_CATALOGO) {
      return crearEjercicioMock(cuerpoDeLlamada([endpoint, opciones]));
    }
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.put.mockImplementation((endpoint: string, cuerpo: unknown) => {
    if (String(endpoint).startsWith(`${ENDPOINT_RUTINA}`)) {
      return guardarRutinaMock(cuerpoDeLlamada([endpoint, cuerpo]));
    }
    return Promise.resolve({ ok: true });
  });
  mockApi.post.mockImplementation((endpoint: string, cuerpo: unknown) => {
    if (endpoint === ENDPOINT_CATALOGO) {
      return crearEjercicioMock(cuerpoDeLlamada([endpoint, cuerpo]));
    }
    return Promise.resolve({ id: 'tx-nueva' });
  });
  mockApi.patch.mockImplementation((_endpoint: string, cuerpo: Record<string, unknown>) =>
    Promise.resolve({ ...(perfilActual ?? PERFIL_BASE), ...cuerpo })
  );
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function montarFicha(entrada = `/coach/alumnos/${CLIENTE_ID}?tab=entrenamiento`): void {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <SondaUbicacion />
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** ¿El mock recibió un GET del historial con ese limit/offset? (helper o callable). */
function huboGetHistorial(limit: number, offset: number): boolean {
  const esperado = ENDPOINT_HISTORIAL(limit, offset);
  if (mockApi.get.mock.calls.some(([endpoint]) => endpoint === esperado)) return true;
  return mockApi.mock.calls.some(([endpoint, opciones]) => {
    if (endpoint !== esperado) return false;
    const metodo = (opciones as { method?: string } | undefined)?.method;
    return !metodo || metodo === 'GET';
  });
}

/** Abre el modal de rutina y devuelve su diálogo. */
async function abrirModalRutina(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /Editar rutina semanal/ }));
  return screen.findByRole('dialog', { name: 'Asignar & Editar Rutina Semanal' });
}

describe('B0 · pestaña entrenamiento: carga global', () => {
  it('muestra el estado de carga mientras se lee el expediente', async () => {
    bloquearPerfil = true;
    montarFicha();
    expect(screen.getByText('Cargando Expediente Deportivo 360°...')).toBeTruthy();
    await act(async () => {
      resolverPerfil?.(perfilActual);
    });
    await screen.findByRole('heading', { name: /Historial de Sesiones/ });
  });

  it('muestra error honesto con "Reintentar" si el expediente no carga', async () => {
    perfilActual = null;
    montarFicha();
    await screen.findByRole('heading', { name: 'Expediente no encontrado' });
    expect(
      screen.getByText('No se pudo cargar el expediente del alumno. Revisa tu conexión e inténtalo de nuevo.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver al Directorio' })).toBeTruthy();
  });
});

describe('B0 · pestaña entrenamiento: último entrenamiento', () => {
  it('muestra la tarjeta con el título, la fecha y el % cumplido de la última completada', async () => {
    ultimaActual = sesionFixture(0);
    sesionesActuales = [sesionFixture(0)];
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    await screen.findByRole('heading', { name: /Último Entrenamiento Realizado/ });
    expect(screen.getByText('85.00% cumplido')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ver historial completo' })
    ).toBeTruthy();
  });

  it('titula "Entrenamiento en Progreso" cuando la última sigue abierta', async () => {
    ultimaActual = sesionFixture(0, { estado: EstadoSesion.EN_PROGRESO });
    sesionesActuales = [];
    montarFicha();
    await screen.findByRole('heading', { name: /Entrenamiento en Progreso/ });
  });

  it('usa el historial como respaldo cuando el endpoint de última no trae dato', async () => {
    ultimaActual = null;
    sesionesActuales = [sesionFixture(0)];
    montarFicha();
    await screen.findByRole('heading', { name: /Último Entrenamiento Realizado/ });
  });

  it('no muestra la tarjeta cuando no hay sesiones realizadas', async () => {
    ultimaActual = null;
    sesionesActuales = [];
    montarFicha();
    await screen.findByRole('heading', { name: /Historial de Sesiones/ });
    expect(screen.queryByRole('heading', { name: /Último Entrenamiento/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Entrenamiento en Progreso/ })).toBeNull();
  });
});

describe('B0 · pestaña entrenamiento: historial paginado', () => {
  it('lista las sesiones con el título del bloque y su chip de estado', async () => {
    ultimaActual = null;
    sesionesActuales = [sesionFixture(0)];
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    await screen.findByRole('heading', { name: 'Historial de Sesiones (1)' });
    // El título viaja en dos sitios: la fila del historial (bloqueId → título del bloque)
    // y la tarjeta de la rutina activa.
    expect(screen.getAllByText('Día 1 (Lunes): Empuje')).toHaveLength(2);
    expect(screen.getAllByText('Completada').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el estado vacío cuando el alumno no registra entrenamientos', async () => {
    ultimaActual = null;
    sesionesActuales = [];
    rutinaActual = [];
    montarFicha();
    await screen.findByRole('heading', { name: 'Historial de Sesiones (0)' });
    expect(
      screen.getByText('El alumno aún no registra entrenamientos completados.')
    ).toBeTruthy();
  });

  it('muestra el fallo de carga como alerta sin pasar por el estado vacío', async () => {
    ultimaActual = null;
    fallarHistorial = true;
    montarFicha();
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cargar el historial (500).');
    expect(
      screen.queryByText('El alumno aún no registra entrenamientos completados.')
    ).toBeNull();
  });

  it('pagina hacia adelante pidiendo el siguiente offset al API', async () => {
    ultimaActual = null;
    sesionesActuales = Array.from({ length: 12 }, (_, i) => sesionFixture(i));
    montarFicha();
    await screen.findByRole('heading', { name: 'Historial de Sesiones (12)' });
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => {
      expect(huboGetHistorial(10, 10)).toBe(true);
    });
  });

  it('el toggle "Ver Series" expande y colapsa con aria-expanded y aria-controls', async () => {
    ultimaActual = null;
    sesionesActuales = [sesionFixture(0)];
    montarFicha();
    const toggle = (await screen.findByRole('button', { name: 'Ver Series' })) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const colapsar = (await screen.findByRole('button', {
      name: 'Ocultar Series',
    })) as HTMLButtonElement;
    expect(colapsar.getAttribute('aria-expanded')).toBe('true');
    const idSeries = colapsar.getAttribute('aria-controls');
    expect(idSeries).toBe(`sesion-series-${sesionesActuales[0].id}`);
    // Con 0 ejercicios el detalle muestra el aviso en un <p> sin id: el aria-controls
    // no tiene contenedor asociado (ver WARNING W-B01-1 del reporte 60).
    expect(screen.getByText('Sin series registradas en esta sesión.')).toBeTruthy();
    fireEvent.click(colapsar);
    await screen.findByRole('button', { name: 'Ver Series' });
    expect(screen.queryByText('Sin series registradas en esta sesión.')).toBeNull();
  });
});

describe('B0 · pestaña entrenamiento: navegación', () => {
  it('el tab lleva a ?tab=entrenamiento y muestra el historial', async () => {
    ultimaActual = null;
    sesionesActuales = [];
    montarFicha(`/coach/alumnos/${CLIENTE_ID}`);
    const tab = await screen.findByRole('tab', { name: 'Entrenamiento & Rutinas' });
    fireEvent.click(tab);
    await screen.findByRole('heading', { name: /Historial de Sesiones/ });
    expect(screen.getByTestId('sonda-ubicacion').textContent).toContain('tab=entrenamiento');
  });
});

describe('B0 · pestaña entrenamiento: rutina activa', () => {
  it('renderiza los bloques con sus ejercicios y chips de prescripción', async () => {
    ultimaActual = null;
    sesionesActuales = [];
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    await screen.findByRole('heading', { name: 'Rutina Semanal Asignada' });
    expect(screen.getByRole('heading', { name: 'Día 1 (Lunes): Empuje' })).toBeTruthy();
    expect(screen.getByText('Hipertrofia')).toBeTruthy();
    expect(screen.getByText('1 ejercicio')).toBeTruthy();
    expect(screen.getByText('Press Banca')).toBeTruthy();
    expect(screen.getByText('4 series × 8-10')).toBeTruthy();
    expect(screen.getByText('60 kg')).toBeTruthy();
    expect(screen.getByText('RPE 8')).toBeTruthy();
  });

  it('muestra el estado vacío sin rutina y ofrece crearla', async () => {
    ultimaActual = null;
    sesionesActuales = [];
    rutinaActual = null;
    montarFicha();
    await screen.findByRole('heading', { name: 'Rutina Semanal Asignada' });
    expect(
      screen.getByText(/Este alumno aún no tiene una rutina semanal activa\./)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Editar rutina semanal/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cargar desde plantilla/ })).toBeTruthy();
  });
});

describe('B0 · modal de rutina: apertura y días', () => {
  it('abre con la rutina vigente, sus pestañas de día y el pie de conteo', async () => {
    rutinaActual = [BLOQUE_EMPUJE, BLOQUE_TIRON];
    montarFicha();
    const dialogo = await abrirModalRutina();
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(within(dialogo).getByRole('button', { name: 'Día 1 (Lunes)' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Día 2' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Añadir Día' })).toBeTruthy();
    expect(within(dialogo).getByText('2 días configurados')).toBeTruthy();
  });

  it('"Añadir Día" suma una pestaña y actualiza el conteo', async () => {
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Añadir Día' }));
    expect(await within(dialogo).findByText('2 días configurados')).toBeTruthy();
    // El bloque nuevo nace con día sugerido (= su número): la pestaña incluye el nombre.
    expect(within(dialogo).getByRole('button', { name: /Día 2/ })).toBeTruthy();
  });

  it('eliminar un día pide confirmación y lo quita al confirmar', async () => {
    rutinaActual = [BLOQUE_EMPUJE, BLOQUE_TIRON];
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar este día' }));
    const confirmacion = await screen.findByRole('dialog', { name: '¿Eliminar este día?' });
    expect(
      within(confirmacion).getByText(
        'Se quitará este día con todos sus ejercicios de la rutina que estás editando.'
      )
    ).toBeTruthy();
    fireEvent.click(within(confirmacion).getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '¿Eliminar este día?' })).toBeNull();
    });
    expect(await within(dialogo).findByText('1 día configurado')).toBeTruthy();
  });

  it('cambiar de pestaña de día muestra sus ejercicios', async () => {
    rutinaActual = [BLOQUE_EMPUJE, BLOQUE_TIRON];
    montarFicha();
    const dialogo = await abrirModalRutina();
    expect(within(dialogo).getByText('Ejercicios Asignados a este Día (1):')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Día 2' }));
    expect(await within(dialogo).findByText('Remo')).toBeTruthy();
  });

  it('"Cerrar" cierra el modal sin guardar', async () => {
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Asignar & Editar Rutina Semanal' })).toBeNull();
    });
    expect(cuerposPutRutina).toHaveLength(0);
  });
});

describe('B0 · modal de rutina: ejercicios', () => {
  it('añade un ejercicio del catálogo al día activo', async () => {
    rutinaActual = [BLOQUE_VACIO];
    catalogoActual = [catalogoFixture({ nombre: 'Sentadilla' })];
    montarFicha();
    const dialogo = await abrirModalRutina();
    expect(within(dialogo).getByText('Aún no has agregado ejercicios a este bloque. Elige uno del catálogo abajo.')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Añadir' }));
    expect(await within(dialogo).findByText('Ejercicios Asignados a este Día (1):')).toBeTruthy();
    expect(within(dialogo).getByRole('heading', { name: 'Sentadilla' })).toBeTruthy();
  });

  it('quitar un ejercicio pide confirmación: cancelar conserva, confirmar elimina', async () => {
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar Press Banca' }));
    const confirmacion = await screen.findByRole('dialog', { name: '¿Eliminar este ejercicio?' });
    fireEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '¿Eliminar este ejercicio?' })).toBeNull();
    });
    expect(within(dialogo).getByText('Ejercicios Asignados a este Día (1):')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar Press Banca' }));
    const segunda = await screen.findByRole('dialog', { name: '¿Eliminar este ejercicio?' });
    fireEvent.click(within(segunda).getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(() => {
      expect(
        within(dialogo).getByText(
          'Aún no has agregado ejercicios a este bloque. Elige uno del catálogo abajo.'
        )
      ).toBeTruthy();
    });
  });

  it('muestra el estado vacío del catálogo cuando no hay ejercicios', async () => {
    rutinaActual = [BLOQUE_VACIO];
    catalogoActual = [];
    montarFicha();
    const dialogo = await abrirModalRutina();
    expect(await within(dialogo).findByText('Sin resultados en el catálogo')).toBeTruthy();
    expect(
      within(dialogo).getByText(
        'Tu catálogo está vacío: crea tu primer ejercicio para asignarlo.'
      )
    ).toBeTruthy();
  });

  it('la búsqueda y los chips de grupo filtran el catálogo', async () => {
    rutinaActual = [BLOQUE_VACIO];
    catalogoActual = [
      catalogoFixture({ nombre: 'Sentadilla' }),
      catalogoFixture({
        id: '33333333-3333-4333-8333-333333333333',
        nombre: 'Press Banca',
        grupoMuscular: 'Pecho',
      }),
    ];
    montarFicha();
    const dialogo = await abrirModalRutina();
    const buscador = within(dialogo).getByPlaceholderText('Buscar en catálogo...');
    fireEvent.change(buscador, { target: { value: 'sentad' } });
    expect(within(dialogo).queryByText('Press Banca')).toBeNull();
    expect(within(dialogo).getByText('Sentadilla')).toBeTruthy();
    fireEvent.change(buscador, { target: { value: '' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pecho' }));
    expect(await within(dialogo).findByText('Press Banca')).toBeTruthy();
    expect(within(dialogo).queryByText('Sentadilla')).toBeNull();
  });

  it('el creador rápido publica en el catálogo y asigna al día', async () => {
    rutinaActual = [BLOQUE_VACIO];
    catalogoActual = [];
    montarFicha();
    const dialogo = await abrirModalRutina();
    // Con el catálogo vacío el estado vacío ofrece su propio «Crear Ejercicio Nuevo»;
    // se escribe un filtro para que ese botón cambie a «Crear "Hip"» y el toggle quede único.
    fireEvent.change(within(dialogo).getByPlaceholderText('Buscar en catálogo...'), {
      target: { value: 'Hip' },
    });
    fireEvent.click(await within(dialogo).findByRole('button', { name: 'Crear Ejercicio Nuevo' }));
    fireEvent.change(
      within(dialogo).getByPlaceholderText('Nombre (ej. Hip Thrust Mancuerna)'),
      { target: { value: 'Hip Thrust' } }
    );
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Crear y Asignar a este Día' })
    );
    expect(await within(dialogo).findByText('Ejercicios Asignados a este Día (1):')).toBeTruthy();
    expect(cuerposPostCatalogo).toHaveLength(1);
    expect(cuerposPostCatalogo[0].nombre).toBe('Hip Thrust');
  });
});

describe('B0 · modal de rutina: guardado', () => {
  it('guarda con PUT el payload de planificación y muestra el éxito', async () => {
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar planificación activa' })
    );
    await within(dialogo).findByText(/Planificación semanal guardada y activada\./);
    expect(cuerposPutRutina).toHaveLength(1);
    const payload = cuerposPutRutina[0];
    expect(payload.alumnoId).toBe(CLIENTE_ID);
    expect(payload.nombreRutina).toBe('Planificación Semanal Activa');
    const bloques = payload.bloques as Array<{ ejercicios: Array<Record<string, unknown>> }>;
    expect(bloques).toHaveLength(1);
    expect(bloques[0].ejercicios[0].nombre).toBe('Press Banca');
    expect(bloques[0].ejercicios[0].series).toBe(4);
    expect(bloques[0].ejercicios[0].reps).toBe('8-10');
    const llamadasPut = mockApi.put.mock.calls.filter(([endpoint]) =>
      String(endpoint).startsWith(ENDPOINT_RUTINA)
    );
    const llamadasCallable = mockApi.mock.calls.filter(
      ([endpoint, opciones]) =>
        String(endpoint).startsWith(ENDPOINT_RUTINA) &&
        (opciones as { method?: string } | undefined)?.method === 'PUT'
    );
    expect(llamadasPut.length + llamadasCallable.length).toBeGreaterThanOrEqual(1);
  });

  it('no envía el PUT y avisa cuando la prescripción es inválida', async () => {
    rutinaActual = [BLOQUE_EMPUJE];
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.change(within(dialogo).getByLabelText('Repeticiones'), { target: { value: '' } });
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar planificación activa' })
    );
    await within(dialogo).findByText(/Revisa la prescripción/);
    expect(cuerposPutRutina).toHaveLength(0);
  });

  it('muestra el error del servidor cuando el PUT falla', async () => {
    rutinaActual = [BLOQUE_EMPUJE];
    fallarGuardarRutina = 'No se pudo guardar (500).';
    montarFicha();
    const dialogo = await abrirModalRutina();
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar planificación activa' })
    );
    await within(dialogo).findByText('No se pudo guardar (500).');
    expect(
      within(dialogo).queryByText(/Planificación semanal guardada y activada\./)
    ).toBeNull();
  });
});
