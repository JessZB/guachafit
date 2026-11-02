// @vitest-environment jsdom
/**
 * UX-26 (Fase Roja / TDD) · Contratos para CtaFinalizarSesion:
 * - ENT-03: Soporte parametrizable para variante 'hero' (con reloj y mensaje) y 'final-lista' (compacto con aria-label diferenciado)
 * - ENT-06: motion-reduce:animate-none en el punto palpitante
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CtaFinalizarSesion } from './CtaFinalizarSesion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CtaFinalizarSesion · UX-26', () => {
  it('variante hero por defecto muestra reloj, aviso de entrenamiento activo y botón de finalizar', () => {
    const onAbrir = vi.fn();
    render(<CtaFinalizarSesion onAbrir={onAbrir} />);

    expect(screen.getByText(/Entrenamiento activo/i)).not.toBeNull();
    const boton = screen.getByRole('button', { name: 'Finalizar entrenamiento' });
    expect(boton).not.toBeNull();
    fireEvent.click(boton);
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('variante final-lista renderiza el botón con aria-label diferenciado y sin mensaje de reloj', () => {
    const onAbrir = vi.fn();
    render(<CtaFinalizarSesion onAbrir={onAbrir} variante="final-lista" />);

    expect(screen.queryByText(/Entrenamiento activo/i)).toBeNull();
    const boton = screen.getByRole('button', {
      name: 'Finalizar entrenamiento al final de la lista',
    });
    expect(boton).not.toBeNull();
    expect(boton.textContent).toContain('Finalizar entrenamiento');
    fireEvent.click(boton);
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });
});
