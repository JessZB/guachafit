// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModalRechazoConciliacion } from './ModalRechazoConciliacion';

describe('ModalRechazoConciliacion · cierre al hacer clic fuera del modal (fase roja)', () => {
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

  function renderizar(propsParciales = {}) {
    const onCerrar = vi.fn();
    const onConfirmar = vi.fn();
    const onCambiarMotivo = vi.fn();
    const resultado = render(
      <ModalRechazoConciliacion
        alumno="Carlos Mendoza"
        montoTexto="$50,00 USD"
        motivo=""
        procesando={false}
        error={null}
        onCambiarMotivo={onCambiarMotivo}
        onCerrar={onCerrar}
        onConfirmar={onConfirmar}
        {...propsParciales}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.parentElement as HTMLElement;
    const botonCerrar = screen.getByRole('button', { name: 'Cerrar rechazo de pago' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrar,
      onCerrar,
      onConfirmar,
      onCambiarMotivo,
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

    const titulo = screen.getByRole('heading', { name: 'Rechazar pago' });
    fireEvent.click(titulo);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('con procesando: clic en el fondo ni activa data-saliendo ni llama a onCerrar tras 150 ms', () => {
    const { fondo, onCerrar } = renderizar({ procesando: true });

    fireEvent.click(fondo);

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
