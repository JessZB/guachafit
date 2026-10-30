// @vitest-environment jsdom
/**
 * RF-007 (lote web): estado y reversión de pagos en la ficha del alumno
 * (`AlumnoDetallePage`, pestaña de finanzas → historial de transacciones).
 *
 * Fija el contrato: cada fila muestra su etiqueta de estado (`etiquetaEstadoTransaccion`); las
 * filas aprobadas ofrecen `Revertir pago` (oculto en modo demo) y abren un diálogo que identifica
 * el pago (monto, método y referencia) con motivo obligatorio; confirmar hace
 * `POST /finanzas/transacciones/:id/revertir` una sola vez, muestra el mensaje, recarga el
 * historial y el resumen, y cierra; un 409 de saldo a favor usado se ve dentro del diálogo sin
 * recargar; cancelar limpia motivo y error.
 *
 * Montaje: mismo patrón que `AlumnoDetallePage.saldo-favor.interaccion.spec.tsx` (MemoryRouter con
 * `?tab=finanzas`, endpoints de la ficha mockeados, resumen financiero y respuesta/errores del
 * POST de reversión configurables por test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EstadoAlumno,
  MENSAJE_REVERSION_SALDO_USADO,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
const ENDPOINT_REVERTIR = '/finanzas/transacciones/tx-aprobada-1/revertir';
const MENSAJE_REVERSION = 'Pago revertido. La cuota volvió a su saldo anterior.';

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

/** Historial con una fila de cada estado visible (incluida la revertida). */
const TRANSACCIONES_HISTORIAL: ResumenFinancieroAlumnoDTO['transacciones'] = [
  {
    id: 'tx-aprobada-1',
    cuotaId: 'cuota-1',
    montoUsd: '20.00',
    metodoPago: 'pago_movil',
    referencia: 'APROB-01',
    estado: 'aprobado',
    createdAtUtc: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'tx-rechazada-1',
    cuotaId: 'cuota-1',
    montoUsd: '15.00',
    metodoPago: 'transferencia_bancaria',
    referencia: 'RECH-02',
    estado: 'rechazado',
    createdAtUtc: '2026-09-30T10:00:00.000Z',
  },
  {
    id: 'tx-pendiente-1',
    cuotaId: 'cuota-1',
    montoUsd: '10.00',
    metodoPago: 'pago_movil',
    referencia: 'PEND-03',
    estado: 'pendiente',
    createdAtUtc: '2026-09-29T10:00:00.000Z',
  },
  {
    id: 'tx-revertida-1',
    cuotaId: 'cuota-1',
    montoUsd: '25.00',
    metodoPago: 'zelle',
    referencia: 'REV-04',
    estado: 'revertido',
    createdAtUtc: '2026-09-28T10:00:00.000Z',
  },
];

function resumenFinanciero(overrides: Partial<ResumenFinancieroAlumnoDTO> = {}): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: CLIENTE_ID,
    usuarioId: ALUMNO_USUARIO_ID,
    saldoPendienteTotalUsd: '0.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '0.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: null,
    transaccionesTotal: TRANSACCIONES_HISTORIAL.length,
    transacciones: TRANSACCIONES_HISTORIAL,
    ...overrides,
  };
}

// `vi.hoisted`: modo demo configurable por test; el usuario se mantiene estable entre renders.
const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'e1111111-1111-4111-8111-111111111111',
    email: 'coach@example.com',
    rol: 'entrenador',
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: authDemo.usuario,
    isDemoMode: authDemo.modoDemo,
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
import { AlumnoDetallePage } from './AlumnoDetallePage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

// Configurables por test: resumen del historial, respuesta del POST de reversión (o una promesa
// controlada para observar el estado en vuelo) y su error.
let resumenActual: ResumenFinancieroAlumnoDTO;
let respuestaPostReversion: Record<string, unknown>;
let respuestaPostPendiente: Promise<unknown> | null;
let errorPostReversion: unknown;
let llamadasHistorial = 0;

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A, PLAN_B]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    llamadasHistorial += 1;
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

function respuestaPost(): Promise<unknown> {
  if (respuestaPostPendiente) return respuestaPostPendiente;
  if (errorPostReversion) return Promise.reject(errorPostReversion);
  return Promise.resolve(respuestaPostReversion);
}

/** Cuerpo JSON normalizado (la página puede enviarlo como objeto o como string serializado). */
function cuerpoNormalizado(cuerpo: unknown): unknown {
  if (typeof cuerpo !== 'string') return cuerpo;
  try {
    return JSON.parse(cuerpo);
  } catch {
    return cuerpo;
  }
}

/** POST registrados contra el endpoint de reversión, vengan por `apiClient` o `apiClient.post`. */
function llamadasPostReversion(): Array<{ endpoint: string; cuerpo: unknown }> {
  const resultado: Array<{ endpoint: string; cuerpo: unknown }> = [];
  for (const llamada of mockApi.mock.calls) {
    const [endpoint, opciones] = llamada as [
      string,
      { method?: string; body?: unknown } | undefined,
    ];
    if (endpoint === ENDPOINT_REVERTIR && opciones?.method === 'POST') {
      resultado.push({ endpoint, cuerpo: cuerpoNormalizado(opciones.body) });
    }
  }
  for (const llamada of mockApi.post.mock.calls) {
    const [endpoint, cuerpo] = llamada as [string, unknown];
    if (endpoint === ENDPOINT_REVERTIR) {
      resultado.push({ endpoint, cuerpo: cuerpoNormalizado(cuerpo) });
    }
  }
  return resultado;
}

/** Fila del historial que contiene la referencia indicada (la más cercana con `rounded-2xl`). */
function filaDeTransaccion(referencia: string): HTMLElement {
  const nodo = screen.getByText(new RegExp(`Ref: ${referencia}`));
  const fila = nodo.closest('.rounded-2xl');
  if (!fila) throw new Error(`No se encontró la fila de la referencia ${referencia}.`);
  return fila as HTMLElement;
}

/** Control del campo con la etiqueta exacta dentro del diálogo (htmlFor o label contenedor). */
function campoDeEtiqueta(dialogo: HTMLElement, texto: string): HTMLElement {
  const etiqueta = Array.from(dialogo.querySelectorAll('label')).find(
    (candidata) => candidata.textContent?.trim() === texto
  );
  const control =
    (etiqueta?.htmlFor ? document.getElementById(etiqueta.htmlFor) : null) ??
    etiqueta?.parentElement?.querySelector('input, textarea') ??
    null;
  if (!control) throw new Error(`No se encontró el campo «${texto}» dentro del diálogo.`);
  return control as HTMLElement;
}

/** Abre el diálogo de reversión desde la fila aprobada. */
async function abrirDialogoReversion(): Promise<HTMLElement> {
  fireEvent.click(
    within(filaDeTransaccion('APROB-01')).getByRole('button', {
      name: 'Revertir pago de 20.00 USD',
    })
  );
  return screen.findByRole('dialog');
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authDemo.modoDemo = false;
  resumenActual = resumenFinanciero();
  respuestaPostReversion = { transaccion: null, cuota: null, mensaje: MENSAJE_REVERSION };
  respuestaPostPendiente = null;
  errorPostReversion = null;
  llamadasHistorial = 0;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation(
    (endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'POST' && endpoint === ENDPOINT_REVERTIR) {
        return respuestaPost();
      }
      return respuestaGet(endpoint);
    }
  );
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.post.mockImplementation((endpoint: string) =>
    endpoint === ENDPOINT_REVERTIR ? respuestaPost() : Promise.resolve(null)
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

describe('AlumnoDetallePage · RF-007: estado y reversión en el historial (contratos 7-11)', () => {
  it('7a · las filas aprobada y rechazada muestran "Verificado" y "Rechazado"', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    expect(within(filaDeTransaccion('APROB-01')).getByText('Verificado')).toBeTruthy();
    expect(within(filaDeTransaccion('RECH-02')).getByText('Rechazado')).toBeTruthy();
  });

  it('7b · las filas pendiente y revertida muestran "En Revisión" y "Revertido"', async () => {
    montarPagina();
    await screen.findByText(/Ref: PEND-03/);

    expect(within(filaDeTransaccion('PEND-03')).getByText('En Revisión')).toBeTruthy();
    expect(within(filaDeTransaccion('REV-04')).getByText('Revertido')).toBeTruthy();
  });

  it('8a · solo la fila aprobada muestra "Revertir pago" con el aria-label del monto', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    within(filaDeTransaccion('APROB-01')).getByRole('button', {
      name: 'Revertir pago de 20.00 USD',
    });
    for (const referencia of ['RECH-02', 'PEND-03', 'REV-04']) {
      expect(
        within(filaDeTransaccion(referencia)).queryByRole('button', { name: /Revertir pago/ })
      ).toBeNull();
    }
  });

  it('8b · en modo demo no se muestra el botón de reversión', async () => {
    authDemo.modoDemo = true;
    montarPagina();
    await screen.findByText(/Ref: REF-789456/);

    expect(screen.queryByRole('button', { name: /Revertir pago/ })).toBeNull();
  });

  it('9a · el botón abre el diálogo de reversión con título, texto y campo de motivo', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    expect(dialogo.textContent).toContain('¿Revertir este pago?');
    expect(dialogo.textContent).toContain(
      'La cuota volverá a mostrar ese monto como pendiente y el alumno recibirá un aviso con el motivo.'
    );
    campoDeEtiqueta(dialogo, 'Motivo de la reversión');
  });

  it('9b · "Revertir pago" queda deshabilitado mientras el motivo está vacío', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    const confirmar = within(dialogo).getByRole('button', {
      name: 'Revertir pago',
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });

    await waitFor(() =>
      expect(
        (within(dialogo).getByRole('button', { name: 'Revertir pago' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
  });

  it('9c · el diálogo identifica el pago con monto, método y referencia', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    expect(dialogo.textContent).toContain('Pago de 20.00 USD · Pago móvil · Ref: APROB-01');
  });

  it('9d · sin referencia, el diálogo identifica el pago solo con monto y método', async () => {
    resumenActual = resumenFinanciero({
      transacciones: [
        {
          id: 'tx-aprobada-sin-ref',
          cuotaId: 'cuota-1',
          montoUsd: '12.50',
          metodoPago: 'efectivo_usd',
          estado: 'aprobado',
          createdAtUtc: '2026-10-02T10:00:00.000Z',
        },
      ],
      transaccionesTotal: 1,
    });
    montarPagina();
    await screen.findByRole('button', { name: 'Revertir pago de 12.50 USD' });

    fireEvent.click(screen.getByRole('button', { name: 'Revertir pago de 12.50 USD' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain('Pago de 12.50 USD · Efectivo en dólares');
    expect(dialogo.textContent).not.toContain('Ref:');
  });

  it('10a · confirmar hace POST con el motivo, muestra el mensaje y cierra el diálogo', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir pago' }));

    await waitFor(() => expect(llamadasPostReversion()).toHaveLength(1));
    expect(llamadasPostReversion()[0]).toEqual({
      endpoint: ENDPOINT_REVERTIR,
      cuerpo: { motivo: 'Cobro duplicado' },
    });
    expect(await screen.findByText(MENSAJE_REVERSION)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('10b · confirmar vuelve a pedir el historial financiero', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);
    const llamadasAntes = llamadasHistorial;

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir pago' }));

    await waitFor(() => expect(llamadasHistorial).toBeGreaterThan(llamadasAntes));
  });

  it('10c · doble clic en "Revertir pago": un solo POST mientras el envío está en vuelo', async () => {
    let resolver!: (valor: unknown) => void;
    respuestaPostPendiente = new Promise((res) => {
      resolver = res;
    });
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    const confirmar = within(dialogo).getByRole('button', {
      name: 'Revertir pago',
    }) as HTMLButtonElement;

    fireEvent.click(confirmar);
    await waitFor(() => expect(confirmar.disabled).toBe(true));
    fireEvent.click(confirmar);

    expect(llamadasPostReversion()).toHaveLength(1);

    // Se resuelve el envío para no dejar la promesa en vuelo al desmontar.
    resolver(respuestaPostReversion);
    expect(await screen.findByText(MENSAJE_REVERSION)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(llamadasPostReversion()).toHaveLength(1);
  });

  it('10d · Escape y clic en el fondo durante la reversión en vuelo no cierran el diálogo', async () => {
    let resolver!: (valor: unknown) => void;
    respuestaPostPendiente = new Promise((res) => {
      resolver = res;
    });
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir pago' }));
    await waitFor(() =>
      expect(
        (within(dialogo).getByRole('button', { name: 'Revertir pago' }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeNull();

    fireEvent.click(dialogo.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(llamadasPostReversion()).toHaveLength(1);

    // Se resuelve el envío para no dejar la promesa en vuelo al desmontar.
    resolver(respuestaPostReversion);
    expect(await screen.findByText(MENSAJE_REVERSION)).toBeTruthy();
  });

  it('10e · cancelar limpia el motivo: al reabrir el campo está vacío y confirmar deshabilitado', async () => {
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const reabierto = await abrirDialogoReversion();
    const campo = campoDeEtiqueta(reabierto, 'Motivo de la reversión') as HTMLTextAreaElement;
    expect(campo.value).toBe('');
    expect(
      (within(reabierto).getByRole('button', { name: 'Revertir pago' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('10f · cancelar tras un 409 limpia el error: al reabrir no reaparece', async () => {
    errorPostReversion = new ApiError(
      409,
      {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: MENSAJE_REVERSION_SALDO_USADO,
        message: MENSAJE_REVERSION_SALDO_USADO,
        timestampUtc: '2026-10-11T00:00:00.000Z',
      },
      MENSAJE_REVERSION_SALDO_USADO
    );
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir pago' }));
    await within(dialogo).findByText(MENSAJE_REVERSION_SALDO_USADO);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const reabierto = await abrirDialogoReversion();
    expect(within(reabierto).queryByText(MENSAJE_REVERSION_SALDO_USADO)).toBeNull();
  });

  it('10g · tras revertir, el resumen superior refresca con los datos nuevos', async () => {
    const cuota = {
      id: 'cuota-1',
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-10-10T03:59:59.999Z',
    };
    resumenActual = resumenFinanciero({
      saldoPendienteTotalUsd: '40.00',
      cuotaMesActual: cuota,
    });
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);

    const tarjetaSaldo = screen
      .getByText('Saldo Pendiente Actual')
      .closest('.rounded-3xl') as HTMLElement;
    expect(within(tarjetaSaldo).getByText('$40.00')).toBeTruthy();

    // El API entrega el resumen recalculado cuando la página recarga tras revertir.
    resumenActual = resumenFinanciero({
      saldoPendienteTotalUsd: '20.00',
      cuotaMesActual: { ...cuota, montoPagadoUsd: '20.00', saldoPendienteUsd: '20.00' },
    });

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir pago' }));

    await waitFor(() => expect(within(tarjetaSaldo).getByText('$20.00')).toBeTruthy());
    expect(within(tarjetaSaldo).queryByText('$40.00')).toBeNull();

    const tarjetaCuota = screen.getByText('Saldo Restante').closest('.rounded-2xl') as HTMLElement;
    expect(within(tarjetaCuota).getByText('$20.00 USD')).toBeTruthy();
  });

  it('11 · el 409 de saldo usado se ve dentro del diálogo, que sigue abierto y no recarga', async () => {
    errorPostReversion = new ApiError(
      409,
      {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: MENSAJE_REVERSION_SALDO_USADO,
        message: MENSAJE_REVERSION_SALDO_USADO,
        timestampUtc: '2026-10-11T00:00:00.000Z',
      },
      MENSAJE_REVERSION_SALDO_USADO
    );
    montarPagina();
    await screen.findByText(/Ref: APROB-01/);
    const llamadasAntes = llamadasHistorial;

    const dialogo = await abrirDialogoReversion();
    fireEvent.change(campoDeEtiqueta(dialogo, 'Motivo de la reversión'), {
      target: { value: 'Cobro duplicado' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir pago' }));

    expect(await within(dialogo).findByText(MENSAJE_REVERSION_SALDO_USADO)).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(llamadasHistorial).toBe(llamadasAntes);
  });
});
