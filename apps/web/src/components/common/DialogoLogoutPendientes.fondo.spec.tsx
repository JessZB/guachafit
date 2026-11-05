// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DialogoLogoutPendientes,
  type DialogoLogoutPendientesProps,
} from './DialogoLogoutPendientes';

describe('DialogoLogoutPendientes · cierre al hacer clic fuera del modal (fase roja)', () => {
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

  function renderizar(propsParciales: Partial<DialogoLogoutPendientesProps> = {}) {
    const onCancelar = vi.fn();
    const onConfirmar = vi.fn();
    const onSincronizar = vi.fn();

    const resultado = render(
      <DialogoLogoutPendientes
        abierto={true}
        pendientes={2}
        sincronizando={false}
        mensaje={null}
        onCancelar={onCancelar}
        onConfirmar={onConfirmar}
        onSincronizar={onSincronizar}
        {...propsParciales}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.parentElement as HTMLElement;
    const botonCerrar = screen.getByRole('button', {
      name: 'Cancelar y volver a la aplicación',
    });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrar,
      onCancelar,
      onConfirmar,
      onSincronizar,
    };
  }

  it('con matchMedia matches:false y fake timers: clic en el fondo activa data-saliendo y llama a onCancelar a los 150 ms', () => {
    const { fondo, onCancelar } = renderizar();

    expect(fondo.getAttribute('data-saliendo')).toBeNull();

    fireEvent.click(fondo);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('clic en el panel (role="dialog") o en un texto interior no cierra el modal', () => {
    const { dialog, fondo, onCancelar } = renderizar();

    fireEvent.click(dialog);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).not.toHaveBeenCalled();

    const heading = screen.getByRole('heading', { name: 'Cambios sin sincronizar' });
    fireEvent.click(heading);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('con sincronizando: clic en el fondo ni activa data-saliendo ni llama a onCancelar tras 150 ms', () => {
    const { fondo, onCancelar } = renderizar({ sincronizando: true });

    fireEvent.click(fondo);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('sin matchMedia: clic en el fondo llama a onCancelar síncronamente una vez', () => {
    // @ts-expect-error Eliminar mock de matchMedia
    delete window.matchMedia;

    const { fondo, onCancelar } = renderizar();

    fireEvent.click(fondo);

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('regresión: el botón de cerrar existente sigue funcionando con salida animada', () => {
    const { fondo, botonCerrar, onCancelar } = renderizar();

    fireEvent.click(botonCerrar);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
