// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { UnidadPeso } from '../../../lib/weight-unit';
import { AccionesSesion } from './AccionesSesion';

// Adaptador de tipo para las nuevas props del contrato B (en fase roja el componente aún espera props viejas)
const AccionesSesionWidget = AccionesSesion as unknown as React.ComponentType<{
  unidadPeso: UnidadPeso;
  onCambiarUnidad: (unidad: UnidadPeso) => void;
}>;

describe('AccionesSesion (contrato B · selector de unidad sin botones de cronómetro)', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('no contiene ningún botón de cronómetro de descanso (ni abrir ni detener)', () => {
    render(<AccionesSesionWidget unidadPeso="kg" onCambiarUnidad={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Detener cronómetro de descanso' })
    ).toBeNull();
    expect(screen.queryByTitle('Cronómetro de descanso')).toBeNull();
  });

  it('conserva el grupo "Unidad de peso" y los botones kg y lb con aria-pressed correcto', () => {
    const { rerender } = render(
      <AccionesSesionWidget unidadPeso="kg" onCambiarUnidad={vi.fn()} />
    );

    const grupo = screen.getByRole('group', { name: 'Unidad de peso' });
    expect(grupo).toBeTruthy();

    const botonKg = within(grupo).getByRole('button', { name: 'kg' });
    const botonLb = within(grupo).getByRole('button', { name: 'lb' });

    expect(botonKg.getAttribute('aria-pressed')).toBe('true');
    expect(botonLb.getAttribute('aria-pressed')).toBe('false');

    rerender(<AccionesSesionWidget unidadPeso="lb" onCambiarUnidad={vi.fn()} />);
    expect(botonKg.getAttribute('aria-pressed')).toBe('false');
    expect(botonLb.getAttribute('aria-pressed')).toBe('true');
  });

  it('pulsar sobre lb invoca onCambiarUnidad con "lb"', () => {
    const onCambiarUnidad = vi.fn();
    render(<AccionesSesionWidget unidadPeso="kg" onCambiarUnidad={onCambiarUnidad} />);

    const grupo = screen.getByRole('group', { name: 'Unidad de peso' });
    const botonLb = within(grupo).getByRole('button', { name: 'lb' });
    fireEvent.click(botonLb);

    expect(onCambiarUnidad).toHaveBeenCalledWith('lb');
  });
});
