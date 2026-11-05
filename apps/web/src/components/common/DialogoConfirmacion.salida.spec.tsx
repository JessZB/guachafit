// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DialogoConfirmacion } from './DialogoConfirmacion';

describe('DialogoConfirmacion · salida animada (contrato B)', () => {
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

  function renderizarDialogo(propsParciales = {}) {
    const onCancelar = vi.fn();
    const onConfirmar = vi.fn();
    const resultado = render(
      <DialogoConfirmacion
        abierto={true}
        idTitulo="dialogo-test-id"
        titulo="Título de prueba"
        detalle="Detalle de prueba para la confirmación"
        textoConfirmar="Confirmar acción"
        onCancelar={onCancelar}
        onConfirmar={onConfirmar}
        {...propsParciales}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
    const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
    const botonConfirmar = screen.getByRole('button', { name: 'Confirmar acción' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCancelar,
      botonConfirmar,
      onCancelar,
      onConfirmar,
    };
  }

  it('antes de cualquier cierre, el fondo NO tiene data-saliendo', () => {
    const { fondo } = renderizarDialogo();
    expect(fondo).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBeNull();
  });

  it('clic en Cancelar: el role="dialog" sigue montado, fondo tiene data-saliendo="true" y onCancelar se llama tras 150 ms', () => {
    const { fondo, botonCancelar, onCancelar } = renderizarDialogo();

    fireEvent.click(botonCancelar);

    // El diálogo sigue en el documento durante la animación de salida
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

  it('clic en el fondo: dialog sigue montado, fondo tiene data-saliendo="true" y onCancelar se llama tras 150 ms', () => {
    const { fondo, onCancelar } = renderizarDialogo();

    fireEvent.click(fondo);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('tecla Escape: dialog sigue montado, fondo tiene data-saliendo="true" y onCancelar se llama tras 150 ms', () => {
    const { fondo, onCancelar } = renderizarDialogo();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('clic en Confirmar: onConfirmar se llama de inmediato, sin data-saliendo', () => {
    const { fondo, botonConfirmar, onConfirmar } = renderizarDialogo();

    fireEvent.click(botonConfirmar);

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(fondo.getAttribute('data-saliendo')).toBeNull();
  });

  it('con procesando: clic en Cancelar y en el fondo no inician salida ni llaman a onCancelar', () => {
    const { fondo, botonCancelar, onCancelar } = renderizarDialogo({ procesando: true });

    fireEvent.click(botonCancelar);
    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCancelar).not.toHaveBeenCalled();

    fireEvent.click(fondo);
    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCancelar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('con matchMedia ausente: Cancelar llama a onCancelar síncronamente', () => {
    // @ts-expect-error Eliminar mock de matchMedia
    delete window.matchMedia;

    const { botonCancelar, onCancelar } = renderizarDialogo();

    fireEvent.click(botonCancelar);

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
