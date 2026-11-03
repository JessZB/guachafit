// @vitest-environment jsdom
/**
 * ZH-2: tests en fase roja para `PagosPage` (integración).
 * Contrato 7:
 * Con perfil Tokio y el reloj de referencia (2026-11-03T20:00:00Z), el campo de fecha del
 * formulario de reporte (tras abrir la opción de reportar pago) muestra value 2026-11-04 y max 2026-11-04.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ResumenFinancieroAlumnoDTO, TasaCambioVigenteDTO } from '@guachafit/shared';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';

const { ALUMNO_ID, COACH_ID, authDemo, mockApi } = vi.hoisted(() => {
  const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
  const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
  return {
    ALUMNO_ID,
    COACH_ID,
    authDemo: {
      modoDemo: false,
      usuario: {
        id: ALUMNO_ID,
        email: 'alumno.tokyo@example.com',
        rol: 'alumno',
        entrenadorId: COACH_ID,
        zonaHoraria: 'Asia/Tokyo',
      },
    },
    mockApi: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

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
    apiClient: mockApi,
  };
});

import { PagosPage } from './PagosPage';

const TASA_VIGENTE: TasaCambioVigenteDTO = {
  entrenadorId: COACH_ID,
  tasaOficialBcv: '65.0000',
  tasaActivaEntrenador: '65.0000',
  tasaEfectiva: '65.0000',
  fuente: 'manual',
  fechaActualizacionUtc: '2026-11-03T12:00:00.000Z',
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
      periodo: '2026-11',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-11-10T03:59:59.999Z',
    },
    transaccionesTotal: 0,
    transacciones: [],
  };
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA_VIGENTE);
  if (endpoint.startsWith(`/finanzas/clientes/${ALUMNO_ID}/historial`)) {
    return Promise.resolve(resumenBase());
  }
  return Promise.resolve(null);
}

async function abrirFormularioReporte(): Promise<void> {
  const botonReportar = await screen.findByRole('button', { name: /Reportar pago/i });
  fireEvent.click(botonReportar);
}

describe('ZH-2 · PagosPage (integración)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
    authDemo.modoDemo = false;
    authDemo.usuario = {
      id: ALUMNO_ID,
      email: 'alumno.tokyo@example.com',
      rol: 'alumno',
      entrenadorId: COACH_ID,
      zonaHoraria: 'Asia/Tokyo',
    };
    Element.prototype.scrollIntoView = vi.fn();

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();

    mockApi.mockImplementation((endpoint: string) => respuestaGet(endpoint));
    mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con perfil Tokio y reloj de referencia, el campo de fecha muestra value=2026-11-04 y max=2026-11-04', async () => {
    const { container } = render(<PagosPage />);

    await abrirFormularioReporte();

    const inputFecha = (container.querySelector('input[type="date"]') ??
      screen.getByLabelText(/Fecha de Operación|Fecha de operación/i)) as HTMLInputElement;

    expect(inputFecha).not.toBeNull();
    expect(inputFecha.value).toBe('2026-11-04');
    expect(inputFecha.max).toBe('2026-11-04');
  });

  it('regresión Caracas: con perfil America/Caracas muestra value=2026-11-03 y max=2026-11-03', async () => {
    authDemo.usuario = {
      id: ALUMNO_ID,
      email: 'alumno.caracas@example.com',
      rol: 'alumno',
      entrenadorId: COACH_ID,
      zonaHoraria: 'America/Caracas',
    };

    const { container } = render(<PagosPage />);

    await abrirFormularioReporte();

    const inputFecha = (container.querySelector('input[type="date"]') ??
      screen.getByLabelText(/Fecha de Operación|Fecha de operación/i)) as HTMLInputElement;

    expect(inputFecha).not.toBeNull();
    expect(inputFecha.value).toBe('2026-11-03');
    expect(inputFecha.max).toBe('2026-11-03');
  });
});
