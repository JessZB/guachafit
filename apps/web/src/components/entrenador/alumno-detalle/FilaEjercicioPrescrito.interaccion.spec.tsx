// @vitest-environment happy-dom
/**
 * Lote 01 (ficha del alumno) · L2.2 y L2.4 — fila de ejercicio prescrito (lectura).
 *
 * Fase roja: fija el contrato antes de tocar producción.
 * - L2.2: los chips de series/reps, peso, RPE y descanso comparten un contenedor directo
 *   con `flex-wrap`, para que bajen de línea en pantallas estrechas.
 * - L2.4: el descanso deja de usar el emoji "⏱️" y pasa a un icono SVG decorativo
 *   (`aria-hidden="true"`), conservando el tiempo visible.
 *
 * jsdom no calcula layout: las clases se comprueban como tokens literales del `className`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { FilaEjercicioPrescrito } from './FilaEjercicioPrescrito';

type EjercicioPrescrito = BloqueDiaRutinaDTO['ejercicios'][number];

afterEach(() => {
  cleanup();
});

/** Clases Tailwind del nodo, comparadas como tokens (evita que `flex` coincida con `flex-wrap`). */
function tokens(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function ejercicio(parcial: Partial<EjercicioPrescrito> = {}): EjercicioPrescrito {
  return {
    id: 'ej-1',
    ejercicioId: '00000000-0000-4000-8000-000000000001',
    nombre: 'Sentadilla',
    series: 4,
    reps: '8-10',
    peso: '60 kg',
    rpe: '8',
    descansoSegundos: 90,
    notas: '',
    ...parcial,
  };
}

describe('FilaEjercicioPrescrito · L2.2 wrap', () => {
  it('los chips de prescripción comparten un contenedor directo con flex-wrap', () => {
    render(<FilaEjercicioPrescrito ejercicio={ejercicio()} indice={0} />);

    const chipSeries = screen.getByText('4 series × 8-10');
    const contenedor = chipSeries.parentElement;

    expect(contenedor).not.toBeNull();
    expect(tokens(contenedor!)).toContain('flex-wrap');
    expect(contenedor!.textContent).toContain('60 kg');
    expect(contenedor!.textContent).toContain('RPE 8');
    expect(contenedor!.textContent).toContain('1 min 30 s');
  });
});

describe('FilaEjercicioPrescrito · L2.4 descanso sin emoji', () => {
  it('conserva la prescripción visible (series × reps, peso, RPE y descanso)', () => {
    render(<FilaEjercicioPrescrito ejercicio={ejercicio()} indice={0} />);

    expect(screen.getByText('4 series × 8-10')).toBeTruthy();
    expect(screen.getByText('60 kg')).toBeTruthy();
    expect(screen.getByText('RPE 8')).toBeTruthy();
    expect(screen.getByText(/1 min 30 s/)).toBeTruthy();
  });

  it('ya no renderiza el carácter de reloj como texto', () => {
    const { container } = render(
      <FilaEjercicioPrescrito ejercicio={ejercicio()} indice={0} />
    );

    // U+23F1 (con o sin selector de variación) ya no debe formar parte del texto visible.
    expect(container.textContent).not.toContain('⏱');
  });

  it('usa un icono SVG decorativo junto al tiempo de descanso', () => {
    const { container } = render(
      <FilaEjercicioPrescrito ejercicio={ejercicio()} indice={0} />
    );

    const icono = container.querySelector('svg[aria-hidden="true"]');
    expect(icono).not.toBeNull();

    // El SVG es el del chip de descanso: su contenedor más cercano muestra el tiempo.
    let contenedorDescanso: Element | null = icono;
    while (contenedorDescanso && !(contenedorDescanso.textContent ?? '').includes('1 min 30 s')) {
      contenedorDescanso = contenedorDescanso.parentElement;
    }
    expect(contenedorDescanso).not.toBeNull();
  });
});
