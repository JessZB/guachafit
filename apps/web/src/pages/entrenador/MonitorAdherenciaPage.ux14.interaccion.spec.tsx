// @vitest-environment happy-dom
/**
 * Lote UX-14 (SEG-12 a SEG-19) · Contrato de MonitorAdherenciaPage.
 *
 * Contratos:
 * - MP1 · Paginación al pie: con datos existen "Paginación" y "Paginación al final de la lista".
 *         La segunda va después del último article en el DOM.
 * - MP2 · Recarga fallida con datos: tras cargar, recarga falla; Rosa Riesgo sigue visible,
 *         se ve el error con Reintentar y no aparece "No se pudo cargar el monitor".
 * - MP3 · Offline con datos: con datos y offline aparece role="status" con "Sin conexión · datos guardados".
 * - MP4 · Offline sin datos: sin conexión y fallo de carga aparece "Sin conexión y sin datos guardados"
 *         y no aparece "No se pudo cargar el monitor".
 * - MP5 · Abrir la actividad desde el nombre: pulsar botón "Rosa Riesgo" abre diálogo con
 *         encabezado "Actividad de Rosa Riesgo".
 * - MP6 · Anuncio de paginación único: con datos, document.querySelectorAll('[aria-live="polite"]')
 *         filtrado a los que están dentro de una navigation cuyo nombre empieza por "Paginación"
 *         tiene longitud exactamente 1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoSesion,
  SemaforoAdherencia,
  type HistorialSesionesAlumnoDTO,
  type MonitorAdherenciaDTO,
  type MonitorAdherenciaSemanalDTO,
  type ResumenMonitorAdherenciaDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

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
import { MonitorAdherenciaPage } from './MonitorAdherenciaPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

const ALUMNO_ROJO: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-rojo',
  alumnoPerfilId: 'al-rojo',
  nombreCompleto: 'Rosa Riesgo',
  sesionesPrescritas: 4,
  sesionesCompletadas: 1,
  porcentajeCumplimientoSemanal: '25.00',
  semaforoAdherencia: SemaforoAdherencia.ROJO,
  tienePlanActivo: true,
  sinPendientesSemana: false,
  rachaDiasConsecutivos: 1,
  diasInactivo: 6,
  ultimaSesionUtc: '2026-10-05T10:00:00.000Z',
};

const RESUMEN_BASE: ResumenMonitorAdherenciaDTO = {
  rojo: 1,
  amarillo: 0,
  verde: 0,
  sinPlan: 0,
  sinPendientes: 0,
  total: 1,
};

function respuestaMonitor(
  items: MonitorAdherenciaSemanalDTO[],
  total: number,
  resumen: ResumenMonitorAdherenciaDTO = RESUMEN_BASE,
): MonitorAdherenciaDTO {
  return { items, total, limit: 25, offset: 0, resumen };
}

const RESPUESTA_BASE = respuestaMonitor([ALUMNO_ROJO], 1);

function sesionFixture(indice: number): SesionEntrenamientoDetalleDTO {
  return {
    id: `6e6e6e6e-6e6e-46e6-86e6-6e6e6e6e6e${String(indice).padStart(2, '0')}`,
    alumnoId: 'u-rojo',
    bloqueId: 'd1',
    fechaProgramada: '2026-10-05',
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
  };
}

function respuestaHistorial(items: SesionEntrenamientoDetalleDTO[], total: number): HistorialSesionesAlumnoDTO {
  return { items, total, limit: 10, offset: 0 };
}

let monitorActual: MonitorAdherenciaDTO = RESPUESTA_BASE;
let errorMonitor: Error | null = null;
const clientesConsulta: QueryClient[] = [];

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => enLinea,
  });
}

function montar(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/adherencia']}>
        <Routes>
          <Route path="/coach/adherencia" element={<MonitorAdherenciaPage />} />
          <Route path="/coach/alumnos/:id" element={<p>Expediente</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  monitorActual = RESPUESTA_BASE;
  errorMonitor = null;
  simularConexion(true);
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (typeof endpoint === 'string' && endpoint.startsWith('/entrenador/monitor-adherencia')) {
      if (errorMonitor) return Promise.reject(errorMonitor);
      return Promise.resolve(monitorActual);
    }
    if (typeof endpoint === 'string' && endpoint.includes('/historial?')) {
      return Promise.resolve(respuestaHistorial([sesionFixture(1)], 1));
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  simularConexion(true);
  onlineManager.setOnline(true);
  window.dispatchEvent(new Event('online'));
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

describe('MonitorAdherenciaPage · UX-14 interacción', () => {
  it('MP1 · Paginación al pie', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Rosa Riesgo' });

    const pagArriba = screen.getByRole('navigation', { name: 'Paginación' });
    const pagPie = screen.getByRole('navigation', { name: 'Paginación al final de la lista' });
    expect(pagArriba).toBeTruthy();
    expect(pagPie).toBeTruthy();

    const articles = screen.getAllByRole('article');
    const ultimoArticle = articles[articles.length - 1];
    expect(
      Boolean(ultimoArticle.compareDocumentPosition(pagPie) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('MP2 · Recarga fallida con datos', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Rosa Riesgo' });

    errorMonitor = new Error('Fallo de red simulado');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => {
      expect(screen.getByText('Fallo de red simulado')).toBeTruthy();
    });

    expect(screen.getByRole('heading', { name: 'Rosa Riesgo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No se pudo cargar el monitor' })).toBeNull();
  });

  it('MP3 · Offline con datos', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Rosa Riesgo' });

    simularConexion(false);
    onlineManager.setOnline(false);
    window.dispatchEvent(new Event('offline'));

    await waitFor(
      () => {
        const estados = screen.queryAllByRole('status');
        const aviso = estados.find((el) =>
          el.textContent?.includes('Sin conexión · datos guardados'),
        );
        expect(aviso).toBeTruthy();
      },
      { timeout: 4000 },
    );
  });

  it('MP4 · Offline sin datos', async () => {
    simularConexion(false);
    onlineManager.setOnline(false);
    window.dispatchEvent(new Event('offline'));
    errorMonitor = new Error('Fallo de red');

    montar();

    await waitFor(
      () => {
        const estados = screen.queryAllByRole('status');
        const aviso = estados.find((el) =>
          el.textContent?.includes('Sin conexión y sin datos guardados'),
        );
        expect(aviso).toBeTruthy();
      },
      { timeout: 4000 },
    );

    expect(screen.queryByRole('heading', { name: 'No se pudo cargar el monitor' })).toBeNull();
  });

  it('MP5 · Abrir la actividad desde el nombre', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Rosa Riesgo' });

    const boton = screen.getByRole('button', { name: 'Rosa Riesgo' });
    fireEvent.click(boton);

    expect(
      await screen.findByRole('heading', { name: 'Actividad de Rosa Riesgo' }),
    ).toBeTruthy();
  });

  it('MP6 · Con datos, document.querySelectorAll(\'[aria-live="polite"]\') filtrado a los que están dentro de una navigation cuyo nombre empieza por Paginación tiene longitud exactamente 1', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Rosa Riesgo' });

    const elementosLive = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-live="polite"]'),
    );
    const elementosEnPaginacion = elementosLive.filter((el) => {
      const nav = el.closest('nav');
      const nombre = nav?.getAttribute('aria-label') ?? '';
      return nombre.startsWith('Paginación');
    });

    expect(elementosEnPaginacion.length).toBe(1);
  });
});
