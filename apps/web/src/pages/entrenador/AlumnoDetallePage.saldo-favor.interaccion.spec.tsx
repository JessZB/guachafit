// @vitest-environment jsdom
/**
 * RF-006 RN-05 (lote web, prompt 01): excedente del cobro en sala y saldo a favor en la ficha
 * del alumno (`AlumnoDetallePage`).
 *
 * Fija el contrato de la ficha: el éxito del cobro agrega el sufijo del excedente real del API
 * (`transaccion.excedenteUsd`) y la pestaña de finanzas muestra el saldo a favor del alumno
 * (`finanzas.saldoAFavorUsd`) junto al saldo pendiente; con 0.00 no se muestra.
 *
 * Montaje: mismo patrón que `AlumnoDetallePage.cobro-sala.interaccion.spec.tsx` (MemoryRouter con
 * `?tab=finanzas`, endpoints de la ficha mockeados y el POST del cobro configurable por test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
const ENDPOINT_COBRO = `/finanzas/clientes/${CLIENTE_ID}/cobro-directo-inteligente`;

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

function resumenFinanciero(overrides: Partial<ResumenFinancieroAlumnoDTO> = {}): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: CLIENTE_ID,
    usuarioId: ALUMNO_USUARIO_ID,
    saldoPendienteTotalUsd: '0.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '0.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: null,
    transaccionesTotal: 0,
    transacciones: [],
    ...overrides,
  };
}

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

// Configurables por test: resumen del historial y respuesta del POST de cobro.
let resumenActual: ResumenFinancieroAlumnoDTO;
let respuestaPostCobro: Record<string, unknown>;

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A, PLAN_B]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    return Promise.resolve(resumenActual);
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
  Element.prototype.scrollIntoView = vi.fn();
  resumenActual = resumenFinanciero();
  respuestaPostCobro = { transaccion: { excedenteUsd: '0.00' } };

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST' && endpoint === ENDPOINT_COBRO) {
      return Promise.resolve(respuestaPostCobro);
    }
    return respuestaGet(endpoint);
  });
  mockApi.post.mockImplementation((endpoint: string) =>
    endpoint === ENDPOINT_COBRO ? Promise.resolve(respuestaPostCobro) : Promise.resolve(null)
  );
  mockApi.patch.mockImplementation(() => Promise.resolve(PERFIL));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
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

/** Envía el cobro desde el modal abierto. */
function enviarCobro(dialogo: HTMLElement): void {
  fireEvent.change(controlDeEtiqueta('Monto Recibido', 'input'), {
    target: { value: '40.00' },
  });
  fireEvent.click(
    within(dialogo).getByRole('button', { name: /Registrar y Liquidar|Registrar cobro/i })
  );
}

describe('AlumnoDetallePage · contrato 8: excedente del cobro y saldo a favor en la ficha', () => {
  it('8a · con excedente el éxito del cobro termina con el saldo a favor del alumno', async () => {
    respuestaPostCobro = { transaccion: { excedenteUsd: '10.00' } };
    montarPagina();
    const dialogo = await abrirCobro();
    enviarCobro(dialogo);

    expect(
      await within(dialogo).findByText(
        'Cobro directo registrado y liquidado con éxito. 10.00 USD quedaron como saldo a favor del alumno.'
      )
    ).toBeTruthy();
  });

  it('8b · sin excedente el éxito del cobro queda igual que hoy', async () => {
    respuestaPostCobro = { transaccion: { excedenteUsd: '0.00' } };
    montarPagina();
    const dialogo = await abrirCobro();
    enviarCobro(dialogo);

    expect(
      await within(dialogo).findByText('Cobro directo registrado y liquidado con éxito.')
    ).toBeTruthy();
    expect(within(dialogo).queryByText(/quedaron como saldo a favor/)).toBeNull();
  });

  it('8c · con saldo a favor la ficha muestra el texto junto al saldo pendiente (sin tasa)', async () => {
    resumenActual = resumenFinanciero({ saldoAFavorUsd: '10.00' });
    montarPagina();

    expect(await screen.findByText('Saldo a favor: 10.00 USD')).toBeTruthy();
  });

  it('8d · con saldo a favor 0.00 la ficha no lo muestra', async () => {
    resumenActual = resumenFinanciero({ saldoAFavorUsd: '0.00' });
    montarPagina();

    // Espera a que el resumen financiero real esté en pantalla antes de comprobar la ausencia.
    await screen.findByText('Sin deudas activas');
    expect(screen.queryByText(/Saldo a favor/)).toBeNull();
  });
});
