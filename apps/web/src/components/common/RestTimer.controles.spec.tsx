// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';
import { RestTimer } from './RestTimer';
import { RestTimerPanel } from './RestTimerPanel';
import { RestTimerPildora } from './RestTimerPildora';

function crearMockCronometro(overrides: Partial<CronometroDescanso> = {}): CronometroDescanso {
  return {
    abierto: false,
    restanteMs: 90_000,
    duracionMs: 90_000,
    pausado: false,
    terminado: false,
    serieId: null,
    abrirParaSerie: vi.fn(),
    abrirLibre: vi.fn(),
    pausar: vi.fn(),
    reanudar: vi.fn(),
    ajustar: vi.fn(),
    elegirPreset: vi.fn(),
    reiniciar: vi.fn(),
    cerrar: vi.fn(),
    ...overrides,
  };
}

describe('RestTimer · controles y comportamiento reactivo (contrato E)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('E1: RestTimerPanel · deshabilitación de restar 15 s cuando terminado=true', () => {
    it('con terminado=true: botón "Restar 15 segundos" está deshabilitado y "Sumar 15 segundos" está habilitado', () => {
      const cronometro = crearMockCronometro({ terminado: true });
      render(<RestTimerPanel cronometro={cronometro} onMinimizar={vi.fn()} />);

      const botonRestar = screen.getByRole('button', { name: 'Restar 15 segundos' }) as HTMLButtonElement;
      const botonSumar = screen.getByRole('button', { name: 'Sumar 15 segundos' }) as HTMLButtonElement;

      expect(botonRestar.hasAttribute('disabled')).toBe(true);
      expect(botonSumar.hasAttribute('disabled')).toBe(false);
    });

    it('con terminado=false: botón "Restar 15 segundos" y botón "Sumar 15 segundos" están habilitados', () => {
      const cronometro = crearMockCronometro({ terminado: false });
      render(<RestTimerPanel cronometro={cronometro} onMinimizar={vi.fn()} />);

      const botonRestar = screen.getByRole('button', { name: 'Restar 15 segundos' }) as HTMLButtonElement;
      const botonSumar = screen.getByRole('button', { name: 'Sumar 15 segundos' }) as HTMLButtonElement;

      expect(botonRestar.hasAttribute('disabled')).toBe(false);
      expect(botonSumar.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('E2: RestTimerPildora · accesibilidad y aviso de pantalla bloqueada', () => {
    it('en descanso en curso: existe un texto sr-only con aviso de pantalla bloqueada dentro de la píldora', () => {
      const cronometro = crearMockCronometro({ abierto: true, terminado: false, pausado: false });
      const { container } = render(<RestTimerPildora cronometro={cronometro} onExpandir={vi.fn()} />);

      const pildora = container.firstElementChild as HTMLElement;
      expect(pildora).not.toBeNull();

      const srOnly = pildora.querySelector('.sr-only');
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toMatch(/pantalla bloqueada/i);

      const botonExpandir = screen.getByRole('button', { name: 'Expandir cronómetro' });
      const titleMatch = botonExpandir.getAttribute('title')?.match(/pantalla bloqueada/i);
      const describedBy = botonExpandir.getAttribute('aria-describedby');
      const srOnlyId = srOnly?.getAttribute('id');
      const isDescribed = Boolean(describedBy && srOnlyId && describedBy.split(/\s+/).includes(srOnlyId));

      expect(Boolean(titleMatch || isDescribed)).toBe(true);
    });
  });

  describe('E3: RestTimer · auto-plegado a píldora en focusin externo', () => {
    function abrirPanel() {
      let abiertoState = false;
      let pausadoState = false;
      const onAbrirEnPausa = vi.fn(() => {
        abiertoState = true;
        pausadoState = true;
      });

      const { rerender } = render(
        <RestTimer
          cronometro={crearMockCronometro({ abierto: abiertoState, pausado: pausadoState })}
          visible={true}
          onAbrirEnPausa={onAbrirEnPausa}
        />
      );

      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      fireEvent.click(botonFab);

      rerender(
        <RestTimer
          cronometro={crearMockCronometro({ abierto: true, pausado: true })}
          visible={true}
          onAbrirEnPausa={onAbrirEnPausa}
        />
      );

      expect(document.body.querySelector('[data-estado="panel"]')).not.toBeNull();
      return { rerender };
    }

    it('focusin sobre un <input> externo pliega el panel a pildora', () => {
      abrirPanel();

      const inputExterno = document.createElement('input');
      inputExterno.type = 'text';
      document.body.appendChild(inputExterno);

      act(() => {
        fireEvent.focusIn(inputExterno);
        inputExterno.focus();
      });

      expect(document.body.querySelector('[data-estado="pildora"]')).not.toBeNull();
      expect(document.body.querySelector('[data-estado="panel"]')).toBeNull();
    });

    it('focusin sobre un <textarea> externo pliega el panel a pildora', () => {
      abrirPanel();

      const textareaExterno = document.createElement('textarea');
      document.body.appendChild(textareaExterno);

      act(() => {
        fireEvent.focusIn(textareaExterno);
        textareaExterno.focus();
      });

      expect(document.body.querySelector('[data-estado="pildora"]')).not.toBeNull();
      expect(document.body.querySelector('[data-estado="panel"]')).toBeNull();
    });

    it('focusin sobre un <select> externo pliega el panel a pildora', () => {
      abrirPanel();

      const selectExterno = document.createElement('select');
      document.body.appendChild(selectExterno);

      act(() => {
        fireEvent.focusIn(selectExterno);
        selectExterno.focus();
      });

      expect(document.body.querySelector('[data-estado="pildora"]')).not.toBeNull();
      expect(document.body.querySelector('[data-estado="panel"]')).toBeNull();
    });

    it('focusin sobre un <button> externo NO pliega el panel', () => {
      abrirPanel();

      const botonExterno = document.createElement('button');
      document.body.appendChild(botonExterno);

      act(() => {
        fireEvent.focusIn(botonExterno);
        botonExterno.focus();
      });

      expect(document.body.querySelector('[data-estado="panel"]')).not.toBeNull();
      expect(document.body.querySelector('[data-estado="pildora"]')).toBeNull();
    });

    it('focusin sobre un elemento DENTRO del widget NO pliega el panel', () => {
      abrirPanel();

      const botonReanudar = screen.getByRole('button', { name: 'Reanudar descanso' });

      act(() => {
        fireEvent.focusIn(botonReanudar);
        botonReanudar.focus();
      });

      expect(document.body.querySelector('[data-estado="panel"]')).not.toBeNull();
      expect(document.body.querySelector('[data-estado="pildora"]')).toBeNull();
    });

    it('con el widget en fab, focusin en input externo no altera el estado fab', () => {
      render(
        <RestTimer
          cronometro={crearMockCronometro({ abierto: false })}
          visible={true}
          onAbrirEnPausa={vi.fn()}
        />
      );

      const inputExterno = document.createElement('input');
      document.body.appendChild(inputExterno);

      act(() => {
        fireEvent.focusIn(inputExterno);
        inputExterno.focus();
      });

      expect(document.body.querySelector('[data-estado="fab"]')).not.toBeNull();
    });

    it('con el widget en pildora, focusin en input externo no altera el estado pildora', () => {
      // Apertura normal por serie (sin pasar por touch FAB)
      render(
        <RestTimer
          cronometro={crearMockCronometro({ abierto: true, serieId: 's-1' })}
          visible={true}
          onAbrirEnPausa={vi.fn()}
        />
      );

      expect(document.body.querySelector('[data-estado="pildora"]')).not.toBeNull();

      const inputExterno = document.createElement('input');
      document.body.appendChild(inputExterno);

      act(() => {
        fireEvent.focusIn(inputExterno);
        inputExterno.focus();
      });

      expect(document.body.querySelector('[data-estado="pildora"]')).not.toBeNull();
    });
  });
});
