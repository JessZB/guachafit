// @vitest-environment happy-dom
/**
 * Lote UX-14 (SEG-19) · Contrato de prop etiqueta en Paginacion.
 *
 * Contratos:
 * - PG1: Sin la prop nueva etiqueta, la navigation se llama "Paginación".
 * - PG2: Con etiqueta="Paginación al final de la lista", la navigation se llama así.
 * - PG3: Por defecto hay exactamente un elemento con role="status" dentro de la navigation;
 *        con anunciarEstado={false}, no renderiza ningún role="status" ni aria-live.
 */
import type { ComponentProps, ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Paginacion } from './Paginacion';

interface PaginacionConEtiquetaProps extends ComponentProps<typeof Paginacion> {
  etiqueta?: string;
}

const PaginacionTipada = Paginacion as ComponentType<PaginacionConEtiquetaProps>;

afterEach(() => {
  cleanup();
});

describe('Paginacion · etiqueta accesible (UX-14)', () => {
  it('PG1 · Sin la prop nueva etiqueta, la navigation se llama Paginación', () => {
    render(
      <Paginacion
        pagina={1}
        tamano={25}
        total={50}
        onCambiarPagina={vi.fn()}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy();
  });

  it('PG2 · Con etiqueta="Paginación al final de la lista", la navigation se llama así', () => {
    render(
      <PaginacionTipada
        pagina={1}
        tamano={25}
        total={50}
        onCambiarPagina={vi.fn()}
        etiqueta="Paginación al final de la lista"
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Paginación al final de la lista' }),
    ).toBeTruthy();
  });

  it('PG3 · Por defecto hay exactamente un elemento con role="status" dentro de la navigation; con anunciarEstado={false} no renderiza role="status" ni aria-live', () => {
    const { unmount, container: containerPorDefecto } = render(
      <Paginacion
        pagina={1}
        tamano={25}
        total={50}
        onCambiarPagina={vi.fn()}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getAllByRole('status').length).toBe(1);
    expect(containerPorDefecto.querySelectorAll('[role="status"]').length).toBe(1);

    unmount();

    const { container: containerSilencioso } = render(
      <Paginacion
        pagina={1}
        tamano={25}
        total={50}
        onCambiarPagina={vi.fn()}
        anunciarEstado={false}
      />,
    );

    expect(screen.queryAllByRole('status').length).toBe(0);
    expect(containerSilencioso.querySelectorAll('[role="status"]').length).toBe(0);
    expect(containerSilencioso.querySelectorAll('[aria-live]').length).toBe(0);
  });
});
