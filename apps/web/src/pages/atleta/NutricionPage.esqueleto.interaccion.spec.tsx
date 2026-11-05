// @vitest-environment jsdom
/**
 * Interacción · Carga con esqueletos en NutricionPage.
 *
 * Contratos:
 * - Mientras el GET de /nutricion/checkin/hoy está pendiente:
 *   - role="status" con «Cargando tu reporte de hoy…».
 *   - NO existe el botón de guardar ni los campos de agua/calorías (cuerpo sustituido por esqueleto).
 * - Al resolver con un reporte existente:
 *   - Los campos aparecen YA con sus valores y bloqueados (formulario deshabilitado).
 * - Al resolver null (sin reporte previo):
 *   - Los campos aparecen vacíos y editables, y el botón Guardar está listo.
 * - Con error del GET:
 *   - Aparece el formulario (no se queda congelado el esqueleto).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { NutricionPage } from './NutricionPage';
import { SemaforoNutricional, type CheckinNutricionalDetalleDTO } from '@guachafit/shared';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: '11111111-1111-4111-8111-111111111111', zonaHoraria: 'America/Caracas' },
    isDemoMode: false,
  }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

vi.mock('../../lib/imagen-comprimida', () => ({
  comprimirImagenAWebp: (archivo: File) => Promise.resolve(archivo),
}));

import { ApiError, apiClient } from '../../lib/api-client';
import { clearOfflineData } from '../../lib/offline-db';

type MockApi = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockApi;

const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';

function checkinHoyConValores(): CheckinNutricionalDetalleDTO {
  return {
    id: 'checkin-hoy',
    alumnoId: ALUMNO_ID,
    fecha: '2026-09-21',
    semaforo: SemaforoNutricional.CUMPLIDO,
    caloriasReportadas: 2200,
    proteinaGramosReportada: 150,
    aguaLitros: '3.00',
    notasAlumno: 'Buen entreno y comida limpia',
    fotosPlatos: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

function renderPagina() {
  return render(createElement(MemoryRouter, null, createElement(NutricionPage)));
}

describe('NutricionPage · Carga con esqueleto sin saltos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 21, 19, 0, 0));
    mockApi.mockReset();
  });

  afterEach(async () => {
    cleanup();
    await clearOfflineData();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mientras el GET de hoy está pendiente: role="status" «Cargando tu reporte de hoy…», sin botón guardar ni campos agua/calorías', () => {
    mockApi.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/nutricion/checkin/hoy')) {
        return new Promise(() => {}); // Pendiente indefinidamente
      }
      return Promise.resolve(null);
    });

    renderPagina();

    // 1. role="status" con texto accesible inmediato
    const statusEl = screen.getByText('Cargando tu reporte de hoy…').closest('[role="status"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.textContent).toContain('Cargando tu reporte de hoy…');

    // 2. No existe el botón de guardar ni los campos de formulario mientras carga
    expect(screen.queryByRole('button', { name: /Guardar reporte nutricional/ })).toBeNull();
    expect(screen.queryByLabelText(/Agua/i)).toBeNull();
    expect(screen.queryByLabelText(/Calorías/i)).toBeNull();
  });

  it('al resolver con reporte existente: campos aparecen YA con sus valores y bloqueados', async () => {
    let resolverReporte: (datos: CheckinNutricionalDetalleDTO | null) => void = () => {};
    mockApi.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/nutricion/checkin/hoy')) {
        return new Promise((resolve) => {
          resolverReporte = resolve;
        });
      }
      return Promise.resolve(null);
    });

    renderPagina();

    // Mientras está pendiente
    const statusPendiente = screen.getByText('Cargando tu reporte de hoy…').closest('[role="status"]');
    expect(statusPendiente).not.toBeNull();
    expect(statusPendiente?.textContent).toContain('Cargando tu reporte de hoy…');

    // Resolvemos con reporte previo
    await act(async () => {
      resolverReporte(checkinHoyConValores());
    });

    await waitFor(() => {
      expect(screen.queryByText('Cargando tu reporte de hoy…')).toBeNull();
    });

    const inputAgua = screen.getByLabelText(/Agua/i) as HTMLInputElement;
    const inputCalorias = screen.getByLabelText(/Calorías/i) as HTMLInputElement;

    expect(inputAgua.value).toBe('3.00');
    expect(inputCalorias.value).toBe('2200');
    expect(inputAgua.disabled).toBe(true);
    expect(inputCalorias.disabled).toBe(true);
  });

  it('al resolver null (sin reporte hoy): campos aparecen vacíos y editables', async () => {
    let resolverReporte: (datos: CheckinNutricionalDetalleDTO | null) => void = () => {};
    mockApi.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/nutricion/checkin/hoy')) {
        return new Promise((resolve) => {
          resolverReporte = resolve;
        });
      }
      return Promise.resolve(null);
    });

    renderPagina();

    // Resolvemos con null
    await act(async () => {
      resolverReporte(null);
    });

    await waitFor(() => {
      expect(screen.queryByText('Cargando tu reporte de hoy…')).toBeNull();
    });

    const inputAgua = screen.getByLabelText(/Agua/i) as HTMLInputElement;
    const inputCalorias = screen.getByLabelText(/Calorías/i) as HTMLInputElement;

    expect(inputAgua.value).toBe('');
    expect(inputCalorias.value).toBe('');
    expect(inputAgua.disabled).toBe(false);
    expect(inputCalorias.disabled).toBe(false);
    expect(screen.getByRole('button', { name: /Guardar reporte nutricional/ })).toBeDefined();
  });

  it('con error del GET del reporte: aparece el formulario y no se queda el esqueleto colgado', async () => {
    let rechazarReporte: (err: unknown) => void = () => {};
    mockApi.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/nutricion/checkin/hoy')) {
        return new Promise((_, reject) => {
          rechazarReporte = reject;
        });
      }
      return Promise.resolve(null);
    });

    renderPagina();

    // Rechazamos la petición con error 500
    await act(async () => {
      rechazarReporte(
        new ApiError(500, {
          type: 'about:blank',
          title: 'Error de servidor',
          status: 500,
          detail: 'Fallo al cargar checkin',
          timestampUtc: new Date().toISOString(),
        })
      );
    });

    await waitFor(() => {
      // El esqueleto de carga no debe quedarse permanentemente
      const statusCarga = screen.queryByRole('status');
      if (statusCarga) {
        expect(statusCarga.textContent).not.toContain('Cargando tu reporte de hoy…');
      }
    });

    // El formulario o sus campos vuelven a estar accesibles
    expect(screen.getByLabelText(/Agua/i)).toBeDefined();
    expect(screen.getByLabelText(/Calorías/i)).toBeDefined();
  });
});
