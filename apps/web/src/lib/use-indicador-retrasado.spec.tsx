// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIndicadorRetrasado } from './use-indicador-retrasado';

describe('useIndicadorRetrasado · Contrato A', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('devuelve false de inicio con activo=true, false a 149 ms y true tras 150 ms', () => {
    const { result } = renderHook(() => useIndicadorRetrasado(true));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('si activo es false desde el inicio devuelve false sin temporizadores programados', () => {
    const { result } = renderHook(() => useIndicadorRetrasado(false));

    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pasar activo a false apaga el indicador de inmediato y cancela el temporizador', () => {
    const { result, rerender } = renderHook(
      ({ activo }: { activo: boolean }) => useIndicadorRetrasado(activo),
      { initialProps: { activo: true } }
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe(true);

    rerender({ activo: false });
    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('parpadeo (true -> false antes de 150 ms -> true) reinicia el plazo completo de retardo', () => {
    const { result, rerender } = renderHook(
      ({ activo }: { activo: boolean }) => useIndicadorRetrasado(activo),
      { initialProps: { activo: true } }
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);

    rerender({ activo: false });
    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    rerender({ activo: true });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(true);
  });

  it('admite retardoMs personalizado (300 ms)', () => {
    const { result } = renderHook(() => useIndicadorRetrasado(true, 300));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('con retardoMs = 0 pasa a true en el siguiente efecto', () => {
    const { result } = renderHook(() => useIndicadorRetrasado(true, 0));

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(true);
  });

  it('desmontar cancela el temporizador sin dejar temporizadores pendientes', () => {
    const { unmount } = renderHook(() => useIndicadorRetrasado(true, 150));

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
