// @vitest-environment happy-dom
/**
 * Prompt 48 (fase C): spec de interacción del átomo `BotonTactil`.
 *
 * Consolida `PlantillasPage.tsx:502-509`, `AlumnosPage.tsx:444-450`,
 * `AsignacionMasivaPlantilla.tsx:506` y `AjustesPage.tsx:824`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BotonTactil } from './BotonTactil';

afterEach(() => {
  cleanup();
});

describe('BotonTactil', () => {
  it('renderiza sus hijos como botón con área táctil de 44px', () => {
    render(<BotonTactil>Guardar</BotonTactil>);

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton.getAttribute('class')).toContain('min-h-11');
  });

  it('llama onClick al pulsar', () => {
    const onClick = vi.fn();
    render(<BotonTactil onClick={onClick}>Guardar</BotonTactil>);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('deshabilitado no dispara onClick', () => {
    const onClick = vi.fn();
    render(
      <BotonTactil disabled onClick={onClick}>
        Guardar
      </BotonTactil>
    );

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('la variante peligro pinta el botón en rojo destructivo', () => {
    render(<BotonTactil variante="peligro">Desactivar</BotonTactil>);

    expect(screen.getByRole('button', { name: 'Desactivar' }).getAttribute('class')).toContain(
      'bg-destructive'
    );
  });

  it('la variante peligro-contorno incluye text-destructive, border-destructive/40, min-h-11 y no incluye text-foreground', () => {
    render(<BotonTactil variante="peligro-contorno">Rechazar</BotonTactil>);

    const boton = screen.getByRole('button', { name: 'Rechazar' });
    const clases = boton.getAttribute('class') ?? '';

    expect(clases).toContain('text-destructive');
    expect(clases).toContain('border-destructive/40');
    expect(clases).toContain('min-h-11');
    expect(clases).not.toContain('text-foreground');
  });
});
