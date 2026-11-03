// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type ResumenFinancieroAlumnoDTO,
  type TasaCambioVigenteDTO,
} from '@guachafit/shared';
import { formatDecimal, formatMonto } from '../../lib/formato-monto';
import * as pagosMontosModule from '../../lib/pagos-montos';

vi.setConfig({ testTimeout: 20000 });

const { MENSAJE_REFERENCIA_PAGO_REQUERIDA } = pagosMontosModule as unknown as {
  MENSAJE_REFERENCIA_PAGO_REQUERIDA: string;
};

const fm = (v: string, m: 'USD' | 'VES', o?: { conCodigo?: boolean }) =>
  formatMonto(v, m, { ...o, formato: 'coma-decimal' });
const fd = (v: string, decimales: number) =>
  formatDecimal(v, { decimales, formato: 'coma-decimal' });

const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-10-11T12:00:00.000Z',
};

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'a1111111-1111-4111-8111-111111111111',
    email: 'alumno@example.com',
    rol: 'alumno',
    entrenadorId: 'e1111111-1111-4111-8111-111111111111',
    zonaHoraria: 'America/Caracas',
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

let resumenActual: ResumenFinancieroAlumnoDTO;

function esEndpointReporte(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.endsWith('/reportar-pago');
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

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (endpoint.startsWith(`/finanzas/clientes/${ALUMNO_ID}/historial`)) {
    return Promise.resolve(resumenActual);
  }
  return Promise.resolve(null);
}

function resumenBase(overrides: Partial<ResumenFinancieroAlumnoDTO> = {}): ResumenFinancieroAlumnoDTO {
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
      saldoAFavorAplicadoUsd: '0.00',
      estado: 'emitida',
      fechaVencimiento: '2026-10-10T03:59:59.999Z',
    },
    transaccionesTotal: 0,
    transacciones: [],
    ...overrides,
  };
}

function montarPagina(): void {
  render(<PagosPage />);
}

describe('pages/atleta/PagosPage · interacción D11, D15, formato común y validación referencia', () => {
  beforeEach(() => {
    authDemo.modoDemo = false;
    Element.prototype.scrollIntoView = vi.fn();
    resumenActual = resumenBase();

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();

    mockApi.mockImplementation((endpoint: string) => respuestaGet(endpoint));
    mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
    mockApi.post.mockImplementation(() => Promise.resolve(null));
    mockApi.patch.mockImplementation(() => Promise.resolve(null));
    mockApi.delete.mockImplementation(() => Promise.resolve(null));
    mockApi.put.mockImplementation(() => Promise.resolve(null));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('P21: se elige «Zelle (USD)» en «Método de Pago» y la moneda pasa a USD, luego «Pago Móvil (VES)» y pasa a VES', async () => {
    montarPagina();
    const boton = await screen.findByRole('button', { name: /Reportar pago/i });
    fireEvent.click(boton);

    await screen.findByRole('heading', { name: 'Reportar pago' });

    const selectMetodo = screen.getByLabelText('Método de pago');
    const selectMoneda = screen.getByLabelText('Moneda') as HTMLSelectElement;

    fireEvent.change(selectMetodo, { target: { value: MetodoPago.ZELLE } });
    expect(selectMoneda.value).toBe(Moneda.USD);

    fireEvent.change(selectMetodo, { target: { value: MetodoPago.PAGO_MOVIL } });
    expect(selectMoneda.value).toBe(Moneda.VES);
  });

  it('P22: reporte con Zelle y referencia vacía bloquea envío, muestra errorReferencia accesible y se limpia al corregir', async () => {
    montarPagina();
    const boton = await screen.findByRole('button', { name: /Reportar pago/i });
    fireEvent.click(boton);

    await screen.findByRole('heading', { name: 'Reportar pago' });

    const selectMetodo = screen.getByLabelText('Método de pago');
    fireEvent.change(selectMetodo, { target: { value: MetodoPago.ZELLE } });

    const inputMonto = screen.getByLabelText('Monto pagado');
    fireEvent.change(inputMonto, { target: { value: '50.00' } });

    const inputRef = screen.getByLabelText(/Referencia Bancaria/i) as HTMLInputElement;
    fireEvent.change(inputRef, { target: { value: '' } });

    const botonEnviar = screen.getByRole('button', { name: /Enviar Comprobante de Pago/i });
    fireEvent.click(botonEnviar);

    expect(llamadasPostReporte()).toHaveLength(0);
    expect(inputRef.getAttribute('aria-invalid')).toBe('true');

    const alertId = inputRef.getAttribute('aria-describedby');
    expect(alertId).toBeTruthy();
    const alertEl = document.getElementById(alertId!);
    expect(alertEl?.getAttribute('role')).toBe('alert');
    expect(alertEl?.textContent).toContain(MENSAJE_REFERENCIA_PAGO_REQUERIDA);

    fireEvent.change(inputRef, { target: { value: '12345' } });
    expect(inputRef.getAttribute('aria-invalid')).toBeNull();
  });

  it('P23: historial con transacción rechazada al pulsar «Corregir y Reenviar» muestra «Motivo del entrenador:» y el motivo en el formulario', async () => {
    resumenActual = resumenBase({
      transaccionesTotal: 1,
      transacciones: [
        {
          id: 'tx-rechazada-01',
          cuotaId: 'cuota-1',
          montoUsd: '75.00',
          montoBs: '4875.00',
          metodoPago: MetodoPago.ZELLE,
          referencia: 'ZELLE-778899',
          estado: EstadoConciliacion.RECHAZADO,
          motivoRechazo: 'Comprobante borroso',
          createdAtUtc: '2026-10-09T14:00:00.000Z',
        } as any,
      ],
    });

    montarPagina();
    const botonHistorial = await screen.findByRole('button', { name: /Historial/i });
    fireEvent.click(botonHistorial);

    const botonCorregir = await screen.findByRole('button', { name: /Corregir y reenviar/i });
    fireEvent.click(botonCorregir);

    await screen.findByRole('heading', { name: 'Reportar pago' });

    expect(screen.getByText(/Motivo del entrenador:/i)).toBeTruthy();
    expect(document.body.textContent).toContain('Comprobante borroso');
  });

  it('P24: cuota con importes en miles formatea con formato común y no contiene los valores crudos ni el texto «Bolívares»', async () => {
    resumenActual = resumenBase({
      saldoPendienteTotalUsd: '1900.00',
      cuotaMesActual: {
        id: 'cuota-miles-1',
        periodo: '2026-10',
        montoTotalUsd: '2400.00',
        montoPagadoUsd: '500.00',
        saldoPendienteUsd: '1900.00',
        saldoAFavorAplicadoUsd: '10.00',
        estado: 'emitida',
        fechaVencimiento: '2026-10-10T03:59:59.999Z',
      },
    });

    montarPagina();

    await screen.findByText('Saldo pendiente');

    const textoCuerpo = document.body.textContent ?? '';

    expect(textoCuerpo).toContain(fm('1900.00', 'USD', { conCodigo: true }));
    expect(textoCuerpo).toContain(fm('2400.00', 'USD', { conCodigo: true }));
    expect(textoCuerpo).toContain(fd('65.0000', 4));

    expect(textoCuerpo).not.toContain('1900.00');
    expect(textoCuerpo).not.toContain('2400.00');
    expect(textoCuerpo).not.toContain('Bolívares');
  });
});
