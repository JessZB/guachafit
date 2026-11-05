// @vitest-environment jsdom
/**
 * Specs Contratos A y B · useTransicionVista y movimientoReducido (Fase roja TDD).
 *
 * Contratos:
 * - A: lib/movimiento-reducido.ts exporta movimientoReducido(): boolean
 *      (true si no hay window/matchMedia o si matchMedia('(prefers-reduced-motion: reduce)').matches).
 * - B: lib/use-transicion-vista.ts exporta useTransicionVista(): boolean
 *      (true solo si typeof document.startViewTransition === 'function' && !movimientoReducido()).
 *      Se evalúa en cada render (sin estado ni efectos).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTransicionVista } from './use-transicion-vista';
import { movimientoReducido } from './movimiento-reducido';

describe('useTransicionVista y movimientoReducido · Contratos A y B', () => {
  const matchMediaOriginal = window.matchMedia;

  beforeEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    if (matchMediaOriginal) {
      window.matchMedia = matchMediaOriginal;
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    vi.restoreAllMocks();
  });

  describe('movimientoReducido (Contrato A)', () => {
    it('devuelve true si window.matchMedia no existe, o si matches es true; devuelve false si matches es false', () => {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      expect(movimientoReducido()).toBe(true);

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      expect(movimientoReducido()).toBe(true);

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      expect(movimientoReducido()).toBe(false);
    });
  });

  describe('useTransicionVista (Contrato B)', () => {
    it('devuelve false cuando document.startViewTransition no está definido', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;

      const { result } = renderHook(() => useTransicionVista());
      expect(result.current).toBe(false);
    });

    it('devuelve false con document.startViewTransition definido pero sin window.matchMedia', () => {
      (document as unknown as { startViewTransition?: unknown }).startViewTransition = vi.fn();
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;

      const { result } = renderHook(() => useTransicionVista());
      expect(result.current).toBe(false);
    });

    it('devuelve false con document.startViewTransition definido y matchMedia(...).matches === true', () => {
      (document as unknown as { startViewTransition?: unknown }).startViewTransition = vi.fn();
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

      const { result } = renderHook(() => useTransicionVista());
      expect(result.current).toBe(false);
    });

    it('devuelve true con document.startViewTransition definido y matchMedia(...).matches === false', () => {
      (document as unknown as { startViewTransition?: unknown }).startViewTransition = vi.fn();
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

      const { result } = renderHook(() => useTransicionVista());
      expect(result.current).toBe(true);
    });

    it('se reevalúa al re-renderizar tras cambiar el mock', () => {
      (document as unknown as { startViewTransition?: unknown }).startViewTransition = vi.fn();
      let matches = false;
      window.matchMedia = vi.fn().mockImplementation(() => ({ matches })) as unknown as typeof window.matchMedia;

      const { result, rerender } = renderHook(() => useTransicionVista());
      expect(result.current).toBe(true);

      matches = true;
      rerender();
      expect(result.current).toBe(false);
    });
  });
});
