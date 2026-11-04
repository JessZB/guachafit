// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  type OpcionesCronometro,
  type CronometroDescanso,
  useCronometroDescanso,
} from './use-cronometro-descanso';

describe('useCronometroDescanso (hook)', () => {
  const SESION_ID = 'sesion-hook-123';
  const CLAVE_STORAGE = `guachafit_cronometro_${SESION_ID}`;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('inicia cerrado por defecto si no hay estado persistido', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    expect(result.current.abierto).toBe(false);
    expect(result.current.pausado).toBe(false);
    expect(result.current.terminado).toBe(false);
    expect(result.current.serieId).toBeNull();
  });

  it('abrirParaSerie abre el cronómetro con serieId y duración especificada, ejecutando ticks de 250 ms', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    act(() => {
      result.current.abrirParaSerie('serie-1', 60);
    });

    expect(result.current.abierto).toBe(true);
    expect(result.current.serieId).toBe('serie-1');
    expect(result.current.duracionMs).toBe(60_000);
    expect(result.current.restanteMs).toBe(60_000);
    expect(result.current.pausado).toBe(false);

    // Avanzamos 1000 ms: el restante debe decrecer
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.restanteMs).toBeLessThanOrEqual(59_000);
  });

  it('abrirLibre abre el cronómetro con serieId = null y duración por defecto de 90 s', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    act(() => {
      result.current.abrirLibre();
    });

    expect(result.current.abierto).toBe(true);
    expect(result.current.serieId).toBeNull();
    expect(result.current.duracionMs).toBe(90_000);
    expect(result.current.restanteMs).toBe(90_000);
  });

  it('pausar congela el temporizador y reanudar continúa desde el tiempo restante', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    act(() => {
      result.current.abrirParaSerie('serie-1', 60);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    act(() => {
      result.current.pausar();
    });
    expect(result.current.pausado).toBe(true);
    const restantePausado = result.current.restanteMs;

    // Avanzan 30 segundos mientras está pausado
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.restanteMs).toBe(restantePausado);

    // Reanudamos
    act(() => {
      result.current.reanudar();
    });
    expect(result.current.pausado).toBe(false);
    expect(result.current.restanteMs).toBe(restantePausado);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.restanteMs).toBeLessThanOrEqual(restantePausado - 5_000);
  });

  it('recalcula inmediatamente en visibilitychange tras 60 s oculto', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    act(() => {
      result.current.abrirParaSerie('s-1', 120);
    });

    // Simulamos que la pestaña pasa a oculta
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Pasan 60 segundos con la pantalla apagada / oculta
    vi.advanceTimersByTime(60_000);

    // La pestaña vuelve a ser visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // El valor salta al real calculado (alrededor de 60 s restantes)
    expect(result.current.restanteMs).toBeLessThanOrEqual(60_000);
  });

  it('alTerminar se llama exactamente una sola vez cuando el cronómetro llega a 0', () => {
    const alTerminar = vi.fn();
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alTerminar,
      })
    );

    act(() => {
      result.current.abrirParaSerie('s-1', 10);
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.terminado).toBe(true);
    expect(alTerminar).toHaveBeenCalledTimes(1);

    // Avanzar más tiempo no vuelve a llamar alTerminar
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(alTerminar).toHaveBeenCalledTimes(1);
  });

  it('alTerminar se llama exactamente una sola vez incluso bajo StrictMode (React 18)', () => {
    const alTerminar = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const { result } = renderHook(
      () =>
        useCronometroDescanso({
          sesionId: SESION_ID,
          persistir: true,
          alTerminar,
        }),
      { wrapper }
    );

    act(() => {
      result.current.abrirParaSerie('s-1', 10);
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(alTerminar).toHaveBeenCalledTimes(1);
  });

  it('defecto 1 (regresión): cerrar con 1 s restante y avanzar 5 s => alTerminar NO se llama', () => {
    const alTerminar = vi.fn();
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alTerminar,
      })
    );

    act(() => {
      result.current.abrirParaSerie('s-1', 10);
    });
    act(() => {
      vi.advanceTimersByTime(9_000); // Queda 1 segundo
    });

    // Cerramos el cronómetro
    act(() => {
      result.current.cerrar();
    });
    expect(result.current.abierto).toBe(false);

    // Avanzan 5 segundos más
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(alTerminar).not.toHaveBeenCalled();
  });

  it('cerrar() pone abierto=false, serieId=null y borra la clave de localStorage', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    act(() => {
      result.current.abrirParaSerie('s-1', 60);
    });
    expect(localStorage.getItem(CLAVE_STORAGE)).not.toBeNull();

    act(() => {
      result.current.cerrar();
    });

    expect(result.current.abierto).toBe(false);
    expect(result.current.serieId).toBeNull();
    expect(localStorage.getItem(CLAVE_STORAGE)).toBeNull();
  });

  it('al montar con persistir y un estado guardado vigente, abre con el tiempo calculado desde finEnMs', () => {
    const ahora = Date.now();
    const estadoGuardado = {
      v: 1,
      sesionId: SESION_ID,
      serieId: 'serie-guardada',
      duracionMs: 60_000,
      finEnMs: ahora + 45_000,
      pausadoRestanteMs: null,
      notificadoFin: false,
      actualizadoEnMs: ahora,
    };
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estadoGuardado));

    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    expect(result.current.abierto).toBe(true);
    expect(result.current.serieId).toBe('serie-guardada');
    expect(result.current.duracionMs).toBe(60_000);
    expect(result.current.restanteMs).toBeLessThanOrEqual(45_000);
    expect(result.current.terminado).toBe(false);
  });

  it('al montar con un estado guardado vencido: queda abierto, terminado, alTerminar no se llama y persiste notificadoFin=true', () => {
    const alTerminar = vi.fn();
    const ahora = Date.now();
    const estadoVencido = {
      v: 1,
      sesionId: SESION_ID,
      serieId: 'serie-vencida',
      duracionMs: 60_000,
      finEnMs: ahora - 10_000, // Venció hace 10 s
      pausadoRestanteMs: null,
      notificadoFin: false,
      actualizadoEnMs: ahora - 60_000,
    };
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estadoVencido));

    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alTerminar,
      })
    );

    expect(result.current.abierto).toBe(true);
    expect(result.current.terminado).toBe(true);
    expect(result.current.restanteMs).toBe(0);
    expect(alTerminar).not.toHaveBeenCalled();

    // Comprobamos que en storage se persistió notificadoFin = true
    const persistido = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || '{}');
    expect(persistido.notificadoFin).toBe(true);
  });

  it('alCambiarDuracion: solo con serieId no nulo, con debounce de 1000 ms y valor final en segundos', () => {
    const alCambiarDuracion = vi.fn();
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alCambiarDuracion,
      })
    );

    act(() => {
      result.current.abrirParaSerie('serie-42', 60);
    });
    // Al abrir no se debe llamar
    expect(alCambiarDuracion).not.toHaveBeenCalled();

    // Pulsamos ajustar(+15) dos veces consecutivas
    act(() => {
      result.current.ajustar(15); // pasa a 75
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => {
      result.current.ajustar(15); // pasa a 90
    });

    // Antes de los 1000 ms de debounce no se ha llamado
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(alCambiarDuracion).not.toHaveBeenCalled();

    // Cumplidos los 1000 ms desde el último ajuste
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(alCambiarDuracion).toHaveBeenCalledTimes(1);
    expect(alCambiarDuracion).toHaveBeenCalledWith('serie-42', 90);
  });

  it('defecto 2 (regresión): abrirLibre + ajustar(+30) => CERO llamadas a alCambiarDuracion', () => {
    const alCambiarDuracion = vi.fn();
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alCambiarDuracion,
      })
    );

    act(() => {
      result.current.abrirLibre(90);
    });
    act(() => {
      result.current.ajustar(30);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(alCambiarDuracion).not.toHaveBeenCalled();
  });

  it('elegirPreset con serieId llama a alCambiarDuracion tras el debounce', () => {
    const alCambiarDuracion = vi.fn();
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alCambiarDuracion,
      })
    );

    act(() => {
      result.current.abrirParaSerie('serie-preset', 60);
    });
    act(() => {
      result.current.elegirPreset(120);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(alCambiarDuracion).toHaveBeenCalledWith('serie-preset', 120);
  });

  it('pausar, reanudar y reiniciar NO llaman a alCambiarDuracion', () => {
    const alCambiarDuracion = vi.fn();
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
        alCambiarDuracion,
      })
    );

    act(() => {
      result.current.abrirParaSerie('serie-1', 60);
      result.current.pausar();
      result.current.reanudar();
      result.current.reiniciar();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(alCambiarDuracion).not.toHaveBeenCalled();
  });

  it('persistir: false no escribe en localStorage y funciona en memoria', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: false,
      })
    );

    act(() => {
      result.current.abrirParaSerie('serie-demo', 60);
    });
    expect(localStorage.getItem(CLAVE_STORAGE)).toBeNull();
    expect(result.current.abierto).toBe(true);
    expect(result.current.restanteMs).toBe(60_000);
  });

  it('sesionId: null no lee ni escribe en localStorage', () => {
    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: null,
        persistir: true,
      })
    );

    act(() => {
      result.current.abrirLibre(60);
    });
    expect(localStorage.length).toBe(0);
  });

  it('cuota llena en localStorage no rompe el cronómetro y sigue operando en memoria', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const { result } = renderHook(() =>
      useCronometroDescanso({
        sesionId: SESION_ID,
        persistir: true,
      })
    );

    expect(() => {
      act(() => {
        result.current.abrirParaSerie('s-1', 60);
      });
    }).not.toThrow();

    expect(result.current.abierto).toBe(true);
    expect(result.current.restanteMs).toBe(60_000);
  });
});
