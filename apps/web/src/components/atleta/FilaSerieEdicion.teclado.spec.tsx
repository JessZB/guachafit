// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { FilaSerieEdicion } from './FilaSerieEdicion';

const SERIE_BASE: SerieRegistroDetalleDTO = {
  id: 's-1',
  ejercicioSesionId: 'es-1',
  numeroSerie: 1,
  repsObjetivo: 10,
  repsLogradas: 10,
  pesoKg: '80',
  pesoPrescritoKg: '80.00',
  rpe: '8',
  completada: false,
};

function montar(propsParciales = {}) {
  const handlers = {
    onCambiar: vi.fn(),
    onPaso: vi.fn(),
    onSalirPeso: vi.fn(),
    onSalirReps: vi.fn(),
    onSalirRpe: vi.fn(),
    onMarcar: vi.fn(),
    onIniciar: vi.fn(),
  };

  const resultado = render(
    <FilaSerieEdicion
      serie={SERIE_BASE}
      unidadPeso="kg"
      soloLectura={false}
      pesoMostrado="80"
      repsMostradas="10"
      rpeMostrado="8"
      pesoPrescritoKg="80.00"
      descansoRealSegundos={null}
      errorSerie={null}
      {...handlers}
      {...propsParciales}
    />
  );

  const inputPeso = screen.getByLabelText(/^Peso real/i) as HTMLInputElement;
  const inputReps = screen.getByLabelText(/^Repeticiones hechas/i) as HTMLInputElement;
  const inputRpe = screen.getByLabelText(/^Esfuerzo de 1 a 10/i) as HTMLInputElement;

  return {
    ...resultado,
    inputPeso,
    inputReps,
    inputRpe,
    ...handlers,
  };
}

describe('FilaSerieEdicion · teclado móvil y auto-selección (contrato F)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('F1: enterkeyhint en los inputs de edición', () => {
    it('input de peso tiene enterkeyhint="next"', () => {
      const { inputPeso } = montar();
      expect(inputPeso.getAttribute('enterkeyhint')).toBe('next');
    });

    it('input de repeticiones tiene enterkeyhint="next"', () => {
      const { inputReps } = montar();
      expect(inputReps.getAttribute('enterkeyhint')).toBe('next');
    });

    it('input de esfuerzo tiene enterkeyhint="done"', () => {
      const { inputRpe } = montar();
      expect(inputRpe.getAttribute('enterkeyhint')).toBe('done');
    });
  });

  describe('F2: auto-selección de texto en focus al tener valor', () => {
    it('al hacer focus en el input de peso con valor se llama a select()', () => {
      const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');
      const { inputPeso } = montar({ pesoMostrado: '80' });

      fireEvent.focus(inputPeso);

      expect(selectSpy).toHaveBeenCalled();
    });

    it('al hacer focus en el input de repeticiones con valor se llama a select()', () => {
      const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');
      const { inputReps } = montar({ repsMostradas: '10' });

      fireEvent.focus(inputReps);

      expect(selectSpy).toHaveBeenCalled();
    });

    it('al hacer focus en el input de esfuerzo con valor se llama a select()', () => {
      const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');
      const { inputRpe } = montar({ rpeMostrado: '8' });

      fireEvent.focus(inputRpe);

      expect(selectSpy).toHaveBeenCalled();
    });
  });
});
