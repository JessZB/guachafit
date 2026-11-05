// @vitest-environment jsdom
/**
 * 08 · useAvisoSerieCompletada · contrato B (fase roja).
 *
 * Gestión del estado del aviso temporal de serie completada:
 * - DURACION_AVISO_SERIE_MS = 6000
 * - tipo AvisoSerieCompletada = { serieId, ejercicioIndex, serieIndex, numeroSerie }
 * - mostrar fija el aviso y lo auto-oculta a los 6000 ms (no antes).
 * - un mostrar posterior sustituye y reinicia el plazo.
 * - ocultar lo quita y cancela el plazo.
 * - desmontar cancela el temporizador.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DURACION_AVISO_SERIE_MS,
  useAvisoSerieCompletada,
  type AvisoSerieCompletada,
} from './use-aviso-serie-completada';

describe('useAvisoSerieCompletada (contrato B)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const AVISO_1: AvisoSerieCompletada = {
    serieId: 's-1',
    ejercicioIndex: 0,
    serieIndex: 0,
    numeroSerie: 1,
  };

  const AVISO_2: AvisoSerieCompletada = {
    serieId: 's-2',
    ejercicioIndex: 0,
    serieIndex: 1,
    numeroSerie: 2,
  };

  it('exporta DURACION_AVISO_SERIE_MS igual a 6000 ms', () => {
    expect(DURACION_AVISO_SERIE_MS).toBe(6000);
  });

  it('inicia con aviso null', () => {
    const { result } = renderHook(() => useAvisoSerieCompletada());
    expect(result.current.aviso).toBeNull();
  });

  it('mostrar() fija el aviso y se auto-oculta a los 6000 ms (no antes)', () => {
    const { result } = renderHook(() => useAvisoSerieCompletada());
    act(() => {
      result.current.mostrar(AVISO_1);
    });
    expect(result.current.aviso).toEqual(AVISO_1);

    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(result.current.aviso).toEqual(AVISO_1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.aviso).toBeNull();
  });

  it('sustitución con reinicio: un segundo mostrar() renueva el plazo completo de 6000 ms', () => {
    const { result } = renderHook(() => useAvisoSerieCompletada());
    act(() => {
      result.current.mostrar(AVISO_1);
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.aviso).toEqual(AVISO_1);

    act(() => {
      result.current.mostrar(AVISO_2);
    });
    expect(result.current.aviso).toEqual(AVISO_2);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.aviso).toEqual(AVISO_2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.aviso).toBeNull();
  });

  it('ocultar() cancela y limpia el aviso de inmediato', () => {
    const { result } = renderHook(() => useAvisoSerieCompletada());
    act(() => {
      result.current.mostrar(AVISO_1);
    });
    expect(result.current.aviso).toEqual(AVISO_1);

    act(() => {
      result.current.ocultar();
    });
    expect(result.current.aviso).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(result.current.aviso).toBeNull();
  });

  it('desmontaje cancela el temporizador pendiente', () => {
    const { result, unmount } = renderHook(() => useAvisoSerieCompletada());
    act(() => {
      result.current.mostrar(AVISO_1);
    });
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(10000);
      });
    }).not.toThrow();
  });
});
