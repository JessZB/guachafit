// @vitest-environment jsdom
/**
 * RF-009/RF-007 (pagos con fecha anterior): contrato 8 — modal de cobro en sala de la ficha del
 * alumno (`AlumnoDetallePage`).
 *
 * Fase ROJA: el modal todavía NO tiene campo "Fecha de la operación" (cobra siempre con la fecha
 * de hoy calculada por la página), no valida fechas futuras y no muestra la tasa vigente. La ficha
 * hoy tampoco consulta `/finanzas/tasas/vigente`: el test define que debe conocerla para mostrar
 * `textoTasaCobro` (supuesto documentado en el reporte).
 *
 * Reloj fijo a las 23:30 del día local del proyecto (`America/Caracas`, fijada por
 * `vitest.config.ts`): en UTC ya es el día siguiente.
 *
 * Montaje: mismo patrón que `AlumnoDetallePage.cobro-sala.interaccion.spec.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  Moneda,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type TasaCambioVigenteDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
const ENDPOINT_COBRO = `/finanzas/clientes/${CLIENTE_ID}/cobro-directo-inteligente`;

const MENSAJE_FECHA_PAGO_FUTURA = 'La fecha del pago no puede ser posterior a hoy.';
/** 23:30 del 2026-10-11 en Caracas: en UTC ya es 2026-10-12. */
const INSTANTE_FALSO = '2026-10-11T23:30:00-04:00';
const HOY_LOCAL = '2026-10-11';
const FECHA_ANTERIOR = '2026-09-21';
const TASA_VIGENTE_TEXTO = 'Se convertirá con la tasa vigente al registrar: 1 USD = 65.0000 Bs.';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
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
  zonaHoraria: 'America/Caracas',
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

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: false,
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

// Respuesta del POST de cobro, configurable por test.
let alHacerPostCobro: () => Promise<unknown>;

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
  // La producción pide la tasa con `?clienteId=` (un alumno puede tener tasa especial).
  if (endpoint.startsWith('/finanzas/tasas/vigente')) return Promise.resolve(TASA_VIGENTE);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A]);
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

function llamadasPostCobro(): unknown[][] {
  const viaHelper = mockApi.post.mock.calls.filter(([endpoint]) => endpoint === ENDPOINT_COBRO);
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      endpoint === ENDPOINT_COBRO &&
      (opciones as { method?: string } | undefined)?.method === 'POST'
  );
  return [...viaHelper, ...viaCallable];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(INSTANTE_FALSO));
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

function campoFecha(dialogo: HTMLElement): HTMLInputElement {
  return controlDeEtiqueta('Fecha de la operación', 'input') as HTMLInputElement;
}

describe('AlumnoDetallePage · contrato 8: fecha del pago en el cobro en sala', () => {
  it('8a · aparece "Fecha de la operación" (date) con hoy por defecto y max = hoy', async () => {
    montarPagina();
    const dialogo = await abrirCobro();

    const campo = campoFecha(dialogo);
    expect(campo.getAttribute('type')).toBe('date');
    expect(campo.value).toBe(HOY_LOCAL);
    expect(campo.max).toBe(HOY_LOCAL);
  });

  it('8b · la fecha elegida viaja en el payload del cobro', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });
    fireEvent.change(campoFecha(dialogo), { target: { value: FECHA_ANTERIOR } });

    fireEvent.click(within(dialogo).getByRole('button', { name: /Registrar y Liquidar/i }));
    await waitFor(() => expect(llamadasPostCobro()).toHaveLength(1));

    const cuerpo = cuerpoDeLlamada(llamadasPostCobro()[0]);
    expect(cuerpo.fechaOperacion).toBe(FECHA_ANTERIOR);
  });

  it('8c · con una fecha futura no se envía y se ve el mensaje aprobado', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });
    fireEvent.change(campoFecha(dialogo), { target: { value: '2026-10-12' } });

    fireEvent.click(within(dialogo).getByRole('button', { name: /Registrar y Liquidar/i }));

    expect(await within(dialogo).findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();
    expect(llamadasPostCobro()).toHaveLength(0);
  });

  it('8e · con otro campo obligatorio vacío y fecha válida no se muestra el mensaje de fecha futura', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '' },
    });
    fireEvent.change(campoFecha(dialogo), { target: { value: FECHA_ANTERIOR } });

    fireEvent.click(within(dialogo).getByRole('button', { name: /Registrar y Liquidar/i }));

    // La validación nativa del monto vacío bloquea el envío; la fecha es válida,
    // así que el mensaje propio de fecha futura no debe aparecer.
    await waitFor(() =>
      expect(within(dialogo).queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull()
    );
    expect(llamadasPostCobro()).toHaveLength(0);
  });

  it('8d · con Bs. y tasa conocida se muestra el texto de la tasa', async () => {    montarPagina();
    const dialogo = await abrirCobro();

    fireEvent.change(controlDeEtiqueta('Moneda', 'select'), {
      target: { value: Moneda.VES },
    });

    // La tasa se pide al abrir el modal para el alumno (puede tener tasa especial): la URL debe
    // llevar su `clienteId`.
    await waitFor(() =>
      expect(
        mockApi.mock.calls.some(
          ([endpoint]) => endpoint === `/finanzas/tasas/vigente?clienteId=${ALUMNO_USUARIO_ID}`
        )
      ).toBe(true)
    );
    expect(dialogo.textContent).toContain(TASA_VIGENTE_TEXTO);
  });

  it('4i · al corregir la fecha a una válida el mensaje desaparece sin reenviar (hallazgo 5)', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
      target: { value: '40.00' },
    });
    fireEvent.change(campoFecha(dialogo), { target: { value: '2026-10-12' } });

    fireEvent.click(within(dialogo).getByRole('button', { name: /Registrar y Liquidar/i }));
    expect(await within(dialogo).findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();

    fireEvent.change(campoFecha(dialogo), { target: { value: FECHA_ANTERIOR } });

    await waitFor(() =>
      expect(within(dialogo).queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull()
    );
    expect(llamadasPostCobro()).toHaveLength(0);
  });

  it('6a · `invalid` con rangeOverflow muestra el mensaje propio (hallazgo 6)', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    const campo = campoFecha(dialogo);
    Object.defineProperty(campo, 'validity', {
      value: { rangeOverflow: true },
      configurable: true,
    });

    fireEvent.invalid(campo);

    expect(await within(dialogo).findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();
  });

  it('6b · `invalid` sin rangeOverflow no muestra el mensaje propio (hallazgo 6)', async () => {
    montarPagina();
    const dialogo = await abrirCobro();
    const campo = campoFecha(dialogo);
    Object.defineProperty(campo, 'validity', {
      value: { rangeOverflow: false },
      configurable: true,
    });

    fireEvent.invalid(campo);

    await waitFor(() =>
      expect(within(dialogo).queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull()
    );
  });
});
