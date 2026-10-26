// @vitest-environment jsdom
/**
 * Lote 01 (ficha del alumno) · L2.6 y L2.7 — métricas de la ficha.
 *
 * Fase roja: fija el contrato antes de tocar producción.
 * - L2.6 (`MetricasAntropometricas`): "Brazo" y "Pecho" son dos métricas separadas, cada
 *   una con su propia etiqueta y su propio valor; la cuadrícula es de una columna por
 *   debajo de 420px (`grid-cols-1`) y de dos a partir de 420px (`min-[420px]:grid-cols-2`).
 * - L2.7 (`MetricasFinancierasAlumno`): el punto de color es decorativo (sin `title` y con
 *   `aria-hidden`), y el significado del saldo sigue disponible en texto.
 *
 * jsdom no calcula layout: las clases se comprueban como tokens literales.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import type { ControlAntroFila } from '../../../lib/alumno-detalle-controles';
import { MetricasAntropometricas } from './MetricasAntropometricas';
import { MetricasFinancierasAlumno } from './MetricasFinancierasAlumno';

afterEach(() => {
  cleanup();
});

/** Clases Tailwind del nodo, comparadas como tokens (evita que `grid` coincida con `grid-cols-1`). */
function tokens(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function control(parcial: Partial<ControlAntroFila> = {}): ControlAntroFila {
  return {
    id: 'antro-1',
    fecha: '2026-09-01',
    pesoKg: '78.50',
    grasaPorcentaje: '16.2',
    cinturaCm: '82.0',
    brazoCm: '37.5',
    pechoCm: '102.0',
    musloCm: '58.0',
    ...parcial,
  };
}

function resumenFinanciero(
  parcial: Partial<ResumenFinancieroAlumnoDTO> = {}
): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'al-1',
    usuarioId: 'u-1',
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '120.00',
    totalPagadoMesActualUsd: '20.00',
    cuotaMesActual: null,
    transaccionesTotal: 0,
    transacciones: [],
    ...parcial,
  };
}

describe('MetricasAntropometricas · L2.6', () => {
  it('Brazo y Pecho son métricas separadas con su propia etiqueta y valor', () => {
    render(<MetricasAntropometricas controles={[control()]} />);

    const etiquetaBrazo = screen.getByText('Brazo');
    const etiquetaPecho = screen.getByText('Pecho');

    expect(etiquetaBrazo).not.toBe(etiquetaPecho);

    const tarjetaBrazo = etiquetaBrazo.parentElement;
    const tarjetaPecho = etiquetaPecho.parentElement;

    expect(tarjetaBrazo).not.toBeNull();
    expect(tarjetaPecho).not.toBeNull();
    expect(tarjetaBrazo).not.toBe(tarjetaPecho);

    expect(tarjetaBrazo!.textContent).toContain('37.5');
    expect(tarjetaBrazo!.textContent).not.toContain('102.0');
    expect(tarjetaPecho!.textContent).toContain('102.0');
    expect(tarjetaPecho!.textContent).not.toContain('37.5');
  });

  it('la cuadrícula es de una columna por debajo de 420px y de dos a partir de 420px', () => {
    const { container } = render(<MetricasAntropometricas controles={[control()]} />);

    const cuadricula = container.firstElementChild;
    expect(cuadricula).not.toBeNull();

    const clases = tokens(cuadricula!);
    expect(clases).toContain('grid-cols-1');
    expect(clases).toContain('min-[420px]:grid-cols-2');
    // Una base de dos columnas anularía el contrato móvil de una sola columna.
    expect(clases).not.toContain('grid-cols-2');
  });
});

describe('MetricasFinancierasAlumno · L2.7', () => {
  it('el punto de color es decorativo: sin title y con aria-hidden', () => {
    const { container } = render(<MetricasFinancierasAlumno finanzas={resumenFinanciero()} />);

    expect(container.querySelector('[title]')).toBeNull();

    const punto = container.querySelector('span[aria-hidden="true"]');
    expect(punto).not.toBeNull();
    expect(tokens(punto!)).toContain('rounded-full');
  });

  it('el significado del saldo sigue disponible en texto, no solo en color', () => {
    const { unmount } = render(<MetricasFinancierasAlumno finanzas={resumenFinanciero()} />);
    expect(screen.getByText('Cuota pendiente de liquidar')).toBeTruthy();
    unmount();

    render(
      <MetricasFinancierasAlumno
        finanzas={resumenFinanciero({ saldoPendienteTotalUsd: '0.00' })}
      />
    );
    expect(screen.getByText('Sin deudas activas')).toBeTruthy();
  });

  it('sin resumen no inventa cifras ni motivos', () => {
    render(<MetricasFinancierasAlumno finanzas={null} />);

    expect(screen.getByText('Dato no disponible')).toBeTruthy();
  });
});
