// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { ModalFinalizarSesion } from './ModalFinalizarSesion';

describe('ModalFinalizarSesion · salida animada (contrato C)', () => {
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

  function renderizarModal() {
    const sesionMinima = {
      id: 'sesion-test',
      alumnoId: 'alumno-1',
      bloqueId: 'bloque-1',
      fechaProgramada: '2026-11-04',
      ejercicios: [],
    } as unknown as SesionEntrenamientoDetalleDTO;

    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const onRpeChange = vi.fn();
    const onMolestiaChange = vi.fn();
    const onNotasChange = vi.fn();

    const resultado = render(
      <ModalFinalizarSesion
        sesion={sesionMinima}
        rpeSesion={null}
        onRpeChange={onRpeChange}
        molestia=""
        onMolestiaChange={onMolestiaChange}
        notasCoachInput=""
        onNotasChange={onNotasChange}
        isFinishing={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
    const botonCerrarX = screen.getByRole('button', { name: 'Cerrar sin finalizar' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrarX,
      onClose,
      onConfirm,
    };
  }

  it('antes de cerrar, el fondo NO tiene data-saliendo', () => {
    const { fondo } = renderizarModal();
    expect(fondo).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBeNull();
  });

  it('clic en la X: deja el diálogo montado con data-saliendo="true" y llama a onClose tras 150 ms', () => {
    const { fondo, botonCerrarX, onClose } = renderizarModal();

    fireEvent.click(botonCerrarX);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clic en el fondo: deja el diálogo montado con data-saliendo="true" y llama a onClose tras 150 ms', () => {
    const { fondo, onClose } = renderizarModal();

    fireEvent.click(fondo);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sin window.matchMedia: clic en la X llama a onClose de forma síncrona', () => {
    // @ts-expect-error Eliminar mock de matchMedia
    delete window.matchMedia;

    const { botonCerrarX, onClose } = renderizarModal();

    fireEvent.click(botonCerrarX);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
