// @vitest-environment happy-dom
/**
 * Lote UX-05 · Contrato C: Cartera honesta (carga, aviso sin tasa, errores, recarga y cobro).
 *
 * Requisitos:
 * - C1: Carga inicial honesta (role="status" 'Cargando cartera de alumnos...', 4 bloques KPI con esqueleto animado, sin aviso de tasa).
 * - C2: Aviso sin tasa honesto (solo en mora y por_vencer; ausente en revision y al_dia; ausente con tasaVigente).
 * - C3: Error sin datos (role="alert" 'No pudimos cargar la cartera', mensaje 500, botón Reintentar min-h-11, sin KPIs).
 * - C4: Recarga fallida con datos (conserva fila, KPIs y pestañas; alerta de recarga con Reintentar).
 * - C5: Sin conexión con datos (conserva fila, omite alerta de recarga, muestra AvisoDatosOffline).
 * - C6: Cobro sin tasa (con tasaVigente="36.50", la opción de Bs. en el modal de cobro no está deshabilitada).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoCuota,
  type CarteraDTO,
  type FilaCarteraDTO,
} from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

let modoDemo = false;
let tasaVigente: string | null = '36.50';
let carteraError: string | null = null;
let carteraPromesaPendiente: Promise<unknown> | null = null;

function filaMora(
  parcial: Partial<FilaCarteraDTO> &
    Pick<FilaCarteraDTO, 'alumnoUsuarioId' | 'alumnoPerfilId' | 'alumnoNombre'>
): FilaCarteraDTO {
  return {
    telefonoWhatsapp: null,
    proximoCorte: null,
    cuotaId: null,
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-10-01T23:59:59.000Z',
    saldoPendienteUsd: '35.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 8,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: null,
    periodo: null,
    pagoId: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaReporteUtc: null,
    diasEspera: null,
    ...parcial,
    saldoAFavorUsd: parcial.saldoAFavorUsd ?? '0.00',
  };
}

const FILA_A = filaMora({
  alumnoUsuarioId: 'u-001',
  alumnoPerfilId: 'al-001',
  alumnoNombre: 'Carlos Mendoza',
  cuotaId: 'cuota-1',
  telefonoWhatsapp: '+58 412-1234567',
});

let filasActuales: FilaCarteraDTO[] = [FILA_A];
const clientesConsulta: QueryClient[] = [];

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => enLinea,
  });
}

function respuestaCartera(): CarteraDTO {
  return {
    items: filasActuales,
    total: filasActuales.length,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '120.50',
      totalEnMoraUsd: '95.00',
      alumnosEnMora: filasActuales.length,
      totalPorVencerUsd: '40.00',
      proximosAVencer: 1,
      pagosPorValidar: 0,
      contadores: { enMora: filasActuales.length, porVencer: 1, revision: 0, alDia: 0 },
      tasaVigente,
    },
  };
}

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: modoDemo,
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
import { CarteraPage } from './CarteraPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  modoDemo = false;
  tasaVigente = '36.50';
  filasActuales = [FILA_A];
  carteraError = null;
  carteraPromesaPendiente = null;
  simularConexion(true);
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST') {
      return Promise.resolve({ id: 'tx-nueva' });
    }
    if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
      if (carteraPromesaPendiente) return carteraPromesaPendiente;
      if (carteraError) return Promise.reject(new Error(carteraError));
      return Promise.resolve(respuestaCartera());
    }
    return Promise.resolve(null);
  });
  mockApi.get.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/finanzas/cartera?')) {
      if (carteraPromesaPendiente) return carteraPromesaPendiente;
      if (carteraError) return Promise.reject(new Error(carteraError));
      return Promise.resolve(respuestaCartera());
    }
    return Promise.resolve(null);
  });
  mockApi.post.mockImplementation(() => Promise.resolve({ id: 'tx-nueva' }));
  mockApi.patch.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  simularConexion(true);
  onlineManager.setOnline(true);
  window.dispatchEvent(new Event('online'));
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

function montarPagina(entrada = '/coach/cartera'): void {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'always' } },
  });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path="/coach/cartera" element={<CarteraPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function filaTablaDe(nombre: string): HTMLTableRowElement | null {
  const elementos = screen.queryAllByText(nombre);
  for (const el of elementos) {
    const tr = el.closest('tr');
    if (tr) return tr;
  }
  return null;
}

describe('CarteraPage · Carga honesta (Contrato C)', () => {
  it('C1 · carga inicial: role="status", esqueleto con 4 bloques KPI animados y sin aviso falso de tasa', () => {
    carteraPromesaPendiente = new Promise(() => {});
    montarPagina();

    // 1. Hay un role="status" con texto "Cargando cartera de alumnos..."
    const estados = screen.queryAllByRole('status');
    const estadoCarga = estados.find((el) => /Cargando cartera de alumnos\.\.\./i.test(el.textContent ?? ''));
    expect(estadoCarga).toBeTruthy();

    // 2. Esqueleto con 4 bloques de KPI con animate-pulse
    const esqueletosKpi = document.querySelectorAll('[data-esqueleto="kpi"]');
    expect(esqueletosKpi.length).toBe(4);
    for (const kpi of Array.from(esqueletosKpi)) {
      const tienePulse =
        (kpi.getAttribute('class') ?? '').includes('animate-pulse') ||
        Boolean(kpi.closest('.animate-pulse'));
      expect(tienePulse).toBe(true);
    }

    // 3. No aparece aviso de tasa sin configurar
    expect(screen.queryByText(/Sin tasa de cambio configurada/i)).toBeNull();
  });

  it('C2 · aviso sin tasa honesto: solo en pestañas con bolívares (mora y por_vencer), ausente en revision y al_dia', async () => {
    tasaVigente = null;
    montarPagina();

    // 1. En mora (por defecto) aparece aviso y enlace
    await waitFor(() => expect(filaTablaDe('Carlos Mendoza')).toBeTruthy());
    expect(screen.getByText(/Sin tasa de cambio configurada/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ajustes → Tasas/i })).toBeTruthy();

    // 2. En por_vencer aparece
    fireEvent.click(screen.getByRole('tab', { name: /próximos a vencer/i }));
    await waitFor(() => {
      expect(screen.getByText(/Sin tasa de cambio configurada/i)).toBeTruthy();
    });

    // 3. En revision no aparece
    fireEvent.click(screen.getByRole('tab', { name: /pendiente de revisión/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Sin tasa de cambio configurada/i)).toBeNull();
    });

    // 4. En al_dia no aparece
    fireEvent.click(screen.getByRole('tab', { name: /al día/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Sin tasa de cambio configurada/i)).toBeNull();
    });
  });

  it('C2b · con tasaVigente="36.50" no aparece el aviso sin tasa en ninguna pestaña', async () => {
    tasaVigente = '36.50';
    montarPagina();

    await waitFor(() => expect(filaTablaDe('Carlos Mendoza')).toBeTruthy());
    expect(screen.queryByText(/Sin tasa de cambio configurada/i)).toBeNull();
  });

  it('C3 · error sin datos: role="alert" accesible con reintento de 44px que vuelve a pedir la cartera, sin KPIs', async () => {
    carteraError = 'Fallo de red (500).';
    montarPagina();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No pudimos cargar la cartera');
    expect(alerta.textContent).toContain('Fallo de red (500).');

    const botonReintentar = within(alerta).getByRole('button', { name: 'Reintentar' });
    expect(botonReintentar).toBeTruthy();
    const clasesBoton = (botonReintentar.getAttribute('class') ?? '').split(/\s+/);
    expect(clasesBoton).toContain('min-h-11');

    // No hay KPIs visibles
    expect(screen.queryByText(/Recaudado/i)).toBeNull();

    // Al reintentar vuelve a pedir la cartera
    carteraError = null;
    fireEvent.click(botonReintentar);

    await waitFor(() => expect(filaTablaDe('Carlos Mendoza')).toBeTruthy());
    expect(screen.getByText(/Recaudado/i)).toBeTruthy();
  });

  it('C4 · recarga fallida con datos: conserva fila, KPIs y pestañas, y muestra alerta de recarga con reintento', async () => {
    montarPagina();
    await waitFor(() => expect(filaTablaDe('Carlos Mendoza')).toBeTruthy());
    expect(screen.getByText(/Recaudado/i)).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Estados de cartera' })).toBeTruthy();

    // Provocar recarga fallida mediante cobro en efectivo
    carteraError = 'Fallo de red (500).';
    const fila = filaTablaDe('Carlos Mendoza')!;
    const botonCobro = within(fila).getByRole('button', {
      name: 'Registrar cobro de Carlos Mendoza',
    });
    fireEvent.click(botonCobro);
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    // Conserva fila, KPIs y pestañas
    await waitFor(() => {
      expect(filaTablaDe('Carlos Mendoza')).toBeTruthy();
    });
    expect(screen.getByText(/Recaudado/i)).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Estados de cartera' })).toBeTruthy();

    // Muestra alerta accesible de recarga
    const alertas = await screen.findAllByRole('alert');
    const alertaRecarga = alertas.find((a) =>
      a.textContent?.includes('No se pudo actualizar la cartera. Los datos mostrados pueden estar desactualizados.')
    );
    expect(alertaRecarga).toBeTruthy();
    if (alertaRecarga) {
      expect(within(alertaRecarga).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    }
  });

  it('C5 · sin conexión con datos: conserva fila, omite alerta de recarga y muestra AvisoDatosOffline', async () => {
    montarPagina();
    await waitFor(() => expect(filaTablaDe('Carlos Mendoza')).toBeTruthy());

    simularConexion(false);
    window.dispatchEvent(new Event('offline'));

    // Provocar recarga fallida mediante cobro en efectivo
    carteraError = 'Fallo de red (500).';
    const fila = filaTablaDe('Carlos Mendoza')!;
    const botonCobro = within(fila).getByRole('button', {
      name: 'Registrar cobro de Carlos Mendoza',
    });
    fireEvent.click(botonCobro);
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    await waitFor(() => {
      expect(filaTablaDe('Carlos Mendoza')).toBeTruthy();
    });

    // No debe aparecer la alerta de recarga de error de servidor
    expect(screen.queryByText(/No se pudo actualizar la cartera/i)).toBeNull();

    // Debe aparecer AvisoDatosOffline con role="status"
    const estados = await screen.findAllByRole('status');
    const avisoOffline = estados.find(
      (el) => el.textContent?.includes('Sin conexión') && el.textContent?.includes('datos guardados')
    );
    expect(avisoOffline).toBeTruthy();
  });

  it('C6 · cobro sin tasa: con tasaVigente="36.50" la opción de Bs. en el modal no está deshabilitada', async () => {
    tasaVigente = '36.50';
    montarPagina();

    await waitFor(() => expect(filaTablaDe('Carlos Mendoza')).toBeTruthy());
    const fila = filaTablaDe('Carlos Mendoza')!;
    const botonCobro = within(fila).getByRole('button', {
      name: 'Registrar cobro de Carlos Mendoza',
    });
    fireEvent.click(botonCobro);

    const dialogo = await screen.findByRole('dialog');
    const selectMoneda = within(dialogo).getByLabelText('Moneda') as HTMLSelectElement;
    expect(selectMoneda).toBeTruthy();

    const opcionBs = within(selectMoneda).getByRole('option', { name: /Bs\./i }) as HTMLOptionElement;
    expect(opcionBs).toBeTruthy();
    expect(opcionBs.disabled).toBe(false);
  });

  it('C7 · sin conexión y sin datos: muestra AvisoDatosOffline "sin-datos" y no el error genérico', async () => {
    simularConexion(false);
    carteraError = 'Fallo de red (500).';
    montarPagina();

    await waitFor(async () => {
      const estados = await screen.findAllByRole('status');
      const avisoSinDatos = estados.find((el) =>
        el.textContent?.includes('Sin conexión y sin datos guardados')
      );
      expect(avisoSinDatos).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/No pudimos cargar la cartera/i)).toBeNull();
  });
});
