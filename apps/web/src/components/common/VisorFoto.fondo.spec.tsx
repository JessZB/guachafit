// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AnguloFoto, type FotoAntropometriaDetalleDTO } from '@guachafit/shared';
import { VisorFoto, type VisorFotoProps } from './VisorFoto';

const FOTO_PRUEBA: FotoAntropometriaDetalleDTO = {
  id: 'foto-1',
  controlId: 'ctrl-1',
  angulo: AnguloFoto.FRONTAL,
  storageKey: 'fotos/frontal.jpg',
  presignedGetUrl: 'https://example.com/foto-frontal.jpg',
  createdAtUtc: '2026-11-01T12:00:00.000Z',
};

describe('VisorFoto · cierre al hacer clic fuera del modal (fase roja)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    // @ts-expect-error Limpieza de matchMedia
    delete window.matchMedia;
  });

  function renderizar(propsParciales: Partial<VisorFotoProps> = {}) {
    const onCerrar = vi.fn();

    const resultado = render(
      <VisorFoto
        foto={FOTO_PRUEBA}
        fecha="2026-11-01"
        onCerrar={onCerrar}
        {...propsParciales}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.parentElement as HTMLElement;
    const botonCerrar = screen.getByRole('button', { name: 'Cerrar foto' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrar,
      onCerrar,
    };
  }

  it('con matchMedia matches:false y fake timers: clic en el fondo activa data-saliendo y llama a onCerrar a los 150 ms', () => {
    const { fondo, onCerrar } = renderizar();

    expect(fondo.getAttribute('data-saliendo')).toBeNull();

    fireEvent.click(fondo);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
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

  it('clic en el panel (role="dialog") o en un texto interior no cierra el modal', () => {
    const { dialog, fondo, onCerrar } = renderizar();

    fireEvent.click(dialog);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).not.toHaveBeenCalled();

    const heading = screen.getByRole('heading');
    fireEvent.click(heading);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('sin matchMedia: clic en el fondo llama a onCerrar síncronamente una vez', () => {
    // @ts-expect-error Eliminar mock de matchMedia
    delete window.matchMedia;

    const { fondo, onCerrar } = renderizar();

    fireEvent.click(fondo);

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('regresión: el botón de cerrar existente sigue funcionando con salida animada', () => {
    const { fondo, botonCerrar, onCerrar } = renderizar();

    fireEvent.click(botonCerrar);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
