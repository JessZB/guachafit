// @vitest-environment happy-dom
/**
 * 08 · AvisoSerieCompletada · contrato C (fase roja).
 *
 * Componente presentacional:
 * - props: { numeroSerie: number; onDeshacer: () => void }
 * - role="status"
 * - texto visible "Serie {numeroSerie} completada"
 * - botón accesible "Deshacer" que llama onDeshacer una vez
 * - clase min-h-11 (mínimo 44 px de alto)
 * - sin temporizadores propios
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvisoSerieCompletada } from './AvisoSerieCompletada';

describe('AvisoSerieCompletada (contrato C)', () => {
  afterEach(() => {
    cleanup();
  });

  it('muestra el contenedor con role="status" y texto "Serie 3 completada"', () => {
    const onDeshacer = vi.fn();
    render(<AvisoSerieCompletada numeroSerie={3} onDeshacer={onDeshacer} />);

    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain('Serie 3 completada');
  });

  it('el botón "Deshacer" llama a onDeshacer una vez', () => {
    const onDeshacer = vi.fn();
    render(<AvisoSerieCompletada numeroSerie={1} onDeshacer={onDeshacer} />);

    const boton = screen.getByRole('button', { name: 'Deshacer' });
    expect(boton).toBeTruthy();

    fireEvent.click(boton);
    expect(onDeshacer).toHaveBeenCalledTimes(1);
  });

  it('el botón "Deshacer" tiene la clase min-h-11', () => {
    const onDeshacer = vi.fn();
    render(<AvisoSerieCompletada numeroSerie={2} onDeshacer={onDeshacer} />);

    const boton = screen.getByRole('button', { name: 'Deshacer' });
    expect(boton.classList.contains('min-h-11')).toBe(true);
  });
});
