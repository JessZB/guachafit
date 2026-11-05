// @vitest-environment jsdom
/**
 * Interacción · Carga con esqueletos en PlantillasPage.
 *
 * Contrato:
 * - Mientras cargandoInicial es true:
 *   - De inmediato: role="status" con «Cargando plantillas…».
 *   - Ausencia total de spinner (.animate-spin ausente).
 *   - Tras 150 ms: aparece [data-esqueleto="rejilla-tarjetas"] con 6 bloques y sin .animate-spin.
 * - Al resolver cargandoInicial a false:
 *   - role="status" y el esqueleto desaparecen, mostrando las tarjetas de plantillas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NivelObjetivoPlantilla, type PlantillaRutinaResumenDTO } from '@guachafit/shared';

const hookMock = vi.hoisted(() => ({
  plantillas: [] as any[],
  cargandoInicial: false,
  recargando: false,
  error: null as string | null,
  catalogo: [],
  catalogoError: null,
  accionError: null,
  setAccionError: vi.fn(),
  confirmandoId: null,
  setConfirmandoId: vi.fn(),
  ocupadaId: null,
  cargandoDetalleId: null,
  cargarPlantillas: vi.fn(),
  cargarCatalogo: vi.fn(),
  obtenerDetalle: vi.fn(),
  desactivarPlantilla: vi.fn(),
  reactivarPlantilla: vi.fn(),
  crearEjercicioEnCatalogo: vi.fn(),
  reponerResumen: vi.fn(),
  reponerDetalleDemo: vi.fn(),
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ isDemoMode: false }),
}));

vi.mock('../../lib/use-frescura-offline', () => ({
  useFrescuraOffline: () => ({ isOnline: true, frescura: null }),
}));

vi.mock('../../components/entrenador/plantillas/use-plantillas-banco', () => ({
  usePlantillasBanco: () => hookMock,
}));

import { PlantillasPage } from './PlantillasPage';

const RESUMEN_REAL: PlantillaRutinaResumenDTO = {
  id: 'p-real-1',
  entrenadorId: 'e1',
  nombre: 'Rutina Real Fuerza',
  nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
  totalDias: 1,
  totalEjercicios: 1,
  activa: true,
  createdAtUtc: '2026-09-01T10:00:00.000Z',
  updatedAtUtc: '2026-09-20T10:00:00.000Z',
};

describe('PlantillasPage · Carga con esqueleto sin saltos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hookMock.plantillas = [];
    hookMock.cargandoInicial = false;
    hookMock.recargando = false;
    hookMock.error = null;
    hookMock.cargarPlantillas.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('mientras cargandoInicial muestra role="status", dibuja rejilla-tarjetas con 6 bloques a los 150 ms y desaparece al resolver', () => {
    hookMock.cargandoInicial = true;
    hookMock.plantillas = [];

    const { rerender } = render(
      <MemoryRouter initialEntries={['/coach/plantillas']}>
        <PlantillasPage />
      </MemoryRouter>
    );

    // 1. role="status" inmediato con «Cargando plantillas…»
    const statusEl = screen.getByRole('status');
    expect(statusEl.textContent).toContain('Cargando plantillas…');

    // 2. NO hay spinner
    expect(document.querySelector('.animate-spin')).toBeNull();

    // 3. Antes de 150 ms el esqueleto aún no se dibuja
    expect(document.querySelector('[data-esqueleto="rejilla-tarjetas"]')).toBeNull();

    // 4. Tras 150 ms se monta el esqueleto de 6 bloques sin spinner
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const esqueleto = document.querySelector('[data-esqueleto="rejilla-tarjetas"]');
    expect(esqueleto).not.toBeNull();
    const bloques = document.querySelectorAll('[data-esqueleto-bloque]');
    expect(bloques).toHaveLength(6);
    expect(document.querySelector('.animate-spin')).toBeNull();

    // 5. Al resolver la carga: desaparecen role="status" y el esqueleto
    hookMock.cargandoInicial = false;
    hookMock.plantillas = [RESUMEN_REAL];

    rerender(
      <MemoryRouter initialEntries={['/coach/plantillas']}>
        <PlantillasPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[data-esqueleto="rejilla-tarjetas"]')).toBeNull();
    expect(screen.getByText('Rutina Real Fuerza')).toBeTruthy();
  });
});
