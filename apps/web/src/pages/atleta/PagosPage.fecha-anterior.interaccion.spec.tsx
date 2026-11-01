// @vitest-environment jsdom
/**
 * RF-009/RF-007 (pagos con fecha anterior): contrato 9 — reporte de pago del alumno (`PagosPage`).
 *
 * El formulario tiene el campo "Fecha de Operación" (type=date, obligatorio, con valor por
 * defecto del día LOCAL del dispositivo, `max` = hoy) y validación de fechas futuras: una fecha
 * futura no se envía al API.
 *
 * Reloj fijo a las 23:30 del día local del proyecto (`America/Caracas`, fijada por
 * `vitest.config.ts`): en UTC ya es el día siguiente, así que un valor por defecto calculado con
 * `toISOString()` sería mañana y bloquearía el envío (hallazgo 1 del reporte 04).
 *
 * Montaje: mismo patrón que `PagosPage.reversion.interaccion.spec.tsx` (la página no usa router ni
 * TanStack Query; `useAuth` mockeado con un alumno titular y el resumen del historial por mock).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ResumenFinancieroAlumnoDTO, TasaCambioVigenteDTO } from '@guachafit/shared';

const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

const MENSAJE_FECHA_PAGO_FUTURA = 'La fecha del pago no puede ser posterior a hoy.';
/** 23:30 del 2026-10-11 en Caracas: en UTC ya es 2026-10-12. */
const INSTANTE_FALSO = '2026-10-11T23:30:00-04:00';
const HOY_LOCAL = '2026-10-11';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
};

function resumenBase(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'perfil-alumno-1',
    usuarioId: ALUMNO_ID,
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '0.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-10-10T03:59:59.999Z',
    },
    transaccionesTotal: 0,
    transacciones: [],
  };
}

// `vi.hoisted`: el usuario debe ser el MISMO objeto en cada render; con una identidad nueva por
// render, el efecto de carga de la página (`[user, isDemoMode]`) se dispara en bucle.
const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'a1111111-1111-4111-8111-111111111111',
    email: 'alumno@example.com',
    rol: 'alumno',
    entrenadorId: 'e1111111-1111-4111-8111-111111111111',
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

import { apiClient } from '../../lib/api-client';
import { PagosPage } from './PagosPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

// Respuesta del POST de reporte, configurable por test.
let alHacerPostReporte: () => Promise<unknown>;

function esEndpointReporte(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/reportar-pago');
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (endpoint.startsWith(`/finanzas/clientes/${ALUMNO_ID}/historial`)) {
    return Promise.resolve(resumenBase());
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

function llamadasPostReporte(): unknown[][] {
  const viaHelper = mockApi.post.mock.calls.filter(([endpoint]) => esEndpointReporte(endpoint));
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      esEndpointReporte(endpoint) &&
      (opciones as { method?: string } | undefined)?.method === 'POST'
  );
  return [...viaHelper, ...viaCallable];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(INSTANTE_FALSO));
  authDemo.modoDemo = false;
  Element.prototype.scrollIntoView = vi.fn();
  alHacerPostReporte = () => Promise.resolve({ id: 'tx-nueva' });

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST' && esEndpointReporte(endpoint)) return alHacerPostReporte();
    return respuestaGet(endpoint);
  });
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.post.mockImplementation((endpoint: string) =>
    esEndpointReporte(endpoint) ? alHacerPostReporte() : Promise.resolve(null)
  );
  mockApi.patch.mockImplementation(() => Promise.resolve(null));
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
  render(<PagosPage />);
}

/** Abre el formulario de reporte desde el hub de la página. */
async function abrirFormulario(): Promise<void> {
  fireEvent.click(
    await screen.findByRole('button', { name: /Reportar un nuevo abono o pago/ })
  );
  await screen.findByText('Reportar Abono o Cuota');
}

/** Campo "Fecha de Operación" del formulario. */
function campoFechaPago(): HTMLInputElement {
  return screen.getByLabelText('Fecha de Operación') as HTMLInputElement;
}

describe('PagosPage · contrato 9: fecha del pago en el reporte del alumno', () => {
  it('9a · el campo de fecha del pago tiene max = hoy', async () => {
    montarPagina();
    await abrirFormulario();

    expect(campoFechaPago().max).toBe(HOY_LOCAL);
  });

  it('9b · con una fecha futura muestra el mensaje aprobado y no envía el reporte', async () => {
    montarPagina();
    await abrirFormulario();
    fireEvent.change(campoFechaPago(), { target: { value: '2026-10-12' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));

    expect(await screen.findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();
    expect(llamadasPostReporte()).toHaveLength(0);
  });

  it('9c · una fecha anterior viaja en el payload del reporte (regresión del campo actual)', async () => {
    montarPagina();
    await abrirFormulario();
    fireEvent.change(screen.getByLabelText('Monto Pagado'), { target: { value: '1300.00' } });
    fireEvent.change(campoFechaPago(), { target: { value: '2026-09-21' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));
    await screen.findByText(/Pago reportado con éxito/);

    expect(llamadasPostReporte()).toHaveLength(1);
    expect(cuerpoDeLlamada(llamadasPostReporte()[0]).fechaOperacion).toBe('2026-09-21');
  });

  it('9d · con otro campo obligatorio vacío y fecha válida no se muestra el mensaje de fecha futura', async () => {
    montarPagina();
    await abrirFormulario();
    const campoMonto = screen.getByLabelText('Monto Pagado');
    fireEvent.change(campoMonto, { target: { value: '' } });
    fireEvent.change(campoFechaPago(), { target: { value: '2026-09-21' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));

    // La validación nativa del monto vacío bloquea el envío; la fecha es válida,
    // así que el mensaje propio de fecha futura no debe aparecer.
    await waitFor(() => expect(screen.queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull());
    expect(llamadasPostReporte()).toHaveLength(0);
  });

  it('1a · el campo de fecha monta el día LOCAL, no el día UTC (hallazgo 1)', async () => {
    montarPagina();
    await abrirFormulario();

    // A las 23:30 de Caracas en UTC ya es 2026-10-12: con el defecto UTC el campo amanecería
    // en 2026-10-12 (futuro según `max`) y el envío se autobloquearía cada noche.
    expect(campoFechaPago().value).toBe(HOY_LOCAL);
    expect(campoFechaPago().value).not.toBe('2026-10-12');
  });

  it('1b · enviar sin tocar la fecha no muestra el mensaje de fecha futura (hallazgo 1)', async () => {
    montarPagina();
    await abrirFormulario();
    fireEvent.change(screen.getByLabelText('Monto Pagado'), { target: { value: '1300.00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));
    await screen.findByText(/Pago reportado con éxito/);

    expect(screen.queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull();
    expect(llamadasPostReporte()).toHaveLength(1);
    expect(cuerpoDeLlamada(llamadasPostReporte()[0]).fechaOperacion).toBe(HOY_LOCAL);
  });

  it('4i · al corregir la fecha a una válida el mensaje desaparece sin reenviar (hallazgo 5)', async () => {
    montarPagina();
    await abrirFormulario();
    fireEvent.change(campoFechaPago(), { target: { value: '2026-10-12' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Comprobante de Pago' }));
    expect(await screen.findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();

    fireEvent.change(campoFechaPago(), { target: { value: '2026-09-21' } });

    await waitFor(() => expect(screen.queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull());
    expect(llamadasPostReporte()).toHaveLength(0);
  });

  it('6a · `invalid` con rangeOverflow muestra el mensaje propio (hallazgo 6)', async () => {
    montarPagina();
    await abrirFormulario();
    const campo = campoFechaPago();
    Object.defineProperty(campo, 'validity', {
      value: { rangeOverflow: true },
      configurable: true,
    });

    fireEvent.invalid(campo);

    expect(await screen.findByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeTruthy();
  });

  it('6b · `invalid` sin rangeOverflow no muestra el mensaje propio (hallazgo 6)', async () => {
    montarPagina();
    await abrirFormulario();
    const campo = campoFechaPago();
    Object.defineProperty(campo, 'validity', {
      value: { rangeOverflow: false },
      configurable: true,
    });

    fireEvent.invalid(campo);

    await waitFor(() => expect(screen.queryByText(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull());
  });
});
