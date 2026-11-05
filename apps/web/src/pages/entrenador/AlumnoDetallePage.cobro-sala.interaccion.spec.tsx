// @vitest-environment happy-dom
/**
 * M5-L1B (contrato E): cobro en sala de la ficha del alumno.
 *
 * Fase ROJA: el modal todavía tiene selector de método y campo de referencia, la fecha de
 * operación sale del día UTC (`toISOString`) y no existe clave de idempotencia por intento, ni el
 * aviso "sin plan asignado" con botón `Asignar plan`. Los tests definen el contrato nuevo.
 *
 * Montaje: mismo patrón que `AlumnoDetallePage.control-sala.interaccion.spec.tsx`, con una sonda
 * de ubicación para comprobar a qué pestaña vuelve la ficha. El reloj se fija a
 * `2026-10-09T23:30:00-04:00` (día local del proyecto) para distinguir el día local del UTC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  Moneda,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
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
  precioBaseUsd: '30.00',
};

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
  planActivoId: PLAN_A.id,
  planActivoNombre: PLAN_A.nombre,
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

import { apiClient, ApiError } from '../../lib/api-client';
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

// Respuesta del POST de cobro, configurable por test.
let alHacerPostCobro: () => Promise<unknown>;

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A, PLAN_B]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
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

/** Clave de idempotencia observable en las opciones que la página pasa al apiClient. */
function claveDeOpciones(opciones?: unknown): string | undefined {
  if (!opciones || typeof opciones !== 'object') return undefined;
  const conClave = opciones as { idempotencyKey?: string; headers?: Record<string, string> };
  return conClave.headers?.['X-Idempotency-Key'] ?? conClave.idempotencyKey;
}

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

function llamadasPostCobro(): Array<{ llamada: unknown[]; clave?: string }> {
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(INSTANTE_FALSO));
  sesionMock.isDemoMode = false;
  Element.prototype.scrollIntoView = vi.fn();
  alHacerPostCobro = () => Promise.resolve({ id: 'tx-nueva' });

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST' && endpoint === ENDPOINT_COBRO) return alHacerPostCobro();
    return respuestaGet(endpoint);
  });
  mockApi.post.mockImplementation((endpoint: string) =>
    endpoint === ENDPOINT_COBRO ? alHacerPostCobro() : Promise.resolve(null)
  );
  mockApi.patch.mockImplementation(() => Promise.resolve(PERFIL));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function montarPagina(): void {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=finanzas`]}>
      <SondaUbicacion />
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Abre el modal de cobro en sala de la ficha (la página debe estar montada). */
async function abrirCobro(): Promise<HTMLElement> {
  const abrir = await screen.findByRole('button', { name: /Cobrar en sala/ });
  fireEvent.click(abrir);
  return screen.findByRole('dialog');
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

/** Envía el cobro y espera al primer POST observado. */
async function enviarCobro(dialogo: HTMLElement): Promise<void> {
  const boton = within(dialogo).getByRole('button', {
    name: /Registrar y Liquidar|Registrar cobro/i,
  });
  fireEvent.click(boton);
  await waitFor(() => expect(llamadasPostCobro().length).toBeGreaterThan(0));
}

function searchActual(): string {
  const sonda = screen.getByTestId('sonda-ubicacion').textContent ?? '';
  const indice = sonda.indexOf('?');
  return indice >= 0 ? sonda.slice(indice) : '';
}

describe('AlumnoDetallePage · contrato E: cobro en sala', () => {
  it('E1a · el modal no tiene selector de método ni campo de referencia', async () => {
    montarPagina();
    const dialogo = await abrirCobro();

    expect(within(dialogo).queryByText('Método de Pago')).toBeNull();
    expect(within(dialogo).queryByText(/Referencia/)).toBeNull();
    expect(within(dialogo).queryByText('Efectivo USD')).toBeNull();
  });

  it('E1b · con moneda USD el POST lleva efectivo_usd y la fecha local del día', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });

    await enviarCobro(dialogo);

    const posts = llamadasPostCobro();
    expect(posts).toHaveLength(1);
    const cuerpo = cuerpoDeLlamada(posts[0].llamada);
    expect(cuerpo.metodoPago).toBe('efectivo_usd');
    expect(cuerpo.fechaOperacion).toBe('2026-10-09');
    expect(cuerpo.montoOriginal).toBe('40.00');
  });

  it('E1c · con moneda VES el POST lleva efectivo_ves', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '1500.00' },
    });
    fireEvent.change(controlDeEtiqueta('Moneda', 'select'), {
      target: { value: Moneda.VES },
    });

    await enviarCobro(dialogo);

    const posts = llamadasPostCobro();
    expect(posts).toHaveLength(1);
    expect(cuerpoDeLlamada(posts[0].llamada).metodoPago).toBe('efectivo_ves');
  });

  it('E2a · un fallo y su reintento dentro del mismo modal comparten X-Idempotency-Key', async () => {
    let intentos = 0;
    alHacerPostCobro = () => {
      intentos += 1;
      return intentos === 1
        ? Promise.reject(new Error('El servidor falló (500).'))
        : Promise.resolve({ id: 'tx-1' });
    };
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });

    const boton = within(dialogo).getByRole('button', {
      name: /Registrar y Liquidar|Registrar cobro/i,
    });
    fireEvent.click(boton);
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));
    await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(boton);
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(2));

    const [primer, segundo] = llamadasPostCobro();
    expect(primer.clave).toBeTruthy();
    expect(segundo.clave).toBe(primer.clave);
  });

  it('E2b · tras un éxito, una apertura nueva del modal usa una clave distinta', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });
    await enviarCobro(dialogo);
    // El modal se cierra solo tras el 2xx (comportamiento actual de la ficha).
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });

    const dialogoReabierto = await abrirCobro();
    await enviarCobro(dialogoReabierto);

    const posts = llamadasPostCobro();
    expect(posts).toHaveLength(2);
    expect(posts[0].clave).toBeTruthy();
    expect(posts[1].clave).toBeTruthy();
    expect(posts[1].clave).not.toBe(posts[0].clave);
  });

  it('E3 · mientras se envía, el botón se deshabilita y el doble clic produce un solo POST', async () => {
    let resolver: (valor: unknown) => void = () => undefined;
    alHacerPostCobro = () =>
      new Promise((resolverPromesa) => {
        resolver = resolverPromesa;
      });
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });

    const boton = within(dialogo).getByRole('button', {
      name: /Registrar y Liquidar|Registrar cobro/i,
    }) as HTMLButtonElement;
    fireEvent.click(boton);
    await waitFor(() => expect(boton.disabled).toBe(true));
    fireEvent.click(boton);

    expect(llamadasPostCobro()).toHaveLength(1);
    await act(async () => {
      resolver({ id: 'tx-1' });
    });
  });

  it('E4 · con el 400 de sin plan asignado ofrece Asignar plan y vuelve a la pestaña resumen', async () => {
    alHacerPostCobro = () =>
      Promise.reject(
        new Error(
          'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
        )
      );
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });

    const boton = within(dialogo).getByRole('button', {
      name: /Registrar y Liquidar|Registrar cobro/i,
    });
    fireEvent.click(boton);

    const asignar = await within(dialogo).findByRole('button', { name: /Asignar plan/i });
    expect(within(dialogo).getByText(/Este alumno no tiene un plan asignado/)).toBeTruthy();

    fireEvent.click(asignar);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(parsearTabFichaAlumno(new URLSearchParams(searchActual()).get('tab'))).toBe('resumen');
  });

  it('E5 · en modo demo el cobro no hace peticiones y el éxito se marca como demo', async () => {
    sesionMock.isDemoMode = true;
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '35.00' },
    });

    const boton = within(dialogo).getByRole('button', {
      name: /Registrar y Liquidar|Registrar cobro/i,
    });
    fireEvent.click(boton);

    expect(await within(dialogo).findByText(/demo/i)).toBeTruthy();
    expect(llamadasPostCobro()).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Correcciones del lote (validación 08): contrato V9 (fiabilidad H4) en la ficha.
  // ---------------------------------------------------------------------------

  it('V9 · con el 404 de alumno fuera de lista el modal de la ficha muestra el mensaje amigable', async () => {
    // ApiError real: el traductor (`traducirErrorHttp` + `esMensajeAmigable`) debe dejar pasar el
    // texto del servidor tal cual (fiabilidad H4), no solo el componente mostrarlo.
    alHacerPostCobro = () =>
      Promise.reject(
        new ApiError(404, {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: '',
          message: 'Este alumno no está en tu lista.',
          timestampUtc: '2026-10-09T00:00:00.000Z',
        })
      );
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });

    const boton = within(dialogo).getByRole('button', {
      name: /Registrar y Liquidar|Registrar cobro/i,
    });
    fireEvent.click(boton);

    expect(await within(dialogo).findByText('Este alumno no está en tu lista.')).toBeTruthy();
  });
});
