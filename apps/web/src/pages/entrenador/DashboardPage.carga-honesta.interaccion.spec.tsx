// @vitest-environment jsdom
/**
 * Lote UX-11 · Carga honesta del Dashboard del entrenador (SEG-01, SEG-02, SEG-06).
 *
 * Contratos:
 * - A1 · Cargando: con el GET pendiente muestra role="status" con "Cargando el resumen",
 *   no muestra cifras en bandejas ni encabezados de mora/inactividad, conserva enlaces rápidos.
 * - A2 · Error con reintento: con fallo del GET muestra encabezado honesto, mensaje del error,
 *   botón de reintento, oculta listas/cifras y al reintentar carga exitosamente.
 * - A3 · Datos reales: muestra cifras reales (3 pendientes, 2 por validar) y cero real (0 pendientes).
 * - A4 · Sin badge decorativo: el texto "Operación Activa" no existe en ningún estado.
 * - A5 · Offline con datos: con datos previos y desconexión muestra role="status" con "Sin conexión · datos guardados".
 * - A6 · Offline sin datos: sin conexión y con fallo del GET muestra "Sin conexión y sin datos guardados"
 *   y no el encabezado de error genérico.
 * - A7 · Demo: en modo demo no llama al API y muestra las cifras sin estado de carga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardComandoDTO } from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'coach-1',
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

import { apiClient } from '../../lib/api-client';
import { DashboardPage } from './DashboardPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

const clientesConsulta: QueryClient[] = [];

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => enLinea,
  });
}

function fixtureDashboard(
  overrides?: {
    kpisMacro?: Partial<DashboardComandoDTO['kpisMacro']>;
    bandejasRapidas?: Partial<DashboardComandoDTO['bandejasRapidas']>;
  }
): DashboardComandoDTO {
  return {
    kpisMacro: {
      alumnosActivos: 38,
      capacidadMaxima: 50,
      porcentajeOcupacion: '76.00',
      cobranzaMesUsd: '1900.00',
      metaCobranzaMesUsd: '2500.00',
      porcentajeCobranza: '76.00',
      tasaAdherenciaSemanal: '84.50',
      alumnosEnRiesgoDeportivo: 4,
      alumnosEnMoraFinanciera: 2,
      alumnosEnRiesgo: 4,
      ...overrides?.kpisMacro,
    },
    bandejasRapidas: {
      pagosPorConciliar: 3,
      checkinsAntropometricosPendientes: 2,
      alumnosEnMora: [
        {
          alumnoId: 'a1',
          nombre: 'Carlos Mendoza',
          cuotaId: 'c1',
          saldoPendienteUsd: '30.00',
          diasVencido: 5,
        },
      ],
      alumnosInactivosEntrenamiento: [
        {
          alumnoId: 'a3',
          nombre: 'Andrés Silva',
          diasSinEntrenar: 6,
        },
      ],
      ...overrides?.bandejasRapidas,
    },
  };
}

function montarPagina(): void {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'always' } },
  });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  authDemo.modoDemo = false;
  simularConexion(true);
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();
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

describe('DashboardPage · Carga honesta (UX-11)', () => {
  it('A1 · Cargando: estado honesto sin cifras ni listas prematuras', () => {
    mockApi.mockImplementation(() => new Promise(() => {}));
    montarPagina();

    // 1. Hay un role="status" cuyo texto contiene "Cargando el resumen"
    const estados = screen.queryAllByRole('status');
    const estadoCarga = estados.find((el) => /Cargando el resumen/i.test(el.textContent ?? ''));
    expect(estadoCarga, 'debe existir un role="status" con "Cargando el resumen"').toBeTruthy();

    // 2. No existen los textos "0 pendientes" ni "0 por validar", ni ninguna cifra en las bandejas
    expect(screen.queryByText(/0 pendientes/i)).toBeNull();
    expect(screen.queryByText(/0 por validar/i)).toBeNull();
    expect(screen.queryByText(/\d+\s+pendientes/i)).toBeNull();
    expect(screen.queryByText(/\d+\s+por validar/i)).toBeNull();

    // 3. No existen los encabezados "Alumnos con Pagos Vencidos" ni "Alumnos sin Entrenar"
    expect(screen.queryByRole('heading', { name: /Alumnos con Pagos Vencidos/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Alumnos sin Entrenar/i })).toBeNull();

    // 4. Los enlaces "Revisar pagos" y "Revisar evaluaciones" sí siguen visibles
    expect(screen.getByRole('link', { name: /Revisar pagos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Revisar evaluaciones/i })).toBeTruthy();
  });

  it('A2 · Error con reintento: mensaje honesto y reintento funcional', async () => {
    mockApi.mockRejectedValueOnce(new Error('Fallo de red'));
    montarPagina();

    // 1. Hay un encabezado "No pudimos cargar el resumen" y el texto "Fallo de red"
    const encabezado = await screen.findByRole(
      'heading',
      { name: /No pudimos cargar el resumen/i },
      { timeout: 1500 }
    );
    expect(encabezado).toBeTruthy();
    expect(await screen.findByText('Fallo de red')).toBeTruthy();

    // 2. Existe un botón "Reintentar"
    const botonReintentar = screen.getByRole('button', { name: /Reintentar/i });
    expect(botonReintentar).toBeTruthy();

    // 3. No existen "0 pendientes" ni "0 por validar", ni los encabezados de las dos listas de riesgo
    expect(screen.queryByText(/0 pendientes/i)).toBeNull();
    expect(screen.queryByText(/0 por validar/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: /Alumnos con Pagos Vencidos/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Alumnos sin Entrenar/i })).toBeNull();

    // 4. Los enlaces "Revisar pagos" y "Revisar evaluaciones" siguen visibles
    expect(screen.getByRole('link', { name: /Revisar pagos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Revisar evaluaciones/i })).toBeTruthy();

    // 5. Al pulsar "Reintentar" se llama al GET por segunda vez. Si responde bien, aparecen "3 pendientes" y "2 por validar"
    mockApi.mockResolvedValueOnce(fixtureDashboard());
    fireEvent.click(botonReintentar);

    expect(await screen.findByText('3 pendientes')).toBeTruthy();
    expect(await screen.findByText('2 por validar')).toBeTruthy();
  });

  it('A3 · Datos reales: con respuesta correcta se ven cifras reales y el cero se muestra', async () => {
    mockApi.mockResolvedValueOnce(
      fixtureDashboard({
        bandejasRapidas: {
          pagosPorConciliar: 3,
          checkinsAntropometricosPendientes: 2,
        },
      })
    );
    montarPagina();

    expect(await screen.findByText('3 pendientes')).toBeTruthy();
    expect(await screen.findByText('2 por validar')).toBeTruthy();

    cleanup();

    mockApi.mockResolvedValueOnce(
      fixtureDashboard({
        bandejasRapidas: {
          pagosPorConciliar: 0,
          checkinsAntropometricosPendientes: 2,
        },
      })
    );
    montarPagina();

    expect(await screen.findByText('0 pendientes')).toBeTruthy();
    expect(await screen.findByText('2 por validar')).toBeTruthy();
  });

  it('A4 · Sin badge decorativo: el texto "Operación Activa" no existe en ningún estado', async () => {
    mockApi.mockResolvedValueOnce(fixtureDashboard());
    montarPagina();

    await screen.findByText('3 pendientes');
    expect(screen.queryByText(/Operación Activa/i)).toBeNull();
  });

  it('A5 · Offline con datos: con datos cargados y desconexión aparece aviso de datos guardados', async () => {
    mockApi.mockResolvedValueOnce(fixtureDashboard());
    montarPagina();

    expect(await screen.findByText('3 pendientes')).toBeTruthy();

    simularConexion(false);
    window.dispatchEvent(new Event('offline'));

    await waitFor(
      () => {
        const estados = screen.queryAllByRole('status');
        const avisoOffline = estados.find((el) =>
          el.textContent?.includes('Sin conexión · datos guardados')
        );
        expect(
          avisoOffline,
          'debe existir un role="status" con "Sin conexión · datos guardados"'
        ).toBeTruthy();
      },
      { timeout: 1500 }
    );
  });

  it('A6 · Offline sin datos: sin conexión y con fallo del GET muestra aviso sin datos y no error de resumen', async () => {
    simularConexion(false);
    window.dispatchEvent(new Event('offline'));
    mockApi.mockRejectedValueOnce(new Error('Fallo de red'));
    montarPagina();

    await waitFor(
      () => {
        const estados = screen.queryAllByRole('status');
        const avisoSinDatos = estados.find((el) =>
          el.textContent?.includes('Sin conexión y sin datos guardados')
        );
        expect(
          avisoSinDatos,
          'debe existir un role="status" con "Sin conexión y sin datos guardados"'
        ).toBeTruthy();
      },
      { timeout: 1500 }
    );

    expect(screen.queryByRole('heading', { name: /No pudimos cargar el resumen/i })).toBeNull();
  });

  it('A7 · Demo: con isDemoMode en true no llama al API y muestra bandejas sin estado de carga', async () => {
    authDemo.modoDemo = true;
    montarPagina();

    expect(await screen.findByText('3 pendientes')).toBeTruthy();
    expect(await screen.findByText('2 por validar')).toBeTruthy();

    expect(mockApi).not.toHaveBeenCalled();

    const estados = screen.queryAllByRole('status');
    const estadoCarga = estados.find((el) => /Cargando el resumen/i.test(el.textContent ?? ''));
    expect(estadoCarga).toBeFalsy();
  });
});
