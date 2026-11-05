// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { ModalFinalizarSesion } from './ModalFinalizarSesion';
import { ModalCierreVacio } from './ModalCierreVacio';
import { ModalVideoTecnica } from './ModalVideoTecnica';

describe('Modales entrenamiento · escape animado', () => {
  function configurarMatchMedia(matches = false) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    // @ts-expect-error Limpieza de matchMedia
    delete window.matchMedia;
  });

  describe('ModalFinalizarSesion', () => {
    const sesionMinima = {
      id: 'sesion-test',
      alumnoId: 'alumno-1',
      bloqueId: 'bloque-1',
      fechaProgramada: '2026-11-04',
      ejercicios: [],
    } as unknown as SesionEntrenamientoDetalleDTO;

    function renderizar(onClose = vi.fn()) {
      const props = {
        sesion: sesionMinima,
        rpeSesion: null,
        onRpeChange: vi.fn(),
        molestia: '',
        onMolestiaChange: vi.fn(),
        notasCoachInput: '',
        onNotasChange: vi.fn(),
        isFinishing: false,
        onClose,
        onConfirm: vi.fn(),
      };
      // Contrato nuevo: sin pasar dialogRef
      const resultado = render(<ModalFinalizarSesion {...(props as any)} />);
      const dialog = screen.getByRole('dialog');
      const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
      return { ...resultado, dialog, fondo, onClose };
    }

    it('con matchMedia matches:false: Escape deja el dialog con data-saliendo="true" y llama a onClose a los 150 ms', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { fondo, onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });

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

    it('un segundo Escape durante la animación de salida no duplica la llamada', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sin matchMedia: Escape llama a onClose de forma síncrona', () => {
      // @ts-expect-error Asegura ausencia de matchMedia
      delete window.matchMedia;
      const { onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ModalCierreVacio', () => {
    function renderizar(onClose = vi.fn()) {
      const props = {
        isFinishing: false,
        onClose,
        onConfirm: vi.fn(),
      };
      // Contrato nuevo: sin pasar dialogRef
      const resultado = render(<ModalCierreVacio {...(props as any)} />);
      const dialog = screen.getByRole('dialog');
      const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
      return { ...resultado, dialog, fondo, onClose };
    }

    it('con matchMedia matches:false: Escape deja el dialog con data-saliendo="true" y llama a onClose a los 150 ms', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { fondo, onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(fondo.getAttribute('data-saliendo')).toBe('true');
      expect(onClose).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('un segundo Escape durante la salida no duplica la llamada', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sin matchMedia: Escape llama a onClose síncrono', () => {
      // @ts-expect-error Asegura ausencia de matchMedia
      delete window.matchMedia;
      const { onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ModalVideoTecnica', () => {
    function renderizar(onClose = vi.fn()) {
      const props = {
        video: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', nombre: 'Sentadilla' },
        onClose,
      };
      // Contrato nuevo: sin pasar dialogRef
      const resultado = render(<ModalVideoTecnica {...(props as any)} />);
      const dialog = screen.getByRole('dialog');
      const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
      return { ...resultado, dialog, fondo, onClose };
    }

    it('con matchMedia matches:false: Escape deja el dialog con data-saliendo="true" y llama a onClose a los 150 ms', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { fondo, onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(fondo.getAttribute('data-saliendo')).toBe('true');
      expect(onClose).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('un segundo Escape durante la salida no duplica la llamada', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sin matchMedia: Escape llama a onClose síncrono', () => {
      // @ts-expect-error Asegura ausencia de matchMedia
      delete window.matchMedia;
      const { onClose } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
