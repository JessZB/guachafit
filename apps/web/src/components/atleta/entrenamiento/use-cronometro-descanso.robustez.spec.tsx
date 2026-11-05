// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCronometroDescanso } from './use-cronometro-descanso';

describe('useCronometroDescanso · robustez (aviso tardío, excepciones y cambio de sesión)', () => {
  const SESION_ID = 'sesion-hook-robustez';
  const CLAVE_STORAGE = `guachafit_cronometro_${SESION_ID}`;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('aviso tardío silencioso', () => {
    it('al volver a la app con descanso vencido hace más de 30 s: terminado === true, alTerminar NO se llama y notificadoFin = true persistido', () => {
      const alTerminar = vi.fn();
      const INICIO = 1_000_000;
      vi.setSystemTime(INICIO);

      const { result } = renderHook(() =>
        useCronometroDescanso({
          sesionId: SESION_ID,
          persistir: true,
          alTerminar,
        })
      );

      act(() => {
        result.current.abrirParaSerie('s-1', 60); // 60s -> finaliza en 1_060_000
      });

      // Vencido hace más de 30 s (ej. 35 s después del fin: 1_095_000)
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      vi.setSystemTime(1_095_000);

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(result.current.terminado).toBe(true);
      expect(alTerminar).not.toHaveBeenCalled();

      const guardado = JSON.parse(localStorage.getItem(CLAVE_STORAGE)!);
      expect(guardado.notificadoFin).toBe(true);
    });

    it('al volver a la app con descanso vencido hace <= 30 s: alTerminar se llama exactamente una vez', () => {
      const alTerminar = vi.fn();
      const INICIO = 2_000_000;
      vi.setSystemTime(INICIO);

      const { result } = renderHook(() =>
        useCronometroDescanso({
          sesionId: 'sesion-a-tiempo',
          persistir: true,
          alTerminar,
        })
      );

      act(() => {
        result.current.abrirParaSerie('s-2', 60); // finaliza en 2_060_000
      });

      // Vencido hace 10 s (<= 30 s)
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      vi.setSystemTime(2_070_000);

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(result.current.terminado).toBe(true);
      expect(alTerminar).toHaveBeenCalledTimes(1);
    });
  });

  describe('alTerminar que lanza', () => {
    it('no propaga la excepción al evento/intervalo que lo dispara, notificadoFin queda true persistido y no se vuelve a llamar', () => {
      const alTerminarLanza = vi.fn().mockImplementation(() => {
        throw new Error('Web Audio bloqueado por el navegador');
      });

      const { result } = renderHook(() =>
        useCronometroDescanso({
          sesionId: SESION_ID,
          persistir: true,
          alTerminar: alTerminarLanza,
        })
      );

      act(() => {
        result.current.abrirParaSerie('s-1', 10);
      });

      // Avanzamos el tiempo para que termine. No debe lanzar excepción.
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(11_000);
        });
      }).not.toThrow();

      const guardado = JSON.parse(localStorage.getItem(CLAVE_STORAGE)!);
      expect(guardado.notificadoFin).toBe(true);

      // En ticks posteriores no se vuelve a llamar
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(alTerminarLanza).toHaveBeenCalledTimes(1);
    });
  });

  describe('cambio de sesión con ajuste pendiente', () => {
    it('ajustar(+15) en sesión A entrega a alCambiarDuracionA al cambiar a sesión B, y alCambiarDuracionB NO recibe esa llamada', () => {
      const alCambiarDuracionA = vi.fn();
      const alCambiarDuracionB = vi.fn();

      const { result, rerender } = renderHook(
        ({ sesionId, alCambiarDuracion }) =>
          useCronometroDescanso({
            sesionId,
            persistir: true,
            alCambiarDuracion,
          }),
        {
          initialProps: {
            sesionId: 'sesion-A',
            alCambiarDuracion: alCambiarDuracionA,
          },
        }
      );

      act(() => {
        result.current.abrirParaSerie('s-1', 60);
      });

      act(() => {
        result.current.ajustar(15);
      });

      // A los 300 ms el debounce de 1000 ms sigue pendiente
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Re-render con sesión B y callback B
      rerender({
        sesionId: 'sesion-B',
        alCambiarDuracion: alCambiarDuracionB,
      });

      expect(alCambiarDuracionA).toHaveBeenCalledTimes(1);
      expect(alCambiarDuracionA).toHaveBeenCalledWith('s-1', 75);
      expect(alCambiarDuracionB).not.toHaveBeenCalled();
    });
  });
});
