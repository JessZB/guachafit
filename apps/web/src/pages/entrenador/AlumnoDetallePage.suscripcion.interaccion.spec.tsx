// @vitest-environment jsdom
/**
 * M5-L1B (contrato D): la ficha del alumno toma el plan de la SUSCRIPCIÓN.
 *
 * Fase ROJA: la página todavía no consulta `/finanzas/suscripciones/:clienteId` ni ofrece
 * `Quitar plan` / `Fecha de inicio`; el override sigue asignando el plan. Estos tests definen el
 * comportamiento nuevo y fallan por eso, no por el montaje.
 *
 * Montaje: mismo patrón que `AlumnoDetallePage.control-sala.interaccion.spec.tsx` (router de
 * memoria, `apiClient` parcialmente mockeado con `get/post/patch/delete/put` y auth mockeada).
 * El reloj se fija a `2026-10-09T23:30:00-04:00` (hora local del proyecto) para que "hoy local"
 * sea `2026-10-09` y no el día UTC (`2026-10-10`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const SUSCRIPCION_A: SuscripcionAlumnoDTO = {
  clienteId: ALUMNO_USUARIO_ID,
  planId: PLAN_A.id,
  planNombre: PLAN_A.nombre,
  duracionMeses: 1,
  fechaInicio: '2026-10-01',
  proximoCorte: '2026-11-14',
  cuotaEmitidaId: null,
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
import { AlumnoDetallePage } from './AlumnoDetallePage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

// Estado mutable por test: lo que devuelve el servidor mockeado.
let perfilActual: PerfilAlumnoDetalleDTO = PERFIL_BASE;
let overridesActuales: OverridePlanDetalleDTO[] = [];
let suscripcionServidor: SuscripcionAlumnoDTO | null = null;
let alGuardarPut: (cuerpo: Record<string, unknown>) => Promise<unknown>;

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
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A, PLAN_B]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve(overridesActuales);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(suscripcionServidor);
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

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'PUT') return alGuardarPut(cuerpoDeLlamada([endpoint, opciones]));
    return respuestaGet(endpoint);
  });
  mockApi.put.mockImplementation((_endpoint: string, cuerpo: unknown) =>
    alGuardarPut(cuerpoDeLlamada([_endpoint, cuerpo]))
  );
  mockApi.patch.mockImplementation((_endpoint: string, cuerpo: Record<string, unknown>) =>
    Promise.resolve({ ...perfilActual, ...cuerpo })
  );
  mockApi.post.mockImplementation(() => Promise.resolve({ id: 'tx-nueva' }));
  mockApi.delete.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/finanzas/suscripciones/')) {
      suscripcionServidor = null;
      return Promise.resolve({ desactivada: true });
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

function montarFicha(): void {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}`]}>
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
        (opcion) => opcion.value === PLAN_A.id || opcion.value === PLAN_B.id
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

function borradosDeOverride(): unknown[][] {
  return mockApi.delete.mock.calls.filter(([endpoint]) =>
    String(endpoint).startsWith('/finanzas/planes/override/')
  );
}

describe('AlumnoDetallePage · contrato D: plan desde la suscripción', () => {
  it('D1 · con suscripción, el selector muestra su plan, la próxima cuota y Quitar plan', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    await waitFor(() => expect(selector.value).toBe(PLAN_A.id));

    const aviso = await screen.findByText(/Próxima cuota: vence el/);
    expect(aviso.textContent).toContain('14/11/2026');
    expect(screen.queryByText('Fecha de inicio')).toBeNull();
    expect(screen.getByRole('button', { name: /Quitar plan/i })).toBeTruthy();
  });

  it('D2 · sin suscripción, el plan heredado del override no se muestra ni se borra al guardar', async () => {
    suscripcionServidor = null;
    perfilActual = {
      ...PERFIL_BASE,
      planActivoId: PLAN_A.id,
      planActivoNombre: PLAN_A.nombre,
    };
    overridesActuales = [overrideDe(PLAN_A)];
    montarFicha();

    const selector = await selectorDePlan();
    await waitFor(() => expect(selector.value).toBe(''));
    expect((await screen.findAllByText('Sin plan')).length).toBeGreaterThan(0);

    await guardarExpediente();

    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
    expect(llamadasSuscripcion('DELETE')).toHaveLength(0);
    expect(borradosDeOverride()).toHaveLength(0);
  });

  it('D3 · sin suscripción, al elegir plan aparece Fecha de inicio y el PUT la envía', async () => {
    suscripcionServidor = null;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });

    const campo = await campoFechaInicio();
    expect(campo.type).toBe('date');
    expect(campo.value).toBe('2026-10-09');
    expect(campo.min).toBe('2026-09-09');
    expect(campo.max).toBe('2026-12-08');

    await guardarExpediente();

    const puts = llamadasSuscripcion('PUT');
    expect(puts).toHaveLength(1);
    expect(cuerpoDeLlamada(puts[0])).toEqual({
      planId: PLAN_B.id,
      fechaInicio: '2026-10-09',
    });

    const aviso = await screen.findByText(/Próxima cuota: vence el/);
    expect(aviso.textContent).toContain('01/12/2026');
  });

  it('D4 · si el PUT falla con 400, se avisa y no se toca el override', async () => {
    suscripcionServidor = null;
    alGuardarPut = () => Promise.reject(new Error('El plan no está disponible.'));
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const selector = await selectorDePlan();
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    await campoFechaInicio();

    await guardarExpediente();

    expect(
      await screen.findByText(
        /Los datos del expediente se guardaron, pero no se pudo guardar el plan: El plan no está disponible\./
      )
    ).toBeTruthy();
    expect(
      mockApi.post.mock.calls.filter(([endpoint]) =>
        String(endpoint).includes('/finanzas/planes/override')
      )
    ).toHaveLength(0);
    expect(
      mockApi.delete.mock.calls.filter(([endpoint]) =>
        String(endpoint).includes('/finanzas/planes/override')
      )
    ).toHaveLength(0);
  });

  it('D5 · con suscripción, cambiar de plan envía el PUT sin fechaInicio', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = {
      ...PERFIL_BASE,
      planActivoId: PLAN_A.id,
      planActivoNombre: PLAN_A.nombre,
    };
    montarFicha();

    const selector = await selectorDePlan();
    await waitFor(() => expect(selector.value).toBe(PLAN_A.id));
    fireEvent.change(selector, { target: { value: PLAN_B.id } });
    expect(screen.queryByText('Fecha de inicio')).toBeNull();

    await guardarExpediente();

    const puts = llamadasSuscripcion('PUT');
    expect(puts).toHaveLength(1);
    const cuerpo = cuerpoDeLlamada(puts[0]);
    expect(cuerpo.planId).toBe(PLAN_B.id);
    expect(cuerpo.fechaInicio).toBeUndefined();
  });

  it('D6a · Quitar plan pide confirmación y al cancelar no llama al DELETE', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const quitar = await screen.findByRole('button', { name: /Quitar plan/i });
    fireEvent.click(quitar);
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }));

    expect(llamadasSuscripcion('DELETE')).toHaveLength(0);
  });

  it('D6b · Quitar plan confirmado llama al DELETE y la tarjeta queda Sin plan', async () => {
    suscripcionServidor = SUSCRIPCION_A;
    perfilActual = { ...PERFIL_BASE, planActivoId: null, planActivoNombre: null };
    montarFicha();

    const quitar = await screen.findByRole('button', { name: /Quitar plan/i });
    fireEvent.click(quitar);
    const dialogo = await screen.findByRole('dialog');
    const confirmar = within(dialogo)
      .getAllByRole('button')
      .find((boton) => !/cancelar/i.test(boton.textContent ?? ''));
    expect(confirmar).toBeTruthy();
    fireEvent.click(confirmar as HTMLElement);

    await waitFor(() => expect(llamadasSuscripcion('DELETE')).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getAllByText('Sin plan').length).toBeGreaterThan(0)
    );
  });

  it('D7 · si la suscripción no carga, avisa, deshabilita el selector y no llama al PUT/DELETE', async () => {
    suscripcionServidor = null;
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PUT') return alGuardarPut(cuerpoDeLlamada([endpoint, opciones]));
      if (endpoint.startsWith('/finanzas/suscripciones/')) {
        return Promise.reject(new Error('No se pudo cargar la suscripción (500).'));
      }
      return respuestaGet(endpoint);
    });
    perfilActual = {
      ...PERFIL_BASE,
      planActivoId: PLAN_A.id,
      planActivoNombre: PLAN_A.nombre,
    };
    montarFicha();

    const selector = await selectorDePlan();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((aviso) => /No se pudo cargar/i.test(aviso.textContent ?? ''))
      ).toBe(true)
    );
    expect(selector.disabled).toBe(true);

    await guardarExpediente();

    expect(llamadasSuscripcion('PUT')).toHaveLength(0);
    expect(llamadasSuscripcion('DELETE')).toHaveLength(0);
  });

  it('D8 · en modo demo la tarjeta muestra la suscripción demo y ninguna acción llama al API', async () => {
    sesionMock.isDemoMode = true;
    montarFicha();

    const aviso = await screen.findByText(/Próxima cuota: vence el/);
    expect(aviso.textContent).toContain('29/10/2026');

    const guardar = await screen.findByRole('button', { name: /Guardar cambios/ });
    fireEvent.click(guardar);
    await waitFor(() => expect((guardar as HTMLButtonElement).disabled).toBe(false));

    expect(mockApi).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(mockApi.patch).not.toHaveBeenCalled();
    expect(mockApi.delete).not.toHaveBeenCalled();
    expect(mockApi.put).not.toHaveBeenCalled();
  });
});
