// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModalRutinaSemanal } from './alumno-detalle/ModalRutinaSemanal';
import { EditorMetasNutricion } from './panel-nutricion-alumno/EditorMetasNutricion';
import type { RetornoRutinaAlumno } from './alumno-detalle/use-rutina-alumno';

describe('Modales entrenador · escape animado', () => {
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

  describe('ModalRutinaSemanal', () => {
    const rutinaMinima: RetornoRutinaAlumno = {
      bloquesRutinaEdit: [],
      activeDiaIdx: 0,
      setActiveDiaIdx: vi.fn(),
      rutinaSuccessMsg: null,
      isSavingRutina: false,
      rutinaErrorMsg: null,
      confirmarBorradoRutina: null,
      setConfirmarBorradoRutina: vi.fn(),
      removerDiaRutina: vi.fn(),
      removerEjercicioDeDia: vi.fn(),
      guardarRutinaPrescrita: vi.fn(),
      anadirDiaRutina: vi.fn(),
      actualizarDiaRutina: vi.fn(),
      anadirEjercicioADia: vi.fn(),
      actualizarEjercicioDeDia: vi.fn(),
      reordenarEjerciciosDeDia: vi.fn(),
      limpiarAvisoExito: vi.fn(),
    } as unknown as RetornoRutinaAlumno;

    function renderizar(onCerrar = vi.fn(), onCerrarYLiberarExito = vi.fn()) {
      const props = {
        rutina: rutinaMinima,
        alumno: { id: 'alumno-1' },
        hayConexion: true,
        demo: false,
        onCerrar,
        onCerrarYLiberarExito,
      };
      // Contrato nuevo: sin pasar refDialogo
      const resultado = render(<ModalRutinaSemanal {...(props as any)} />);
      const dialog = screen.getByRole('dialog');
      const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
      return { ...resultado, dialog, fondo, onCerrar, onCerrarYLiberarExito };
    }

    it('con matchMedia matches:false: Escape deja el dialog montado con data-saliendo="true", llama a onCerrar ordinario (no onCerrarYLiberarExito) a los 150 ms', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { fondo, onCerrar, onCerrarYLiberarExito } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(fondo.getAttribute('data-saliendo')).toBe('true');
      expect(onCerrar).not.toHaveBeenCalled();
      expect(onCerrarYLiberarExito).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onCerrar).toHaveBeenCalledTimes(1);
      expect(onCerrarYLiberarExito).not.toHaveBeenCalled();
    });

    it('un segundo Escape durante la salida no duplica la llamada', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { onCerrar, onCerrarYLiberarExito } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onCerrar).toHaveBeenCalledTimes(1);
      expect(onCerrarYLiberarExito).not.toHaveBeenCalled();
    });

    it('sin matchMedia: Escape llama a onCerrar de forma síncrona', () => {
      // @ts-expect-error Asegura ausencia de matchMedia
      delete window.matchMedia;
      const { onCerrar, onCerrarYLiberarExito } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCerrar).toHaveBeenCalledTimes(1);
      expect(onCerrarYLiberarExito).not.toHaveBeenCalled();
    });
  });

  describe('EditorMetasNutricion', () => {
    function renderizar(onCerrar = vi.fn()) {
      const props = {
        calorias: '2000',
        proteina: '150',
        carbohidratos: '200',
        grasas: '60',
        agua: '2.5',
        onCambiarCalorias: vi.fn(),
        onCambiarProteina: vi.fn(),
        onCambiarCarbohidratos: vi.fn(),
        onCambiarGrasas: vi.fn(),
        onCambiarAgua: vi.fn(),
        recursos: [],
        onAnadirRecurso: vi.fn(),
        onCambiarRecurso: vi.fn(),
        onQuitarRecurso: vi.fn(),
        onSubirPdf: vi.fn(),
        error: null,
        exito: null,
        guardando: false,
        onCerrar,
        onGuardar: vi.fn(),
      };
      // Contrato nuevo: sin pasar dialogoRef
      const resultado = render(<EditorMetasNutricion {...(props as any)} />);
      const dialog = screen.getByRole('dialog');
      const fondo = dialog.closest('.fixed.inset-0') as HTMLElement;
      return { ...resultado, dialog, fondo, onCerrar };
    }

    it('con matchMedia matches:false: Escape deja el dialog con data-saliendo="true" y llama a onCerrar a los 150 ms', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { fondo, onCerrar } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(fondo.getAttribute('data-saliendo')).toBe('true');
      expect(onCerrar).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onCerrar).toHaveBeenCalledTimes(1);
    });

    it('un segundo Escape durante la salida no duplica la llamada', () => {
      vi.useFakeTimers();
      configurarMatchMedia(false);
      const { onCerrar } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onCerrar).toHaveBeenCalledTimes(1);
    });

    it('sin matchMedia: Escape llama a onCerrar síncrono', () => {
      // @ts-expect-error Asegura ausencia de matchMedia
      delete window.matchMedia;
      const { onCerrar } = renderizar();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCerrar).toHaveBeenCalledTimes(1);
    });
  });
});
