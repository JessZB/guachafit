// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// Carga segura en fase roja: si el módulo no existe, se mantiene undefined para que cada test
// evalúe el contrato y falle porque el módulo/export no existe, permitiendo registrar cada test rojo.
type ModuloSalidaModal = {
  useSalidaModal?: (onCerrar: () => void) => { saliendo: boolean; cerrar: () => void };
  DURACION_SALIDA_MODAL_MS?: number;
  CLASES_SALIDA_MODAL?: string;
};

let modulo: ModuloSalidaModal = {};
try {
  const ruta = './use-salida-modal';
  modulo = await import(/* @vite-ignore */ ruta);
} catch {
  modulo = {};
}

const useSalidaModal = modulo.useSalidaModal!;
const DURACION_SALIDA_MODAL_MS = modulo.DURACION_SALIDA_MODAL_MS;
const CLASES_SALIDA_MODAL = modulo.CLASES_SALIDA_MODAL;

describe('useSalidaModal (contrato A · salida animada de modales)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    // @ts-expect-error Limpieza de matchMedia
    delete window.matchMedia;
  });

  it('exporta DURACION_SALIDA_MODAL_MS = 150 y CLASES_SALIDA_MODAL con data-[saliendo=true]:animate-out', () => {
    expect(DURACION_SALIDA_MODAL_MS).toBe(150);
    expect(CLASES_SALIDA_MODAL).toContain('data-[saliendo=true]:animate-out');
  });

  it('sin window.matchMedia: cerrar() llama a onCerrar de forma síncrona y saliendo queda false', () => {
    // @ts-expect-error Asegurar ausencia de matchMedia
    delete window.matchMedia;
    const onCerrar = vi.fn();
    const { result } = renderHook(() => useSalidaModal(onCerrar));

    expect(result.current.saliendo).toBe(false);

    act(() => {
      result.current.cerrar();
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(result.current.saliendo).toBe(false);
  });

  it('con prefers-reduced-motion: reduce activado (matches=true): cerrar() llama síncrono y saliendo queda false', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onCerrar = vi.fn();
    const { result } = renderHook(() => useSalidaModal(onCerrar));

    act(() => {
      result.current.cerrar();
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(result.current.saliendo).toBe(false);
  });

  it('con prefers-reduced-motion desactivado (matches=false): cerrar() activa saliendo y llama a onCerrar tras 150 ms', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onCerrar = vi.fn();
    const { result } = renderHook(() => useSalidaModal(onCerrar));

    act(() => {
      result.current.cerrar();
    });

    expect(result.current.saliendo).toBe(true);
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('segundo cerrar() mientras sale: se ignora (una sola llamada a onCerrar)', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const onCerrar = vi.fn();
    const { result } = renderHook(() => useSalidaModal(onCerrar));

    act(() => {
      result.current.cerrar();
      result.current.cerrar();
    });

    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('desmontar el hook durante la salida cancela el temporizador: onCerrar no se llama', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const onCerrar = vi.fn();
    const { result, unmount } = renderHook(() => useSalidaModal(onCerrar));

    act(() => {
      result.current.cerrar();
    });

    expect(result.current.saliendo).toBe(true);

    unmount();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('usa siempre el onCerrar más reciente si cambia antes de los 150 ms', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const primerOnCerrar = vi.fn();
    const segundoOnCerrar = vi.fn();

    const { result, rerender } = renderHook(
      ({ callback }) => useSalidaModal(callback),
      { initialProps: { callback: primerOnCerrar } }
    );

    act(() => {
      result.current.cerrar();
    });

    rerender({ callback: segundoOnCerrar });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(primerOnCerrar).not.toHaveBeenCalled();
    expect(segundoOnCerrar).toHaveBeenCalledTimes(1);
  });

  it('matchMedia se evalúa en cada cerrar() (cambio de preferencia altera el comportamiento)', () => {
    let reducedMotion = false;
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: reducedMotion,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onCerrar = vi.fn();
    const { result } = renderHook(() => useSalidaModal(onCerrar));

    // Primer cierre con reducedMotion = false -> animación diferida
    act(() => {
      result.current.cerrar();
    });
    expect(result.current.saliendo).toBe(true);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).toHaveBeenCalledTimes(1);

    // Cambiar preferencia de usuario a reducedMotion = true
    reducedMotion = true;
    const segundoOnCerrar = vi.fn();
    const { result: segundoHook } = renderHook(() => useSalidaModal(segundoOnCerrar));

    act(() => {
      segundoHook.current.cerrar();
    });
    // Ahora debe ser síncrono
    expect(segundoOnCerrar).toHaveBeenCalledTimes(1);
    expect(segundoHook.current.saliendo).toBe(false);
  });
});
