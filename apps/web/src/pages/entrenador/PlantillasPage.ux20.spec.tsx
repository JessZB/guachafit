// @vitest-environment happy-dom
/**
 * UX-20 · Contrato C2 (CFG-20): PlantillasPage (carga honesta, recarga y avisos).
 *
 * Contrato:
 * - Con datos cargados y un error de recarga: la lista de tarjetas SIGUE visible
 *   y aparece el aviso AvisoErrorRecarga (role="alert", con botón Reintentar que vuelve a llamar a cargarPlantillas).
 * - Sin datos y con error: EstadoError con Reintentar (como hoy).
 * - Durante la carga inicial: EstadoCarga con «Cargando plantillas…» (como hoy).
 * - Durante una recarga con datos: NO aparece EstadoCarga y las tarjetas siguen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NivelObjetivoPlantilla, type PlantillaRutinaResumenDTO } from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

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

function montar() {
  render(
    <MemoryRouter initialEntries={['/coach/plantillas']}>
      <PlantillasPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  hookMock.plantillas = [];
  hookMock.cargandoInicial = false;
  hookMock.recargando = false;
  hookMock.error = null;
  hookMock.cargarPlantillas.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PlantillasPage · contrato C2 (CFG-20)', () => {
  it('C2.1 · con datos cargados y un error de recarga: las tarjetas siguen visibles y aparece AvisoErrorRecarga con Reintentar', () => {
    hookMock.plantillas = [RESUMEN_REAL];
    hookMock.cargandoInicial = false;
    hookMock.recargando = false;
    hookMock.error = 'Fallo de red al recargar plantillas';

    montar();

    // 1. Las tarjetas siguen visibles
    expect(screen.getByText('Rutina Real Fuerza')).toBeTruthy();

    // 2. No se muestra el bloque de pantalla completa EstadoError
    expect(
      screen.queryByRole('heading', { name: 'No se pudieron cargar las plantillas' })
    ).toBeNull();

    // 3. Aparece AvisoErrorRecarga (role="alert") con el mensaje
    const alertas = screen.getAllByRole('alert');
    const avisoRecarga = alertas.find((a) =>
      a.textContent?.includes('Fallo de red al recargar plantillas')
    );
    expect(avisoRecarga).toBeTruthy();

    // 4. El botón Reintentar del aviso vuelve a llamar a cargarPlantillas
    const botonReintentar = within(avisoRecarga!).getByRole('button', { name: 'Reintentar' });
    fireEvent.click(botonReintentar);
    expect(hookMock.cargarPlantillas).toHaveBeenCalledTimes(1);
  });

  it('C2.2 · sin datos y con error: muestra EstadoError con título y botón Reintentar', () => {
    hookMock.plantillas = [];
    hookMock.cargandoInicial = false;
    hookMock.recargando = false;
    hookMock.error = 'No se pudieron cargar tus plantillas de ejercicios.';

    montar();

    // EstadoError con su heading y mensaje
    expect(
      screen.getByRole('heading', { name: 'No se pudieron cargar las plantillas' })
    ).toBeTruthy();
    expect(
      screen.getByText('No se pudieron cargar tus plantillas de ejercicios.')
    ).toBeTruthy();

    // Reintentar llama a cargarPlantillas
    const botonReintentar = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(botonReintentar);
    expect(hookMock.cargarPlantillas).toHaveBeenCalledTimes(1);

    // No hay tarjetas
    expect(screen.queryByText('Rutina Real Fuerza')).toBeNull();
  });

  it('C2.3 · durante la carga inicial: muestra EstadoCarga con "Cargando plantillas…" sin tarjetas', () => {
    hookMock.plantillas = [];
    hookMock.cargandoInicial = true;
    hookMock.recargando = false;
    hookMock.error = null;

    montar();

    expect(screen.getByText('Cargando plantillas…')).toBeTruthy();
    expect(screen.queryByText('Rutina Real Fuerza')).toBeNull();
  });

  it('C2.4 · durante una recarga con datos: no muestra EstadoCarga y las tarjetas siguen visibles', () => {
    hookMock.plantillas = [RESUMEN_REAL];
    hookMock.cargandoInicial = false;
    hookMock.recargando = true;
    hookMock.error = null;

    montar();

    expect(screen.queryByText('Cargando plantillas…')).toBeNull();
    expect(screen.getByText('Rutina Real Fuerza')).toBeTruthy();
  });
});
