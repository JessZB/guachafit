// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CargaConEsqueleto } from './CargaConEsqueleto';

describe('CargaConEsqueleto · Contrato D', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('de inmediato expone role="status", aria-busy="true" y texto sr-only por defecto "Cargando…"', () => {
    render(
      <CargaConEsqueleto>
        <div data-testid="esqueleto-hijo">Esqueleto visual</div>
      </CargaConEsqueleto>
    );

    const contenedor = screen.getByRole('status');
    expect(contenedor.getAttribute('aria-busy')).toBe('true');

    const textoSrOnly = screen.getByText('Cargando…');
    expect(textoSrOnly).toBeTruthy();
    expect(textoSrOnly.className).toContain('sr-only');

    expect(screen.queryByTestId('esqueleto-hijo')).toBeNull();
  });

  it('hijos NO presentes a 149 ms y presentes a 150 ms de carga continua', () => {
    render(
      <CargaConEsqueleto>
        <div data-testid="esqueleto-hijo">Esqueleto visual</div>
      </CargaConEsqueleto>
    );

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.queryByTestId('esqueleto-hijo')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('esqueleto-hijo')).toBeTruthy();
  });

  it('admite retardoMs personalizado (300 ms y 0 ms)', () => {
    const { unmount } = render(
      <CargaConEsqueleto retardoMs={300}>
        <div data-testid="esqueleto-300">Esqueleto 300</div>
      </CargaConEsqueleto>
    );

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByTestId('esqueleto-300')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('esqueleto-300')).toBeTruthy();
    unmount();

    render(
      <CargaConEsqueleto retardoMs={0}>
        <div data-testid="esqueleto-0">Esqueleto 0</div>
      </CargaConEsqueleto>
    );

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByTestId('esqueleto-0')).toBeTruthy();
  });

  it('aplica claseContenedor por defecto min-h-[200px] y permite personalizarla', () => {
    const { unmount } = render(
      <CargaConEsqueleto>
        <span>Contenido</span>
      </CargaConEsqueleto>
    );
    expect(screen.getByRole('status').className).toContain('min-h-[200px]');
    unmount();

    render(
      <CargaConEsqueleto claseContenedor="min-h-[400px] p-6">
        <span>Contenido</span>
      </CargaConEsqueleto>
    );
    expect(screen.getByRole('status').className).toContain('min-h-[400px]');
    expect(screen.getByRole('status').className).toContain('p-6');
  });

  it('el texto accesible sr-only se conserva visible para tecnologías de asistencia durante todo el tiempo', () => {
    render(
      <CargaConEsqueleto texto="Cargando tus métricas…">
        <div data-testid="hijo">Hijo</div>
      </CargaConEsqueleto>
    );

    expect(screen.getByText('Cargando tus métricas…')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText('Cargando tus métricas…')).toBeTruthy();
    expect(screen.getByTestId('hijo')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
