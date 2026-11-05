// @vitest-environment happy-dom
/**
 * 08 · FilaSerieEdicion · prop marcadoBloqueado (contrato D, fase roja).
 *
 * - pendiente + marcadoBloqueado -> botón deshabilitado y clic no llama onMarcar
 * - pendiente sin la prop -> habilitado y clic llama onMarcar
 * - completada + marcadoBloqueado -> habilitado y clic llama onMarcar (desmarcar no se bloquea)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { FilaSerieEdicion } from './FilaSerieEdicion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SERIE_PENDIENTE: SerieRegistroDetalleDTO = {
  id: 's-1',
  ejercicioSesionId: 'es-1',
  numeroSerie: 1,
  repsObjetivo: 10,
  repsLogradas: null,
  pesoKg: null,
  pesoPrescritoKg: '60.00',
  rpe: null,
  completada: false,
};

const SERIE_COMPLETADA: SerieRegistroDetalleDTO = {
  ...SERIE_PENDIENTE,
  id: 's-2',
  numeroSerie: 2,
  completada: true,
};

function montar(parciales: Partial<Parameters<typeof FilaSerieEdicion>[0]> = {}) {
  const onMarcar = vi.fn<() => void>();
  render(
    <FilaSerieEdicion
      serie={SERIE_PENDIENTE}
      unidadPeso="kg"
      soloLectura={false}
      pesoMostrado=""
      repsMostradas=""
      rpeMostrado=""
      pesoPrescritoKg="60.00"
      descansoRealSegundos={null}
      errorSerie={null}
      onCambiar={vi.fn()}
      onPaso={vi.fn()}
      onSalirPeso={vi.fn()}
      onSalirReps={vi.fn()}
      onSalirRpe={vi.fn()}
      onMarcar={onMarcar}
      onIniciar={vi.fn()}
      {...parciales}
    />
  );
  return { onMarcar };
}

describe('FilaSerieEdicion · marcadoBloqueado (contrato D)', () => {
  it('pendiente con marcadoBloqueado={true}: botón deshabilitado y clic no llama onMarcar', () => {
    const { onMarcar } = montar({
      serie: SERIE_PENDIENTE,
      marcadoBloqueado: true,
    });
    const boton = screen.getByRole('button', {
      name: 'Marcar serie 1 como completada',
    }) as HTMLButtonElement;

    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    expect(onMarcar).not.toHaveBeenCalled();
  });

  it('pendiente sin la prop: botón habilitado y clic llama onMarcar', () => {
    const { onMarcar } = montar({
      serie: SERIE_PENDIENTE,
    });
    const boton = screen.getByRole('button', {
      name: 'Marcar serie 1 como completada',
    }) as HTMLButtonElement;

    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(onMarcar).toHaveBeenCalledTimes(1);
  });

  it('completada con marcadoBloqueado={true}: botón habilitado y clic llama onMarcar', () => {
    const { onMarcar } = montar({
      serie: SERIE_COMPLETADA,
      marcadoBloqueado: true,
    });
    const boton = screen.getByRole('button', {
      name: 'Marcar serie 2 como pendiente',
    }) as HTMLButtonElement;

    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(onMarcar).toHaveBeenCalledTimes(1);
  });
});
