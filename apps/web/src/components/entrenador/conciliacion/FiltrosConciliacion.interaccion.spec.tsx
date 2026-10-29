// @vitest-environment jsdom
/**
 * Lote UX-07a · Contrato A: FiltrosConciliacion (COB-05, COB-12).
 *
 * Requisitos:
 * - A1: Chips de método ("Todos" y presentes) son `button` con `aria-pressed`, `min-h-11` y llaman a `onCambiarMetodo`.
 * - A2: Buscador con `min-h-11`, `text-base sm:text-sm` y `autocomplete="off"`.
 * - A3: Botón "Limpiar filtros" con `min-h-11`.
 * - A4: Alcance declara "en esta página" (no se toca).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MetodoPago } from '@guachafit/shared';
import { FiltrosConciliacion, type FiltrosConciliacionProps } from './FiltrosConciliacion';

afterEach(() => {
  cleanup();
});

function montarFiltros(propsParciales: Partial<FiltrosConciliacionProps> = {}) {
  const onCambiarMetodo = vi.fn();
  const onCambiarBusqueda = vi.fn();
  const onLimpiar = vi.fn();

  const propsCompletas: FiltrosConciliacionProps = {
    metodosPresentes: [MetodoPago.PAGO_MOVIL, MetodoPago.TRANSFERENCIA_BANCARIA],
    filtroMetodo: 'todos',
    onCambiarMetodo,
    busqueda: '',
    onCambiarBusqueda,
    visibles: 2,
    enPagina: 2,
    total: 2,
    hayFiltroActivo: false,
    onLimpiar,
    ...propsParciales,
  };

  render(<FiltrosConciliacion {...propsCompletas} />);

  return { onCambiarMetodo, onCambiarBusqueda, onLimpiar };
}

describe('FiltrosConciliacion · Contrato A (COB-05, COB-12)', () => {
  it('A1 · chips de método son botones accesibles con aria-pressed, min-h-11 y llaman a onCambiarMetodo', () => {
    const { onCambiarMetodo } = montarFiltros({ filtroMetodo: 'todos' });

    const botonTodos = screen.getByRole('button', { name: 'Todos' });
    expect(botonTodos.getAttribute('aria-pressed')).toBe('true');
    expect(botonTodos.getAttribute('class')).toContain('min-h-11');

    const botonPagoMovil = screen.getByRole('button', { name: /pago m[oó]vil/i });
    expect(botonPagoMovil.getAttribute('aria-pressed')).toBe('false');
    expect(botonPagoMovil.getAttribute('class')).toContain('min-h-11');

    fireEvent.click(botonPagoMovil);
    expect(onCambiarMetodo).toHaveBeenCalledWith(MetodoPago.PAGO_MOVIL);
  });

  it('A2 · buscador incluye min-h-11, text-base, sm:text-sm y autocomplete="off"', () => {
    montarFiltros();

    const buscador = screen.getByRole('searchbox', {
      name: 'Buscar pago por alumno o referencia',
    });

    const clases = buscador.getAttribute('class') ?? '';
    expect(clases).toContain('min-h-11');
    expect(clases).toContain('text-base');
    expect(clases).toContain('sm:text-sm');
    expect(buscador.getAttribute('autocomplete')).toBe('off');
  });

  it('A3 · con hayFiltroActivo, el botón "Limpiar filtros" incluye min-h-11 y llama a onLimpiar', () => {
    const { onLimpiar } = montarFiltros({ hayFiltroActivo: true });

    const botonLimpiar = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(botonLimpiar.getAttribute('class')).toContain('min-h-11');

    fireEvent.click(botonLimpiar);
    expect(onLimpiar).toHaveBeenCalledTimes(1);
  });

  it('A4 · texto de alcance declara "en esta página"', () => {
    montarFiltros();
    expect(screen.getByText(/en esta página/i)).toBeTruthy();
  });
});
