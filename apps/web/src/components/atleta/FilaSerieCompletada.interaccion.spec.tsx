// @vitest-environment jsdom
/**
 * Lote E4 (RF-001) · contrato C3: fila compacta de una serie completada.
 *
 * Fase roja: el componente `./FilaSerieCompletada` aún no existe. El spec fija el contrato:
 * un botón cuyo nombre accesible contiene el texto de la serie completada y la palabra
 * "corregir" (para corregirla o desmarcarla), clic → `onCorregir` una vez, y área táctil
 * `min-h-11` sin etiquetas tipográficas de 10/11 px.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { FilaSerieCompletada } from './FilaSerieCompletada';

const SERIE: SerieRegistroDetalleDTO = {
  id: 's-2',
  ejercicioSesionId: 'es-1',
  numeroSerie: 2,
  repsObjetivo: 10,
  repsLogradas: 10,
  pesoKg: '60.00',
  pesoPrescritoKg: '60.00',
  rpe: '8',
  descansoSegundos: 90,
  completada: true,
  timestampCompletadaUtc: '2026-10-11T10:00:00.000Z',
};

const TEXTO_SERIE = 'Serie 2 · 60 kg × 10 · Esfuerzo 8';

/** Botón de la fila: nombre accesible con el texto de la serie y "corregir" (sin distinguir mayúsculas). */
function botonDeLaFila(): HTMLElement {
  return screen.getByRole('button', {
    name: (nombre) => nombre.includes(TEXTO_SERIE) && /corregir/i.test(nombre),
  });
}

afterEach(() => {
  cleanup();
});

describe('FilaSerieCompletada · fila compacta (C3)', () => {
  it('tiene un botón cuyo nombre contiene el texto de la serie y la palabra "corregir"', () => {
    render(<FilaSerieCompletada serie={SERIE} unidadPeso="kg" onCorregir={vi.fn()} />);

    expect(botonDeLaFila()).toBeTruthy();
  });

  it('al hacer clic llama a onCorregir una vez', () => {
    const onCorregir = vi.fn();
    render(<FilaSerieCompletada serie={SERIE} unidadPeso="kg" onCorregir={onCorregir} />);

    fireEvent.click(botonDeLaFila());

    expect(onCorregir).toHaveBeenCalledTimes(1);
  });

  it('el botón tiene min-h-11 y no usa text-[11px] ni text-[10px]', () => {
    render(<FilaSerieCompletada serie={SERIE} unidadPeso="kg" onCorregir={vi.fn()} />);

    const boton = botonDeLaFila();

    expect(boton.className).toContain('min-h-11');
    expect(boton.className).not.toContain('text-[11px]');
    expect(boton.className).not.toContain('text-[10px]');
  });
});
