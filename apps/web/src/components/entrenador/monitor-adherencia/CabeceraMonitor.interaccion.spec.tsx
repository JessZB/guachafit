// @vitest-environment happy-dom
/**
 * Lote UX-14 (SEG-12 a SEG-19) · Contrato de CabeceraMonitor.
 *
 * Contratos:
 * - CM1 · Chips reutilizados: role="group" con nombre "Filtrar por estado", 5 botones con nombres
 *         "Todos 5", "En riesgo 1", "En observación 1", "Al día 1", "Sin plan 1", min-h-11,
 *         y el activo tiene aria-pressed="true".
 * - CM2 · Sin jerga de color: sin textos con "(Rojo)", "(Amarillo)" ni "(Verde)".
 * - CM3 · Actualizar táctil: botón "Actualizar" con min-h-11 y deshabilitado con isLoading: true.
 * - CM4 · Buscador sin zoom en iOS: campo "Buscar alumno por nombre" con min-h-11, text-base y sm:text-xs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ResumenMonitorAdherenciaDTO } from '@guachafit/shared';
import { CabeceraMonitor, type CabeceraMonitorProps } from './CabeceraMonitor';

const RESUMEN_5: ResumenMonitorAdherenciaDTO = {
  total: 5,
  rojo: 1,
  amarillo: 1,
  verde: 1,
  sinPlan: 1,
  sinPendientes: 1,
};

function montar(overrides?: Partial<CabeceraMonitorProps>) {
  const propsPorDefecto: CabeceraMonitorProps = {
    resumen: RESUMEN_5,
    totalCartera: 5,
    total: 5,
    filtroSemaforo: 'todos',
    onCambiarFiltroSemaforo: vi.fn(),
    busqueda: '',
    onCambiarBusqueda: vi.fn(),
    filtroActivo: false,
    isLoading: false,
    error: null,
    cargando: false,
    onRecargar: vi.fn(),
  };

  return render(<CabeceraMonitor {...propsPorDefecto} {...overrides} />);
}

afterEach(() => {
  cleanup();
});

describe('CabeceraMonitor · interacción (UX-14)', () => {
  it('CM1 · Chips reutilizados', () => {
    montar();

    const grupo = screen.getByRole('group', { name: 'Filtrar por estado' });
    const nombresChips = [
      'Todos 5',
      'En riesgo 1',
      'En observación 1',
      'Al día 1',
      'Sin plan 1',
    ];

    for (const nombre of nombresChips) {
      const boton = within(grupo).getByRole('button', { name: nombre });
      expect(boton.className).toContain('min-h-11');
    }

    const botonActivo = within(grupo).getByRole('button', { name: 'Todos 5' });
    expect(botonActivo.getAttribute('aria-pressed')).toBe('true');
  });

  it('CM2 · Sin jerga de color', () => {
    montar();

    expect(screen.queryByText(/\(Rojo\)/)).toBeNull();
    expect(screen.queryByText(/\(Amarillo\)/)).toBeNull();
    expect(screen.queryByText(/\(Verde\)/)).toBeNull();
  });

  it('CM3 · Actualizar táctil', () => {
    montar({ isLoading: false });

    const boton = screen.getByRole('button', { name: 'Actualizar' });
    expect(boton.className).toContain('min-h-11');

    cleanup();

    montar({ isLoading: true });
    const botonDeshabilitado = screen.getByRole('button', { name: 'Actualizar' });
    expect((botonDeshabilitado as HTMLButtonElement).disabled).toBe(true);
  });

  it('CM4 · Buscador sin zoom en iOS', () => {
    montar();

    const campo = screen.getByLabelText('Buscar alumno por nombre');
    expect(campo.className).toContain('min-h-11');
    expect(campo.className).toContain('text-base');
    expect(campo.className).toContain('sm:text-xs');
  });
});
