// @vitest-environment jsdom
/**
 * 01 · UX-04 · Specs de interacción para InstalarAppPrompt (Contrato D).
 *
 * Requisitos:
 * - Prop opcional onDisponibilidad(disponible: boolean).
 * - En navegador no-iOS y sin evento de instalación: botón no renderiza, onDisponibilidad(false).
 * - Al recibir beforeinstallprompt: botón visible, onDisponibilidad(true).
 * - El botón incluye min-h-11, min-w-11 y justify-center; no tiene py-1.
 * - Al recibir appinstalled: botón se oculta, onDisponibilidad(false).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { InstalarAppPrompt } from './InstalarAppPrompt';

function clases(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function despacharBeforeInstallPrompt() {
  const evento = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(evento, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  act(() => {
    window.dispatchEvent(evento);
  });
  return evento;
}

describe('InstalarAppPrompt · Contrato D', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Al montar sin evento y userAgent no-iOS: no renderiza ningún botón y llama a onDisponibilidad(false)', () => {
    const onDisponibilidad = vi.fn();
    render(<InstalarAppPrompt onDisponibilidad={onDisponibilidad} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(onDisponibilidad).toHaveBeenCalledWith(false);
  });

  it('2. Al despachar beforeinstallprompt: aparece el botón accesible y llama a onDisponibilidad(true)', () => {
    const onDisponibilidad = vi.fn();
    render(<InstalarAppPrompt onDisponibilidad={onDisponibilidad} />);

    despacharBeforeInstallPrompt();

    const boton = screen.getByRole('button', {
      name: 'Instalar la aplicación GUACHAFIT en este dispositivo',
    });
    expect(boton).toBeTruthy();
    expect(onDisponibilidad).toHaveBeenCalledWith(true);
  });

  it('3. El botón incluye min-h-11, min-w-11 y justify-center; no incluye py-1', () => {
    render(<InstalarAppPrompt />);
    despacharBeforeInstallPrompt();

    const boton = screen.getByRole('button', {
      name: 'Instalar la aplicación GUACHAFIT en este dispositivo',
    });
    const tokens = clases(boton);
    expect(tokens).toContain('min-h-11');
    expect(tokens).toContain('min-w-11');
    expect(tokens).toContain('justify-center');
    expect(tokens).not.toContain('py-1');
  });

  it('4. Al despachar appinstalled: el botón desaparece y llama a onDisponibilidad(false)', () => {
    const onDisponibilidad = vi.fn();
    render(<InstalarAppPrompt onDisponibilidad={onDisponibilidad} />);

    despacharBeforeInstallPrompt();
    expect(
      screen.getByRole('button', {
        name: 'Instalar la aplicación GUACHAFIT en este dispositivo',
      })
    ).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(
      screen.queryByRole('button', {
        name: 'Instalar la aplicación GUACHAFIT en este dispositivo',
      })
    ).toBeNull();
    expect(onDisponibilidad).toHaveBeenLastCalledWith(false);
  });
});
