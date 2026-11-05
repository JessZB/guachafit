// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BotonTactil } from './BotonTactil';

describe('BotonTactil · Contrato A (estado de carga)', () => {
  afterEach(() => {
    cleanup();
  });

  it('1. Con cargando={true}: el botón está disabled y lleva aria-busy="true"', () => {
    render(
      <BotonTactil cargando={true}>
        Guardar cambios
      </BotonTactil>
    );

    const boton = screen.getByRole('button', { name: /guardar cambios/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
  });

  it('2. Con cargando={true}: muestra un spinner (svg.animate-spin) con aria-hidden="true" antes de su contenido', () => {
    render(
      <BotonTactil cargando={true}>
        Guardar cambios
      </BotonTactil>
    );

    const boton = screen.getByRole('button', { name: /guardar cambios/i });
    const spinner = boton.querySelector('svg.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });

  it('3. Con cargando={true}: al hacer clic NO llama a onClick', () => {
    const onClick = vi.fn();
    render(
      <BotonTactil cargando={true} onClick={onClick}>
        Guardar cambios
      </BotonTactil>
    );

    const boton = screen.getByRole('button', { name: /guardar cambios/i });
    fireEvent.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('4. Con cargando={false} o por defecto: no tiene aria-busy, no está disabled por carga y llama a onClick', () => {
    const onClick = vi.fn();
    render(
      <BotonTactil cargando={false} onClick={onClick}>
        Guardar cambios
      </BotonTactil>
    );

    const boton = screen.getByRole('button', { name: /guardar cambios/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();

    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
