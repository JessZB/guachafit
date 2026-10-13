// @vitest-environment jsdom
/**
 * Prompt 48 (fase C): spec de interacción del átomo `ChipFiltro`.
 *
 * Consolida `PagosPage.tsx:998-1009` ↔ `ConciliacionPage.tsx:355-364` (clases
 * idénticas) y el patrón de `PlantillasPage.tsx:542-566`,
 * `MonitorAdherenciaPage.tsx:557-611` y `ProgresoPage.tsx:472`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChipFiltro } from './ChipFiltro';

afterEach(() => {
  cleanup();
});

describe('ChipFiltro', () => {
  it('renderiza su etiqueta como botón', () => {
    render(
      <ChipFiltro activo={false} onClick={() => undefined}>
        Todas
      </ChipFiltro>
    );

    expect(screen.getByRole('button', { name: 'Todas' })).toBeTruthy();
  });

  it('declara aria-pressed según el estado activo', () => {
    const { rerender } = render(
      <ChipFiltro activo={false} onClick={() => undefined}>
        Todas
      </ChipFiltro>
    );
    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe(
      'false'
    );

    rerender(
      <ChipFiltro activo onClick={() => undefined}>
        Todas
      </ChipFiltro>
    );
    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('el chip activo usa el fondo primario', () => {
    render(
      <ChipFiltro activo onClick={() => undefined}>
        Activas
      </ChipFiltro>
    );

    expect(screen.getByRole('button', { name: 'Activas' }).getAttribute('class')).toContain(
      'bg-primary'
    );
  });

  it('llama onClick al pulsar', () => {
    const onClick = vi.fn();
    render(
      <ChipFiltro activo={false} onClick={onClick}>
        Todas
      </ChipFiltro>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
