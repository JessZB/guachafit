// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';
import { RestTimer } from './RestTimer';
import * as RestTimerModule from './RestTimer';

// Constante exportada por el contrato A
const DURACION_SALIDA_CRONOMETRO_MS = (RestTimerModule as Record<string, unknown>)
  .DURACION_SALIDA_CRONOMETRO_MS as number | undefined;

// Adaptador de tipo para las nuevas props del contrato A
const RestTimerFab = RestTimer as unknown as React.ComponentType<{
  cronometro: CronometroDescanso;
  visible: boolean;
  onAbrirEnPausa: () => void;
}>;

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

describe('RestTimer (contrato A · FAB flotante y widget unificado de descanso)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('ancla: renderiza un único elemento fixed con data-estado montado en portal directo en document.body (fuera de <main>)', () => {
    const cronometro = crearMockCronometro({ abierto: false });
    const { container } = render(
      <main data-testid="contenedor-principal">
        <RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={vi.fn()} />
      </main>
    );

    const contenedor = container.querySelector('[data-testid="contenedor-principal"]');
    expect(contenedor).not.toBeNull();

    // El ancla debe existir en document.body pero NO dentro de <main>
    const ancla = document.body.querySelector('[data-estado="fab"]');
    expect(ancla).not.toBeNull();
    expect(contenedor?.contains(ancla)).toBe(false);
    expect(ancla?.className).toContain('fixed');
  });

  describe('Estado FAB (visible=true y !cronometro.abierto)', () => {
    it('muestra el botón con nombre accesible EXACTO "Abrir cronómetro de descanso" y ningún role="timer"', () => {
      const cronometro = crearMockCronometro({ abierto: false });
      render(<RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={vi.fn()} />);

      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      expect(botonFab).toBeTruthy();

      expect(screen.queryByRole('timer')).toBeNull();
      const ancla = document.body.querySelector('[data-estado="fab"]');
      expect(ancla).not.toBeNull();
    });

    it('al tocar el FAB se llama a onAbrirEnPausa UNA sola vez', () => {
      const cronometro = crearMockCronometro({ abierto: false });
      const onAbrirEnPausa = vi.fn();
      render(<RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={onAbrirEnPausa} />);

      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      fireEvent.click(botonFab);

      expect(onAbrirEnPausa).toHaveBeenCalledTimes(1);
    });

    it('cuando abierto pasa a true como consecuencia de tocar el FAB, se muestra EXPANDIDO (panel) y el foco va a "Reanudar descanso"', () => {
      let abiertoState = false;
      let pausadoState = false;
      const onAbrirEnPausa = vi.fn(() => {
        abiertoState = true;
        pausadoState = true;
      });

      const cronometroInicial = crearMockCronometro({
        abierto: false,
        pausado: false,
        restanteMs: 90_000,
        duracionMs: 90_000,
      });

      const { rerender } = render(
        <RestTimerFab
          cronometro={cronometroInicial}
          visible={true}
          onAbrirEnPausa={onAbrirEnPausa}
        />
      );

      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      fireEvent.click(botonFab);
      expect(onAbrirEnPausa).toHaveBeenCalledTimes(1);

      // El host actualiza el cronómetro con abierto=true y pausado=true
      const cronometroAbierto = crearMockCronometro({
        abierto: true,
        pausado: true,
        restanteMs: 90_000,
        duracionMs: 90_000,
      });

      rerender(
        <RestTimerFab
          cronometro={cronometroAbierto}
          visible={true}
          onAbrirEnPausa={onAbrirEnPausa}
        />
      );

      // Ancla en estado panel
      const ancla = document.body.querySelector('[data-estado="panel"]');
      expect(ancla).not.toBeNull();

      const botonReanudar = screen.getByRole('button', { name: 'Reanudar descanso' });
      expect(botonReanudar).toBeTruthy();
      expect(document.activeElement).toBe(botonReanudar);
    });

    it('apertura automática (al marcar serie sin tocar FAB): se muestra como píldora y NO se mueve el foco', () => {
      // Elemento externo con foco activo
      const botonExterno = document.createElement('button');
      botonExterno.textContent = 'Serie externa';
      document.body.appendChild(botonExterno);
      botonExterno.focus();
      expect(document.activeElement).toBe(botonExterno);

      const cronometroInicial = crearMockCronometro({ abierto: false });
      const { rerender } = render(
        <RestTimerFab
          cronometro={cronometroInicial}
          visible={true}
          onAbrirEnPausa={vi.fn()}
        />
      );

      // Apertura automática directa sin click en FAB
      const cronometroAuto = crearMockCronometro({
        abierto: true,
        pausado: false,
        serieId: 's-1',
        restanteMs: 90_000,
        duracionMs: 90_000,
      });

      rerender(
        <RestTimerFab
          cronometro={cronometroAuto}
          visible={true}
          onAbrirEnPausa={vi.fn()}
        />
      );

      const ancla = document.body.querySelector('[data-estado="pildora"]');
      expect(ancla).not.toBeNull();

      // No se movió el foco
      expect(document.activeElement).toBe(botonExterno);

      document.body.removeChild(botonExterno);
    });

    it('si el toque en el FAB no consigue abrir el cronómetro, la intención caduca y una apertura posterior automática se muestra como píldora sin mover el foco', async () => {
      const onAbrirEnPausa = vi.fn(); // No abre el cronómetro (abierto sigue en false)

      const cronometroInicial = crearMockCronometro({
        abierto: false,
        pausado: false,
        serieId: null,
      });

      const { rerender } = render(
        <RestTimerFab
          cronometro={cronometroInicial}
          visible={true}
          onAbrirEnPausa={onAbrirEnPausa}
        />
      );

      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      fireEvent.click(botonFab);
      expect(onAbrirEnPausa).toHaveBeenCalledTimes(1);

      // Esperar un ciclo para que la intención caduque
      await act(async () => {
        await Promise.resolve();
      });

      // Apertura automática posterior (marcar serie en la rutina)
      const cronometroAuto = crearMockCronometro({
        abierto: true,
        pausado: false,
        serieId: 's-9',
        restanteMs: 90_000,
        duracionMs: 90_000,
      });

      rerender(
        <RestTimerFab
          cronometro={cronometroAuto}
          visible={true}
          onAbrirEnPausa={onAbrirEnPausa}
        />
      );

      // Debe mostrarse como píldora (no como panel)
      const anclaPildora = document.body.querySelector('[data-estado="pildora"]');
      expect(anclaPildora).not.toBeNull();

      expect(screen.getByRole('button', { name: 'Expandir cronómetro' })).toBeTruthy();

      const botonReanudar = screen.queryByRole('button', { name: 'Reanudar descanso' });
      expect(document.activeElement).not.toBe(botonReanudar);
    });
  });

  describe('Estados píldora y panel (accesibilidad y unicidad)', () => {
    it('estado píldora: expone exactamente UN role="timer" accesible con "Cronómetro de descanso" y nombres accesibles no duplicados', () => {
      const cronometro = crearMockCronometro({
        abierto: true,
        pausado: false,
        restanteMs: 60_000,
        duracionMs: 60_000,
      });

      render(<RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={vi.fn()} />);

      const timers = screen.getAllByRole('timer');
      expect(timers).toHaveLength(1);
      expect(timers[0].getAttribute('aria-label')).toBe('Cronómetro de descanso');

      expect(screen.getByRole('button', { name: 'Expandir cronómetro' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Pausar descanso' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Cerrar cronómetro de descanso' })).toBeTruthy();
    });

    it('estado panel: expone exactamente UN role="timer" y todos sus controles accesibles sin nombres duplicados', () => {
      // Simular apertura por FAB para que entre en panel
      const cronometro = crearMockCronometro({
        abierto: false,
        pausado: true,
        restanteMs: 90_000,
        duracionMs: 90_000,
      });

      const { rerender } = render(
        <RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Abrir cronómetro de descanso' }));

      const cronometroPanel = crearMockCronometro({
        abierto: true,
        pausado: true,
        restanteMs: 90_000,
        duracionMs: 90_000,
      });

      rerender(
        <RestTimerFab cronometro={cronometroPanel} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      const timers = screen.getAllByRole('timer');
      expect(timers).toHaveLength(1);
      expect(timers[0].getAttribute('aria-label')).toBe('Cronómetro de descanso');

      expect(screen.getByRole('button', { name: 'Minimizar cronómetro' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Cerrar cronómetro' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Descanso de 1 min' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Descanso de 1 min 30 s' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Descanso de 2 min' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Descanso de 3 min' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Restar 15 segundos' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sumar 15 segundos' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reanudar descanso' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reiniciar descanso' })).toBeTruthy();
    });
  });

  describe('Cierre con X y capa saliente de 150 ms con vista congelada', () => {
    it('cerrar píldora: llama a cronometro.cerrar(), monta capa saliente con data-saliendo/aria-hidden/inert, mantiene vista congelada y desaparece tras 150 ms volviendo foco al FAB', () => {
      vi.useFakeTimers();

      const mockCerrar = vi.fn();
      const cronometro = crearMockCronometro({
        abierto: true,
        pausado: false,
        restanteMs: 45_000,
        duracionMs: 90_000,
        cerrar: mockCerrar,
      });

      const { rerender } = render(
        <RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      const botonCerrar = screen.getByRole('button', { name: 'Cerrar cronómetro de descanso' });
      fireEvent.click(botonCerrar);

      expect(mockCerrar).toHaveBeenCalledTimes(1);

      // Simular que el hook responde cerrándose y reseteando restanteMs a 0
      const cronometroCerrado = crearMockCronometro({
        abierto: false,
        pausado: false,
        restanteMs: 0,
        duracionMs: 0,
        cerrar: mockCerrar,
      });

      rerender(
        <RestTimerFab cronometro={cronometroCerrado} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      // El FAB ya debe estar disponible
      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      expect(botonFab).toBeTruthy();

      // Durante los 150 ms existe una capa saliente con data-saliendo="true"
      const capaSaliente = document.body.querySelector('[data-saliendo="true"]');
      expect(capaSaliente).not.toBeNull();
      expect(capaSaliente?.getAttribute('aria-hidden')).toBe('true');
      expect(capaSaliente?.hasAttribute('inert')).toBe(true);

      // Vista congelada: debe mostrar el último tiempo (0:45) y NUNCA "0:00"
      expect(capaSaliente?.textContent).toContain('0:45');
      expect(capaSaliente?.textContent).not.toContain('0:00');

      // Avanzar los 150 ms (DURACION_SALIDA_CRONOMETRO_MS)
      act(() => {
        vi.advanceTimersByTime(DURACION_SALIDA_CRONOMETRO_MS ?? 150);
      });

      // La capa saliente desaparece
      expect(document.body.querySelector('[data-saliendo="true"]')).toBeNull();

      // El foco vuelve al botón del FAB
      expect(document.activeElement).toBe(botonFab);
    });

    it('cerrar panel: mantiene capa saliente congelada y tras 150 ms devuelve el foco al FAB', () => {
      vi.useFakeTimers();

      const mockCerrar = vi.fn();
      const cronometroInicial = crearMockCronometro({
        abierto: false,
        pausado: true,
        restanteMs: 80_000,
        duracionMs: 90_000,
        cerrar: mockCerrar,
      });

      const { rerender } = render(
        <RestTimerFab cronometro={cronometroInicial} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      // Abrir por FAB para tener panel
      fireEvent.click(screen.getByRole('button', { name: 'Abrir cronómetro de descanso' }));

      const cronometroPanel = crearMockCronometro({
        abierto: true,
        pausado: true,
        restanteMs: 80_000,
        duracionMs: 90_000,
        cerrar: mockCerrar,
      });
      rerender(
        <RestTimerFab cronometro={cronometroPanel} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      const botonCerrarPanel = screen.getByRole('button', { name: 'Cerrar cronómetro' });
      fireEvent.click(botonCerrarPanel);
      expect(mockCerrar).toHaveBeenCalledTimes(1);

      // Hook se cierra y resetea
      const cronometroCerrado = crearMockCronometro({
        abierto: false,
        restanteMs: 0,
        duracionMs: 0,
        cerrar: mockCerrar,
      });
      rerender(
        <RestTimerFab cronometro={cronometroCerrado} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      const capaSaliente = document.body.querySelector('[data-saliendo="true"]');
      expect(capaSaliente).not.toBeNull();
      expect(capaSaliente?.getAttribute('aria-hidden')).toBe('true');
      expect(capaSaliente?.hasAttribute('inert')).toBe(true);
      expect(capaSaliente?.textContent).toContain('1:20');
      expect(capaSaliente?.textContent).not.toContain('0:00');

      act(() => {
        vi.advanceTimersByTime(DURACION_SALIDA_CRONOMETRO_MS ?? 150);
      });

      expect(document.body.querySelector('[data-saliendo="true"]')).toBeNull();
      const botonFab = screen.getByRole('button', { name: 'Abrir cronómetro de descanso' });
      expect(document.activeElement).toBe(botonFab);
    });

    it('transición píldora <-> panel y ocultamiento por visible=false son instantáneas sin capa saliente', () => {
      const cronometro = crearMockCronometro({
        abierto: true,
        pausado: false,
        restanteMs: 60_000,
        duracionMs: 60_000,
      });

      const { rerender } = render(
        <RestTimerFab cronometro={cronometro} visible={true} onAbrirEnPausa={vi.fn()} />
      );

      // Expandir píldora a panel
      fireEvent.click(screen.getByRole('button', { name: 'Expandir cronómetro' }));
      expect(document.body.querySelector('[data-saliendo="true"]')).toBeNull();

      // Minimizar panel a píldora
      fireEvent.click(screen.getByRole('button', { name: 'Minimizar cronómetro' }));
      expect(document.body.querySelector('[data-saliendo="true"]')).toBeNull();

      // Ocultar por visible=false
      rerender(<RestTimerFab cronometro={cronometro} visible={false} onAbrirEnPausa={vi.fn()} />);
      expect(document.body.querySelector('[data-saliendo="true"]')).toBeNull();
    });
  });

  describe('visible = false y región aria-live', () => {
    it('con visible=false no hay FAB, ni píldora, ni panel, ni role="timer"', () => {
      const cronometro = crearMockCronometro({
        abierto: true,
        restanteMs: 40_000,
        duracionMs: 90_000,
      });

      render(<RestTimerFab cronometro={cronometro} visible={false} onAbrirEnPausa={vi.fn()} />);

      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Abrir cronómetro de descanso' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Expandir cronómetro' })).toBeNull();
      expect(document.body.querySelector('[data-estado]')).toBeNull();
    });

    it('la región aria-live="polite" está SIEMPRE montada fuera de las capas animadas, incluso con visible=false', () => {
      const cronometro = crearMockCronometro({
        abierto: false,
        terminado: false,
      });

      const { rerender } = render(
        <RestTimerFab cronometro={cronometro} visible={false} onAbrirEnPausa={vi.fn()} />
      );

      const regionLive = document.body.querySelector('[aria-live="polite"]');
      expect(regionLive).not.toBeNull();
      expect(regionLive?.textContent?.trim()).toBe('');

      // Cuando terminado pasa a true con visible=false, anuncia "Descanso terminado"
      const cronometroTerminado = crearMockCronometro({
        abierto: false,
        terminado: true,
      });

      rerender(
        <RestTimerFab cronometro={cronometroTerminado} visible={false} onAbrirEnPausa={vi.fn()} />
      );

      expect(regionLive?.textContent).toContain('Descanso terminado');
    });
  });
});
