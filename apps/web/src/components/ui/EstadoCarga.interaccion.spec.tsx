// @vitest-environment jsdom
/**
 * Prompt 48 (fase C): spec de interacción del átomo `EstadoCarga`.
 *
 * Consolida `PagosPage.tsx:527-529`, `ProgresoPage.tsx:393-399` y la variante
 * `AlumnoDetallePage.tsx:2130-2132`. Sin dominio ni datos: no requiere providers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EstadoCarga } from './EstadoCarga';

afterEach(() => {
  cleanup();
});

describe('EstadoCarga', () => {
  it('expone rol status con el texto accesible por defecto', () => {
    render(<EstadoCarga />);

    const estado = screen.getByRole('status');
    expect(estado).toBeTruthy();
    expect(estado.textContent).toContain('Cargando…');
  });

  it('usa el texto accesible personalizado cuando se indica', () => {
    render(<EstadoCarga texto="Cargando tus pagos…" />);

    expect(screen.getByRole('status').textContent).toContain('Cargando tus pagos…');
  });

  it('oculta el spinner a los lectores de pantalla (lo visible es el estado)', () => {
    const { container } = render(<EstadoCarga />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });
});
