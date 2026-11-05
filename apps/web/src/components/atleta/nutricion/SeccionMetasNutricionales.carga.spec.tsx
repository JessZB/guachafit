// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeccionMetasNutricionales, type SeccionMetasNutricionalesProps } from './SeccionMetasNutricionales';

const propsBase: SeccionMetasNutricionalesProps = {
  isCargandoMetas: true,
  metasError: null,
  metas: null,
  objetivos: [],
  onReintentarMetas: vi.fn(),
  tolerancia: <div data-testid="tolerancia-slot">Tolerancia slot</div>,
};

describe('SeccionMetasNutricionales · Carga con esqueleto (Contrato 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mientras carga existe role="status" con «Cargando tus metas…» y NO existe .animate-spin', () => {
    render(<SeccionMetasNutricionales {...propsBase} isCargandoMetas={true} />);

    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain('Cargando tus metas…');
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('a 149 ms sin [data-esqueleto] y a 150 ms aparece [data-esqueleto]', () => {
    render(<SeccionMetasNutricionales {...propsBase} isCargandoMetas={true} />);

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(document.querySelector('[data-esqueleto]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('[data-esqueleto]')).not.toBeNull();
  });

  it('al terminar la carga (isCargandoMetas=false) el status y el esqueleto desaparecen', () => {
    const { rerender } = render(<SeccionMetasNutricionales {...propsBase} isCargandoMetas={true} />);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    rerender(<SeccionMetasNutricionales {...propsBase} isCargandoMetas={false} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[data-esqueleto]')).toBeNull();
  });
});
