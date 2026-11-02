// @vitest-environment jsdom
/**
 * UX-25 (Fase Roja / TDD) · Contratos de accesibilidad táctil y visualización para FilaSerieEdicion:
 * - ENT-07: Área táctil mínima w-11 en steppers de peso (sin clases sm:w-9 que encojan en desktop)
 * - ENT-07: Área táctil mínima w-11 en steppers de repeticiones (sin clases sm:w-8)
 * - ENT-08: Prescripción planificada no truncada (sin clase truncate, permite break-words)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { FilaSerieEdicion } from './FilaSerieEdicion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SERIE_BASE: SerieRegistroDetalleDTO = {
  id: 's-ux25-1',
  ejercicioSesionId: 'es-1',
  numeroSerie: 1,
  repsObjetivo: 10,
  repsLogradas: null,
  pesoKg: null,
  pesoPrescritoKg: '60.00',
  rpe: null,
  completada: false,
};

function montar(parciales: Partial<Parameters<typeof FilaSerieEdicion>[0]> = {}) {
  const handlers = {
    onCambiar: vi.fn(),
    onPaso: vi.fn(),
    onSalirPeso: vi.fn(),
    onSalirReps: vi.fn(),
    onSalirRpe: vi.fn(),
    onMarcar: vi.fn(),
    onIniciar: vi.fn(),
  };

  render(
    <FilaSerieEdicion
      serie={SERIE_BASE}
      unidadPeso="kg"
      soloLectura={false}
      pesoMostrado="60"
      repsMostradas="10"
      rpeMostrado="8"
      pesoPrescritoKg="60.00"
      descansoRealSegundos={null}
      errorSerie={null}
      {...handlers}
      {...parciales}
    />
  );

  return handlers;
}

describe('FilaSerieEdicion · UX-25 Fase Roja', () => {
  it('ENT-07: steppers de peso mantienen ancho táctil w-11 y no se encogen a sm:w-9', () => {
    montar();

    const btnRestar = screen.getByRole('button', { name: /Restar 2\.5 kg/i });
    const btnSumar = screen.getByRole('button', { name: /Sumar 2\.5 kg/i });

    expect(btnRestar.className).toContain('w-11');
    expect(btnRestar.className).not.toContain('sm:w-9');

    expect(btnSumar.className).toContain('w-11');
    expect(btnSumar.className).not.toContain('sm:w-9');
  });

  it('ENT-07: steppers de repeticiones mantienen ancho táctil w-11 y no se encogen a sm:w-8', () => {
    montar();

    const btnRestar = screen.getByRole('button', { name: /Restar 1 repetición/i });
    const btnSumar = screen.getByRole('button', { name: /Sumar 1 repetición/i });

    expect(btnRestar.className).toContain('w-11');
    expect(btnRestar.className).not.toContain('sm:w-8');

    expect(btnSumar.className).toContain('w-11');
    expect(btnSumar.className).not.toContain('sm:w-8');
  });

  it('ENT-08: la prescripción planificada no tiene clase truncate y permite break-words', () => {
    montar({ pesoPrescritoKg: '60.00' });

    const elPlan = screen.getByText(/^Plan: 60 kg/i);
    expect(elPlan).toBeTruthy();
    expect(elPlan.className).not.toContain('truncate');
    expect(elPlan.className).toContain('break-words');
  });
});
