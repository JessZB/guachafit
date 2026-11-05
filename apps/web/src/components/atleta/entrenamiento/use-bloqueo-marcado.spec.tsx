// @vitest-environment jsdom
/**
 * 08 · useBloqueoMarcado · contrato A (fase roja).
 *
 * Bloqueo corto (~600 ms) tras marcar serie para evitar dobles toques accidentales.
 * - DURACION_BLOQUEO_MARCADO_MS = 600
 * - estaBloqueado() devuelve true inmediatamente tras activar() y antes del re-render (vía ref).
 * - a los 599 ms sigue bloqueado; a los 600 ms se libera.
 * - un nuevo activar() reinicia los 600 ms.
 * - desmontar cancela el temporizador.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURACION_BLOQUEO_MARCADO_MS, useBloqueoMarcado } from './use-bloqueo-marcado';

describe('useBloqueoMarcado (contrato A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('exporta DURACION_BLOQUEO_MARCADO_MS igual a 600 ms', () => {
    expect(DURACION_BLOQUEO_MARCADO_MS).toBe(600);
  });

  it('inicia desbloqueado (bloqueado: false, estaBloqueado(): false)', () => {
    const { result } = renderHook(() => useBloqueoMarcado());
    expect(result.current.bloqueado).toBe(false);
    expect(result.current.estaBloqueado()).toBe(false);
  });

  it('estaBloqueado() devuelve true justo tras activar() y antes del re-render', () => {
    const { result } = renderHook(() => useBloqueoMarcado());
    act(() => {
      result.current.activar();
      expect(result.current.estaBloqueado()).toBe(true);
    });
    expect(result.current.bloqueado).toBe(true);
    expect(result.current.estaBloqueado()).toBe(true);
  });

  it('a los 599 ms sigue bloqueado y a los 600 ms libera (bloqueado: false)', () => {
    const { result } = renderHook(() => useBloqueoMarcado());
    act(() => {
      result.current.activar();
    });
    expect(result.current.bloqueado).toBe(true);
    expect(result.current.estaBloqueado()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(result.current.bloqueado).toBe(true);
    expect(result.current.estaBloqueado()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.bloqueado).toBe(false);
    expect(result.current.estaBloqueado()).toBe(false);
  });

  it('un nuevo activar() durante el bloqueo reinicia la ventana de 600 ms', () => {
    const { result } = renderHook(() => useBloqueoMarcado());
    act(() => {
      result.current.activar();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.bloqueado).toBe(true);

    act(() => {
      result.current.activar();
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.bloqueado).toBe(true);
    expect(result.current.estaBloqueado()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.bloqueado).toBe(false);
    expect(result.current.estaBloqueado()).toBe(false);
  });

  it('desmontar cancela el temporizador y no deja callbacks pendientes', () => {
    const { result, unmount } = renderHook(() => useBloqueoMarcado());
    act(() => {
      result.current.activar();
    });
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
  });
});
