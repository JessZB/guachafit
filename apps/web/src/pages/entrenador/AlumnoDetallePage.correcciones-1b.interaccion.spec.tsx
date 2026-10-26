// @vitest-environment jsdom
/**
 * M5-L1B · correcciones 1B (web) — validación de contratos V1–V6, V10 y V11 en la ficha, más los
 * R1–R3 de la 2.ª ronda de validación (08).
 *
 * Estos tests fijan las correcciones hechas sobre `AlumnoDetallePage.tsx`:
 * - V1: orden de escritura (override antes del PUT al asignar el primer plan; PUT antes del
 *   override al cambiar de plan).
 * - V2: si el GET de overrides falla, el precio queda deshabilitado y guardar no toca overrides.
 * - V3: mensajes por paso, nombrando exactamente lo que se guardó y lo que no.
 * - V4: reconciliación con `GET /finanzas/suscripciones/:id` tras un fallo de PUT/DELETE.
 * - V5: "Quitar plan" limpia el precio acordado.
 * - V6: la fecha de inicio usa el "hoy" del alumno (su `zonaHoraria`, por defecto Caracas).
 * - V10: "Asignar plan" deja la pestaña resumen activa y el foco en el selector de plan.
 * - V11: la ayuda de la fecha nombra la duración real del plan.
 * - R1/R2 (2.ª ronda): la reconciliación alinea también el selector de plan con el servidor
 *   (`selectedPlanId = planId del servidor o ''`), así que un guardado posterior no reasigna un
 *   plan recién quitado (R1) ni conserva la elección de un plan que el servidor rechazó (R2).
 * - R3 (2.ª ronda): el éxito del guardado nombra solo lo que se escribió
 *   (expediente, plan y/o tarifa), compuesto dinámicamente en la página.
 *
 * Montaje: mismo patrón que `AlumnoDetallePage.suscripcion.interaccion.spec.tsx` (router de
 * memoria, `apiClient` parcialmente mockeado con `get/post/patch/delete/put` y auth mockeada).
 * El reloj se fija a `2026-10-09T23:30:00-04:00` (día local del proyecto) para distinguir el día
 * local del UTC. La zona del runner no influye: `vitest.config.ts`/`vitest.setup.ts` fijan
 * `TZ=America/Caracas` para toda la suite (V12).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type OverridePlanDetalleDTO,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type SuscripcionAlumnoDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
const ENDPOINT_SUSCRIPCION = `/finanzas/suscripciones/${ALUMNO_USUARIO_ID}`;
const ENDPOINT_OVERRIDE = '/finanzas/planes/override';
const ENDPOINT_COBRO = `/finanzas/clientes/${CLIENTE_ID}/cobro-directo-inteligente`;

/** Reloj falso del contrato: 23:30 del día local (en UTC ya es el día siguiente). */
const INSTANTE_FALSO = '2026-10-09T23:30:00-04:00';

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

const PLAN_B: PlanMembresiaDetalleDTO = {
  ...PLAN_A,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  nombre: 'Plan Online',
  descripcion: 'Seguimiento a distancia',
  beneficios: ['Rutina en App'],
  precioBaseUsd: '30.00',
};

/** Plan trimestral: la ayuda de la fecha debe decir "cada 3 meses" (V11). */
const PLAN_TRIMESTRAL: PlanMembresiaDetalleDTO = {
  ...PLAN_A,
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  nombre: 'Plan Trimestral',
  descripcion: 'Tres meses de seguimiento',
  beneficios: ['Rutina en App'],
  precioBaseUsd: '90.00',
  duracionMeses: 3,
};

const SUSCRIPCION_A: SuscripcionAlumnoDTO = {
  clienteId: ALUMNO_USUARIO_ID,
  planId: PLAN_A.id,
  planNombre: PLAN_A.nombre,
  duracionMeses: 1,
  fechaInicio: '2026-10-01',
  proximoCorte: '2026-11-14',
  cuotaEmitidaId: null,
};

const SUSCRIPCION_B: SuscripcionAlumnoDTO = {
  ...SUSCRIPCION_A,
  planId: PLAN_B.id,
  planNombre: PLAN_B.nombre,
  proximoCorte: '2026-12-01',
};

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

function overrideDe(
  plan: PlanMembresiaDetalleDTO,
  parcial: Partial<OverridePlanDetalleDTO> = {}
): OverridePlanDetalleDTO {
  return {
    id: `override-${plan.id.slice(0, 8)}`,
    planId: plan.id,
    clienteId: ALUMNO_USUARIO_ID,
    precioAcordadoUsd: '35.00',
    tasaFijadaOverride: null,
    beneficiosPersonalizados: null,
    motivoOverride: null,
    planNombre: plan.nombre,
    planPrecioBaseUsd: plan.precioBaseUsd,
    clienteNombre: 'María López',
    createdAtUtc: '2026-09-01T00:00:00.000Z',
    updatedAtUtc: '2026-09-01T00:00:00.000Z',
    ...parcial,
  };
}

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
import { parsearTabFichaAlumno } from '../../lib/alumno-detalle-tab';
import { AlumnoDetallePage } from './AlumnoDetallePage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

/** Sonda de la URL interna del router para comprobar a qué pestaña vuelve la ficha. */
function SondaUbicacion() {
  const ubicacion = useLocation();
  return <span data-testid="sonda-ubicacion">{`${ubicacion.pathname}${ubicacion.search}`}</span>;
}

// Estado mutable por test: lo que devuelve el servidor mockeado.
let perfilActual: PerfilAlumnoDetalleDTO = PERFIL_BASE;
let overridesActuales: OverridePlanDetalleDTO[] = [];
let suscripcionServidor: SuscripcionAlumnoDTO | null = null;
let fallarGetSuscripcion = false;
let alGuardarPut: (cuerpo: Record<string, unknown>) => Promise<unknown>;
let alHacerPostOverride: (cuerpo: Record<string, unknown>) => Promise<unknown>;
let alHacerPostCobro: () => Promise<unknown>;
let alBorrarSuscripcion: () => Promise<unknown>;

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
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(perfilActual);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A, PLAN_B, PLAN_TRIMESTRAL]);
  if (endpoint.startsWith(ENDPOINT_OVERRIDE)) return Promise.resolve(overridesActuales);
  if (endpoint.startsWith('/finanzas/suscripciones/')) {
    if (fallarGetSuscripcion) {
      return Promise.reject(new Error('No se pudo leer la suscripción (500).'));
    }
    return Promise.resolve(suscripcionServidor);
  }
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    return Promise.resolve(RESUMEN_FINANCIERO);
  }
  if (endpoint.startsWith('/sesiones/alumno/')) return Promise.resolve({ items: [], total: 0 });
  if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
  if (endpoint.startsWith('/rutinas/alumno/')) return Promise.resolve(null);
  if (endpoint.startsWith('/antropometria/evolucion/')) {
    return Promise.resolve({ evaluaciones: [], controlesTotal: 0 });
  }
  return Promise.resolve(null);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(INSTANTE_FALSO));
  sesionMock.isDemoMode = false;
  Element.prototype.scrollIntoView = vi.fn();
  perfilActual = PERFIL_BASE;
  overridesActuales = [];
  suscripcionServidor = null;
  fallarGetSuscripcion = false;

  alGuardarPut = (cuerpo) => {
    suscripcionServidor = {
      clienteId: ALUMNO_USUARIO_ID,
      planId: String(cuerpo.planId ?? ''),
      planNombre: 'Plan del catálogo',
      duracionMeses: 1,
      fechaInicio: String(cuerpo.fechaInicio ?? '2026-10-09'),
      proximoCorte: '2026-12-01',
      cuotaEmitidaId: null,
    };
    return Promise.resolve(suscripcionServidor);
  };
  alHacerPostOverride = (cuerpo) => {
    const override: OverridePlanDetalleDTO = {
      id: `override-${String(cuerpo.planId).slice(0, 8)}`,
      planId: String(cuerpo.planId),
      clienteId: ALUMNO_USUARIO_ID,
      precioAcordadoUsd: (cuerpo.precioAcordadoUsd as string | null | undefined) ?? null,
      tasaFijadaOverride: (cuerpo.tasaFijadaOverride as string | null | undefined) ?? null,
      beneficiosPersonalizados: null,
      motivoOverride: null,
      planNombre: null,
      planPrecioBaseUsd: null,
      clienteNombre: null,
      createdAtUtc: '2026-10-09T00:00:00.000Z',
      updatedAtUtc: '2026-10-09T00:00:00.000Z',
    };
    overridesActuales = [
      override,
      ...overridesActuales.filter((o) => o.planId !== override.planId),
    ];
    return Promise.resolve(override);
  };
  alHacerPostCobro = () => Promise.resolve({ id: 'tx-nueva' });
  alBorrarSuscripcion = () => {
    suscripcionServidor = null;
    return Promise.resolve({ desactivada: true });
  };

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    const metodo = opciones?.method;
    if (metodo === 'PUT') return alGuardarPut(cuerpoDeLlamada([endpoint, opciones]));
    if (metodo === 'POST' && endpoint === ENDPOINT_OVERRIDE) {
      return alHacerPostOverride(cuerpoDeLlamada([endpoint, opciones]));
    }
    if (metodo === 'POST' && endpoint === ENDPOINT_COBRO) return alHacerPostCobro();
    return respuestaGet(endpoint);
  });
  mockApi.put.mockImplementation((_endpoint: string, cuerpo: unknown) =>
    alGuardarPut(cuerpoDeLlamada([_endpoint, cuerpo]))
  );
  mockApi.post.mockImplementation((endpoint: string, cuerpo: unknown) => {
    if (endpoint === ENDPOINT_OVERRIDE) {
      return alHacerPostOverride(cuerpoDeLlamada([endpoint, cuerpo]));
    }
    if (endpoint === ENDPOINT_COBRO) return alHacerPostCobro();
    return Promise.resolve({ id: 'tx-nueva' });
  });
  mockApi.patch.mockImplementation((_endpoint: string, cuerpo: Record<string, unknown>) =>
    Promise.resolve({ ...perfilActual, ...cuerpo })
  );
  mockApi.delete.mockImplementation((endpoint: string) => {
    if (String(endpoint).startsWith('/finanzas/suscripciones/')) return alBorrarSuscripcion();
    if (String(endpoint).startsWith(`${ENDPOINT_OVERRIDE}/`)) {
      const id = String(endpoint).split('/').pop();
      overridesActuales = overridesActuales.filter((o) => o.id !== id);
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function montarFicha(tab?: 'resumen' | 'finanzas'): void {
  const entrada =
    tab === 'finanzas'
      ? `/coach/alumnos/${CLIENTE_ID}?tab=finanzas`
      : `/coach/alumnos/${CLIENTE_ID}`;
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <SondaUbicacion />
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Selector de plan de la tarjeta: el único `select` con opciones de los planes del catálogo. */
async function selectorDePlan(): Promise<HTMLSelectElement> {
  return waitFor(() => {
    const select = Array.from(document.querySelectorAll('select')).find((candidato) =>
      Array.from(candidato.options).some(
        (opcion) =>
          opcion.value === PLAN_A.id ||
          opcion.value === PLAN_B.id ||
          opcion.value === PLAN_TRIMESTRAL.id
      )
    );
    expect(select).toBeTruthy();
    return select as HTMLSelectElement;
  });
}

/** Campo `Fecha de inicio` (label exacta + input hermano en el mismo bloque). */
async function campoFechaInicio(): Promise<HTMLInputElement> {
  return waitFor(() => {
    const etiqueta = Array.from(document.querySelectorAll('label')).find(
      (candidata) => candidata.textContent?.trim() === 'Fecha de inicio'
    );
    const input = etiqueta?.parentElement?.querySelector('input[type="date"]') ?? null;
    expect(input).toBeTruthy();
    return input as HTMLInputElement;
  });
}

/** Control (input/select) del bloque de una etiqueta exacta, al estilo del formulario real. */
function controlDeEtiqueta(texto: string, selector: 'input' | 'select'): HTMLElement {
  const etiqueta = Array.from(document.querySelectorAll('label')).find(
    (candidata) => candidata.textContent?.trim() === texto
  );
  const control = etiqueta?.parentElement?.querySelector(selector) ?? null;
  if (!control) throw new Error(`No se encontró el control de la etiqueta «${texto}».`);
  return control as HTMLElement;
}

/** Guarda el expediente y espera a que el flujo termine (botón habilitado de nuevo). */
async function guardarExpediente(): Promise<void> {
  const guardar = await screen.findByRole('button', { name: /Guardar cambios/ });
  fireEvent.click(guardar);
  await waitFor(() => expect((guardar as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {
    await Promise.resolve();
  });
}

function llamadasSuscripcion(metodo: 'PUT' | 'DELETE'): unknown[][] {
  const viaHelper = metodo === 'PUT' ? mockApi.put.mock.calls : mockApi.delete.mock.calls;
  const filtradas = viaHelper.filter(([endpoint]) => endpoint === ENDPOINT_SUSCRIPCION);
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      endpoint === ENDPOINT_SUSCRIPCION &&
      (opciones as { method?: string } | undefined)?.method === metodo
  );
  return [...filtradas, ...viaCallable];
}

function postsDeOverride(): unknown[][] {
  const viaHelper = mockApi.post.mock.calls.filter(([endpoint]) => endpoint === ENDPOINT_OVERRIDE);
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      endpoint === ENDPOINT_OVERRIDE &&
      (opciones as { method?: string } | undefined)?.method === 'POST'
  );
  return [...viaHelper, ...viaCallable];
}

function borradosDeOverride(): unknown[][] {
  const viaHelper = mockApi.delete.mock.calls.filter(([endpoint]) =>
    String(endpoint).startsWith(`${ENDPOINT_OVERRIDE}/`)
  );
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      String(endpoint).startsWith(`${ENDPOINT_OVERRIDE}/`) &&
      (opciones as { method?: string } | undefined)?.method === 'DELETE'
  );
  return [...viaHelper, ...viaCallable];
}

/** Clave de idempotencia observable en las opciones que la página pasa al apiClient. */
function claveDeOpciones(opciones?: unknown): string | undefined {
  if (!opciones || typeof opciones !== 'object') return undefined;
  const conClave = opciones as { idempotencyKey?: string; headers?: Record<string, string> };
  return conClave.headers?.['X-Idempotency-Key'] ?? conClave.idempotencyKey;
}

function llamadasPostCobroFicha(): Array<{ llamada: unknown[]; clave?: string }> {
  const viaHelper = mockApi.post.mock.calls
    .filter(([endpoint]) => endpoint === ENDPOINT_COBRO)
    .map((llamada) => ({ llamada, clave: claveDeOpciones(llamada[2]) }));
  const viaCallable = mockApi.mock.calls
    .filter(
      ([endpoint, opciones]) =>
        endpoint === ENDPOINT_COBRO &&
        (opciones as { method?: string } | undefined)?.method === 'POST'
    )
    .map((llamada) => ({ llamada, clave: claveDeOpciones(llamada[1]) }));
  return [...viaHelper, ...viaCallable];
}

/**
 * V1: orden real de las dos escrituras financieras del guardado (override y PUT de suscripción),
 * combinando la forma helper (`apiClient.post/put`) y la callable (`apiClient(...)`), con
 * `invocationCallOrder` (contador global de los mocks, comparable entre mocks distintos).
 */
function ordenDeLlamadasFinancieras(): Array<{ tipo: 'post_override' | 'put_suscripcion'; orden: number }> {
  const eventos: Array<{ tipo: 'post_override' | 'put_suscripcion'; orden: number }> = [];
  mockApi.post.mock.calls.forEach((llamada, indice) => {
    if (llamada[0] === ENDPOINT_OVERRIDE) {
      eventos.push({ tipo: 'post_override', orden: mockApi.post.mock.invocationCallOrder[indice] });
    }
  });
  mockApi.put.mock.calls.forEach((llamada, indice) => {
    if (llamada[0] === ENDPOINT_SUSCRIPCION) {
      eventos.push({ tipo: 'put_suscripcion', orden: mockApi.put.mock.invocationCallOrder[indice] });
    }
  });
  mockApi.mock.calls.forEach((llamada, indice) => {
    const metodo = (llamada[1] as { method?: string } | undefined)?.method;
    if (llamada[0] === ENDPOINT_OVERRIDE && metodo === 'POST') {
      eventos.push({ tipo: 'post_override', orden: mockApi.mock.invocationCallOrder[indice] });
    }
    if (llamada[0] === ENDPOINT_SUSCRIPCION && metodo === 'PUT') {
      eventos.push({ tipo: 'put_suscripcion', orden: mockApi.mock.invocationCallOrder[indice] });
    }
  });
  return eventos.sort((a, b) => a.orden - b.orden);
}

/** "Quitar plan" con la confirmación del diálogo. */
async function confirmarQuitarPlan(): Promise<void> {
  const quitar = await screen.findByRole('button', { name: /Quitar plan/i });
  fireEvent.click(quitar);
  const dialogo = await screen.findByRole('dialog');
  const confirmar = within(dialogo)
    .getAllByRole('button')
    .find((boton) => !/cancelar/i.test(boton.textContent ?? ''));
  expect(confirmar).toBeTruthy();
  fireEvent.click(confirmar as HTMLElement);
}

/** Abre el modal de cobro en sala de la ficha (la página debe estar montada en la pestaña finanzas). */
async function abrirCobroFicha(): Promise<HTMLElement> {
  const abrir = await screen.findByRole('button', { name: /Cobrar en sala/ });
  fireEvent.click(abrir);
  return screen.findByRole('dialog');
}

function searchActual(): string {
  const sonda = screen.getByTestId('sonda-ubicacion').textContent ?? '';
  const indice = sonda.indexOf('?');
  return indice >= 0 ? sonda.slice(indice) : '';
}

describe('AlumnoDetallePage · correcciones 1B: orden de escritura (V1)', () => {
  it('V1a · primer plan con precio acordado: el override se escribe ANTES del PUT de la suscripción', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '35.00' },
    });

    await guardarExpediente();

    expect(ordenDeLlamadasFinancieras().map((evento) => evento.tipo)).toEqual([
      'post_override',
      'put_suscripcion',
    ]);
    const posts = postsDeOverride();
    expect(posts).toHaveLength(1);
    const cuerpo = cuerpoDeLlamada(posts[0]);
    expect(cuerpo.planId).toBe(PLAN_B.id);
    expect(cuerpo.precioAcordadoUsd).toBe('35.00');
    expect(llamadasSuscripcion('PUT')).toHaveLength(1);
  });

  it('V1b · becado (0.00): el override se escribe ANTES del PUT', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '0.00' },
    });

    await guardarExpediente();

    expect(ordenDeLlamadasFinancieras().map((evento) => evento.tipo)).toEqual([
      'post_override',
      'put_suscripcion',
    ]);
    const posts = postsDeOverride();
    expect(posts).toHaveLength(1);
    expect(cuerpoDeLlamada(posts[0]).precioAcordadoUsd).toBe('0.00');
  });

  it('V1c · cambio de plan con suscripción vigente: el PUT ocurre ANTES del override', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: PLAN_A.id, planActivoNombre: PLAN_A.nombre };
    overridesActuales = [overrideDe(PLAN_A)];
    montarFicha();

    const selector = await selectorDePlan();
    await waitFor(() => expect(selector.value).toBe(PLAN_A.id));
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '30.00' },
    });

    await guardarExpediente();

    expect(ordenDeLlamadasFinancieras().map((evento) => evento.tipo)).toEqual([
      'put_suscripcion',
      'post_override',
    ]);
    const puts = llamadasSuscripcion('PUT');
    expect(puts).toHaveLength(1);
    expect(cuerpoDeLlamada(puts[0])).toEqual({ planId: PLAN_B.id });
    const posts = postsDeOverride();
    expect(posts).toHaveLength(1);
    expect(cuerpoDeLlamada(posts[0]).precioAcordadoUsd).toBe('30.00');
  });
});

describe('AlumnoDetallePage · correcciones 1B: override sin cargar (V2)', () => {
  it('V2 · si el GET de overrides falla, el precio queda deshabilitado y guardar no toca overrides', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = {
      ...PERFIL_BASE,
      planActivoId: null,
      planActivoNombre: null,
      tasaFijadaOverride: '65.0000',
    };
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PUT') return alGuardarPut(cuerpoDeLlamada([endpoint, opciones]));
      if (endpoint.startsWith(ENDPOINT_OVERRIDE)) {
        return Promise.reject(new Error('No se pudo cargar el override (500).'));
      }
      return respuestaGet(endpoint);
    });
    montarFicha();

    const precio = await waitFor(() => {
      const control = controlDeEtiqueta('Precio acordado (USD)', 'input') as HTMLInputElement;
      expect(control.disabled).toBe(true);
      return control;
    });
    expect(precio.value).toBe('');

    fireEvent.change(controlDeEtiqueta('Teléfono / WhatsApp', 'input'), {
      target: { value: '+584141111111' },
    });
    await guardarExpediente();

    expect(postsDeOverride()).toHaveLength(0);
    expect(borradosDeOverride()).toHaveLength(0);
    // 2.ª ronda: en V2 no se escribe ni plan ni tarifa, así que el éxito nombra solo el expediente.
    expect(await screen.findByText('Expediente actualizado con éxito.')).toBeTruthy();
  });
});

describe('AlumnoDetallePage · correcciones 1B: mensajes por paso (V3)', () => {
  it('V3a · primer plan: falla la tarifa → aviso por paso y NO hay PUT', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    alHacerPostOverride = () => Promise.reject(new Error('Falló la tarifa.'));
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '35.00' },
    });

    await guardarExpediente();

    expect(
      await screen.findByText(
        'Los datos del expediente se guardaron, pero no se pudo guardar la tarifa acordada y por eso no se asignó el plan: Falló la tarifa.'
      )
    ).toBeTruthy();
    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
  });

  it('V3b · primer plan: falla el PUT → "los datos y la tarifa se guardaron"', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    alGuardarPut = () => Promise.reject(new Error('Falló el plan.'));
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '35.00' },
    });

    await guardarExpediente();

    expect(
      await screen.findByText(
        'Los datos del expediente y la tarifa se guardaron, pero no se pudo guardar el plan: Falló el plan.'
      )
    ).toBeTruthy();
  });

  it('V3c · cambio de plan: falla la tarifa → "el plan se guardó, la tarifa no"', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: PLAN_A.id, planActivoNombre: PLAN_A.nombre };
    overridesActuales = [overrideDe(PLAN_A)];
    alHacerPostOverride = () => Promise.reject(new Error('Falló la tarifa.'));
    montarFicha();

    const selector = await selectorDePlan();
    await waitFor(() => expect(selector.value).toBe(PLAN_A.id));
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '30.00' },
    });

    await guardarExpediente();

    expect(
      await screen.findByText(
        'Los datos del expediente y el plan se guardaron, pero no se pudo guardar la tarifa: Falló la tarifa.'
      )
    ).toBeTruthy();
  });

  it('V3d · sin cambio de plan: falla la tarifa → "los datos se guardaron, la tarifa no"', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: PLAN_A.id, planActivoNombre: PLAN_A.nombre };
    overridesActuales = [overrideDe(PLAN_A)];
    alHacerPostOverride = () => Promise.reject(new Error('Falló la tarifa.'));
    montarFicha();

    const precio = await waitFor(() => {
      const control = controlDeEtiqueta('Precio acordado (USD)', 'input') as HTMLInputElement;
      expect(control.value).toBe('35.00');
      return control;
    });
    fireEvent.change(precio, { target: { value: '30.00' } });

    await guardarExpediente();

    expect(
      await screen.findByText(
        'Los datos del expediente se guardaron, pero no se pudo guardar la tarifa: Falló la tarifa.'
      )
    ).toBeTruthy();
    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
  });
});

describe('AlumnoDetallePage · correcciones 1B: reconciliación tras un fallo (V4)', () => {
  it('V4a · el PUT falla pero el servidor lo aplicó: la tarjeta muestra la próxima cuota y sin fecha', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    alGuardarPut = (cuerpo) => {
      suscripcionServidor = {
        ...SUSCRIPCION_B,
        planId: String(cuerpo.planId ?? PLAN_B.id),
        fechaInicio: String(cuerpo.fechaInicio ?? '2026-10-09'),
      };
      return Promise.reject(new Error('Falló el plan.'));
    };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();

    await guardarExpediente();

    expect(
      await screen.findByText(/Los datos del expediente se guardaron, pero no se pudo guardar el plan/)
    ).toBeTruthy();
    const aviso = await screen.findByText(/Próxima cuota: vence el/);
    expect(aviso.textContent).toContain('01/12/2026');
    expect(screen.queryByText('Fecha de inicio')).toBeNull();
  });

  it('V4b · el DELETE falla pero el GET devuelve null: "Sin plan" junto al aviso', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    alBorrarSuscripcion = () => {
      suscripcionServidor = null;
      return Promise.reject(new Error('No se pudo quitar el plan (500).'));
    };
    montarFicha();

    await confirmarQuitarPlan();

    await waitFor(() => expect(llamadasSuscripcion('DELETE')).toHaveLength(1));
    expect(await screen.findByText(/No se pudo quitar el plan/)).toBeTruthy();
    expect((await screen.findAllByText('Sin plan')).length).toBeGreaterThan(0);
  });

  it('V4c · si la reconciliación también falla, la tarjeta conserva su estado anterior', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    alBorrarSuscripcion = () => {
      fallarGetSuscripcion = true;
      return Promise.reject(new Error('No se pudo quitar el plan (500).'));
    };
    montarFicha();

    await confirmarQuitarPlan();

    await waitFor(() => expect(llamadasSuscripcion('DELETE')).toHaveLength(1));
    expect(await screen.findByText(/No se pudo quitar el plan/)).toBeTruthy();
    expect(screen.getByText(/Próxima cuota: vence el 14\/11\/2026/)).toBeTruthy();
    expect(screen.queryByText('Sin plan')).toBeNull();
  });
});

describe('AlumnoDetallePage · correcciones 1B: quitar plan limpia el precio (V5)', () => {
  it('V5 · tras quitar el plan el precio queda vacío y guardar no pide plan ni hace PUT', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    overridesActuales = [overrideDe(PLAN_A)];
    montarFicha();

    const precio = await waitFor(() => {
      const control = controlDeEtiqueta('Precio acordado (USD)', 'input') as HTMLInputElement;
      expect(control.value).toBe('35.00');
      return control;
    });

    await confirmarQuitarPlan();
    await waitFor(() => expect(llamadasSuscripcion('DELETE')).toHaveLength(1));
    await waitFor(() => expect(precio.value).toBe(''));

    fireEvent.change(controlDeEtiqueta('Teléfono / WhatsApp', 'input'), {
      target: { value: '+584142222222' },
    });
    await guardarExpediente();

    expect(screen.queryByText('Elige un plan para fijar un precio acordado.')).toBeNull();
    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
    expect(postsDeOverride()).toHaveLength(0);
    expect(borradosDeOverride()).toHaveLength(0);
  });
});

describe('AlumnoDetallePage · correcciones 1B: "hoy" del alumno (V6)', () => {
  it('V6a · con zona Asia/Tokyo la fecha de inicio usa el "hoy" del alumno', async () => {
    perfilActual = {
      ...PERFIL_BASE,
      zonaHoraria: 'Asia/Tokyo',
      planActivoId: null,
      planActivoNombre: null,
    };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });

    const campo = await campoFechaInicio();
    expect(campo.value).toBe('2026-10-10');
    expect(campo.min).toBe('2026-09-10');
    expect(campo.max).toBe('2026-12-09');
  });

  it('V6b · sin zona horaria se usa America/Caracas', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });

    const campo = await campoFechaInicio();
    expect(campo.value).toBe('2026-10-09');
    expect(campo.min).toBe('2026-09-09');
    expect(campo.max).toBe('2026-12-08');
  });
});

describe('AlumnoDetallePage · correcciones 1B: clave de cobro estable hasta confirmar (V7)', () => {
  it('V7a · un fallo, cerrar y reabrir el modal conserva la MISMA clave', async () => {
    let intentos = 0;
    alHacerPostCobro = () => {
      intentos += 1;
      return intentos === 1
        ? Promise.reject(new Error('El servidor falló (500).'))
        : Promise.resolve({ id: 'tx-1' });
    };
    montarFicha('finanzas');

    const dialogo = await abrirCobroFicha();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });
    fireEvent.click(
      within(dialogo).getByRole('button', { name: /Registrar y Liquidar|Registrar cobro/i })
    );
    await waitFor(() => expect(llamadasPostCobroFicha()).toHaveLength(1));
    expect(await within(dialogo).findByText(/El servidor falló/)).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar cobro directo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const dialogoReabierto = await abrirCobroFicha();
    fireEvent.click(
      within(dialogoReabierto).getByRole('button', {
        name: /Registrar y Liquidar|Registrar cobro/i,
      })
    );
    await waitFor(() => expect(llamadasPostCobroFicha()).toHaveLength(2));

    const [primer, segundo] = llamadasPostCobroFicha();
    expect(primer.clave).toBeTruthy();
    expect(segundo.clave).toBe(primer.clave);
  });
});

describe('AlumnoDetallePage · correcciones 1B: foco tras "Asignar plan" (V10)', () => {
  it('V10 · "Asignar plan" deja la pestaña resumen activa y el foco en el selector de plan', async () => {
    alHacerPostCobro = () =>
      Promise.reject(
        new Error(
          'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
        )
      );
    montarFicha('finanzas');

    const dialogo = await abrirCobroFicha();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });
    fireEvent.click(
      within(dialogo).getByRole('button', { name: /Registrar y Liquidar|Registrar cobro/i })
    );

    const asignar = await within(dialogo).findByRole('button', { name: /Asignar plan/i });
    fireEvent.click(asignar);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(parsearTabFichaAlumno(new URLSearchParams(searchActual()).get('tab'))).toBe('resumen');

    const selector = await selectorDePlan();
    await waitFor(() => expect(document.activeElement).toBe(selector));
  });
});

describe('AlumnoDetallePage · correcciones 1B: ayuda de la fecha según la duración (V11)', () => {
  it('V11 · un plan de 3 meses dice "cada 3 meses" y uno de 1 mes dice "cada mes"', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_TRIMESTRAL.id } });
    expect(await screen.findByText(/las siguientes vencen cada 3 meses/)).toBeTruthy();

    fireEvent.change(selector, { target: { value: PLAN_A.id } });
    expect(await screen.findByText(/las siguientes vencen cada mes/)).toBeTruthy();
  });
});

// 2.ª ronda (reporte 08): los dos hallazgos del reporte 07 ya corregidos en producción.
describe('AlumnoDetallePage · correcciones 1B (2.ª ronda): la reconciliación alinea el selector (R1/R2)', () => {
  it('R1 · el DELETE se aplicó en el servidor: el selector queda vacío y un guardado posterior no emite PUT', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    alBorrarSuscripcion = () => {
      // El servidor SÍ aplicó el DELETE; solo se perdió la respuesta.
      suscripcionServidor = null;
      return Promise.reject(new Error('No se pudo quitar el plan (500).'));
    };
    montarFicha();

    await confirmarQuitarPlan();
    await waitFor(() => expect(llamadasSuscripcion('DELETE')).toHaveLength(1));
    expect(await screen.findByText(/No se pudo quitar el plan/)).toBeTruthy();

    // La reconciliación (GET → null) alinea el selector con el servidor: queda en ''.
    const selector = await selectorDePlan();
    await waitFor(() => expect(selector.value).toBe(''));
    expect((await screen.findAllByText('Sin plan')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Guardar el expediente sin tocar nada: solo el PATCH, ninguna escritura financiera.
    await guardarExpediente();
    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
    expect(postsDeOverride()).toHaveLength(0);
    expect(borradosDeOverride()).toHaveLength(0);
    expect(await screen.findByText('Expediente actualizado con éxito.')).toBeTruthy();
  });

  it('R2 · primer plan rechazado y no aplicado: el selector queda vacío, sin fecha y con el aviso del plan', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    // El PUT rechaza y el servidor NO lo aplicó: la suscripción sigue sin existir.
    alGuardarPut = () => Promise.reject(new Error('Falló el plan.'));
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();

    await guardarExpediente();

    expect(
      await screen.findByText(
        'Los datos del expediente se guardaron, pero no se pudo guardar el plan: Falló el plan.'
      )
    ).toBeTruthy();
    await waitFor(() => expect(selector.value).toBe(''));
    expect(screen.queryByText('Fecha de inicio')).toBeNull();
    expect(llamadasSuscripcion('PUT')).toHaveLength(1);
  });
});

describe('AlumnoDetallePage · correcciones 1B (2.ª ronda): el éxito nombra solo lo escrito (R3)', () => {
  it('R3a · guardado solo del expediente → "Expediente actualizado con éxito."', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: PLAN_A.id, planActivoNombre: PLAN_A.nombre };
    overridesActuales = [overrideDe(PLAN_A)];
    montarFicha();

    // Ficha cargada: plan vigente sin cambios y precio precargado del override, sin tocar.
    await waitFor(() => {
      const precio = controlDeEtiqueta('Precio acordado (USD)', 'input') as HTMLInputElement;
      expect(precio.value).toBe('35.00');
    });
    fireEvent.change(controlDeEtiqueta('Teléfono / WhatsApp', 'input'), {
      target: { value: '+584144444444' },
    });

    await guardarExpediente();

    expect(await screen.findByText('Expediente actualizado con éxito.')).toBeTruthy();
    const patches = mockApi.patch.mock.calls.filter(
      ([endpoint]) => endpoint === `/alumnos/${CLIENTE_ID}`
    );
    expect(patches).toHaveLength(1);
    expect(cuerpoDeLlamada(patches[0]).telefonoWhatsapp).toBe('+584144444444');
    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
    expect(postsDeOverride()).toHaveLength(0);
    expect(borradosDeOverride()).toHaveLength(0);
  });

  it('R3b · asignación de plan sin precio → "Expediente y plan actualizados con éxito."', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    const campo = await campoFechaInicio();
    expect(campo.value).toBe('2026-10-09');

    await guardarExpediente();

    expect(await screen.findByText('Expediente y plan actualizados con éxito.')).toBeTruthy();
    const puts = llamadasSuscripcion('PUT');
    expect(puts).toHaveLength(1);
    expect(cuerpoDeLlamada(puts[0])).toEqual({ planId: PLAN_B.id, fechaInicio: '2026-10-09' });
    expect(postsDeOverride()).toHaveLength(0);
  });

  it('R3c · cambio de precio sin cambio de plan → "Expediente y tarifa actualizados con éxito."', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: PLAN_A.id, planActivoNombre: PLAN_A.nombre };
    overridesActuales = [overrideDe(PLAN_A)];
    montarFicha();

    const precio = await waitFor(() => {
      const control = controlDeEtiqueta('Precio acordado (USD)', 'input') as HTMLInputElement;
      expect(control.value).toBe('35.00');
      return control;
    });
    fireEvent.change(precio, { target: { value: '30.00' } });

    await guardarExpediente();

    expect(await screen.findByText('Expediente y tarifa actualizados con éxito.')).toBeTruthy();
    const posts = postsDeOverride();
    expect(posts).toHaveLength(1);
    expect(cuerpoDeLlamada(posts[0]).precioAcordadoUsd).toBe('30.00');
    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
    expect(borradosDeOverride()).toHaveLength(0);
  });

  it('R3d · primer plan con precio → "Expediente, plan y tarifa actualizados con éxito."', async () => {
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();
    fireEvent.change(controlDeEtiqueta('Precio acordado (USD)', 'input'), {
      target: { value: '35.00' },
    });

    await guardarExpediente();

    expect(
      await screen.findByText('Expediente, plan y tarifa actualizados con éxito.')
    ).toBeTruthy();
    expect(ordenDeLlamadasFinancieras().map((evento) => evento.tipo)).toEqual([
      'post_override',
      'put_suscripcion',
    ]);
  });
});
