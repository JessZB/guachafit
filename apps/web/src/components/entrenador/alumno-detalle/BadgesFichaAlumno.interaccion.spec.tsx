// @vitest-environment jsdom
/**
 * Lote 01 (ficha del alumno) · L2.1 — badges de pago y activación.
 *
 * Fase roja: fija el contrato de los badges de la cabecera antes de tocar producción.
 * - Conservan sus textos actuales (mismos valores, mismo fallback "Sin dato").
 * - El elemento que porta el texto no se parte ni se encoge dentro de un flex
 *   (`whitespace-nowrap` + `shrink-0`), ahora que se apoyan en `ui/BadgeEstado`.
 * - El punto animado del moroso es decorativo (`aria-hidden`) y respeta
 *   `prefers-reduced-motion` (`motion-reduce:animate-none`).
 *
 * jsdom no calcula layout: las clases Tailwind se comprueban como tokens literales del
 * `className`, nunca por tamaño o posición real. `getByText` devuelve el nodo que contiene
 * el texto directo, no un ancestro, por eso las clases se buscan en el propio nodo o en un
 * ancestro que también contenga ese texto.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EstadoAlumno } from '@guachafit/shared';
import { BadgeEstadoPagoAlumno } from './BadgeEstadoPagoAlumno';
import { BadgeEstadoActivacionAlumno } from './BadgeEstadoActivacionAlumno';

afterEach(() => {
  cleanup();
});

/** Clases Tailwind del nodo, comparadas como tokens (evita que `flex` coincida con `flex-wrap`). */
function tokens(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

/** Ancestro (incluido el propio nodo) que contiene el texto y declara TODAS las clases. */
function ancestroConClases(elemento: Element, clases: string[]): Element | null {
  let actual: Element | null = elemento;
  while (actual) {
    const propias = tokens(actual);
    if (clases.every((clase) => propias.includes(clase))) return actual;
    actual = actual.parentElement;
  }
  return null;
}

describe('BadgeEstadoPagoAlumno · L2.1', () => {
  it('conserva los textos actuales de cada semáforo', () => {
    const casos = [
      ['al_dia', 'Al día'],
      ['por_vencer', 'Por vencer'],
      ['moroso', 'Cuota pendiente'],
      ['sin_cuota', 'Sin cuota emitida'],
      [null, 'Sin dato'],
    ] as const;

    for (const [semaforo, texto] of casos) {
      const { unmount } = render(<BadgeEstadoPagoAlumno semaforo={semaforo} />);
      expect(screen.getByText(texto)).toBeTruthy();
      unmount();
    }
  });

  it('el texto del badge no se parte ni se encoge dentro de un flex', () => {
    render(<BadgeEstadoPagoAlumno semaforo="moroso" />);

    const texto = screen.getByText('Cuota pendiente');
    const badge = ancestroConClases(texto, ['whitespace-nowrap', 'shrink-0']);

    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('Cuota pendiente');
  });

  it('el punto del moroso es decorativo y respeta prefers-reduced-motion', () => {
    const { container } = render(<BadgeEstadoPagoAlumno semaforo="moroso" />);

    const punto = container.querySelector('span[aria-hidden="true"]');
    expect(punto).not.toBeNull();
    expect(tokens(punto!)).toContain('motion-reduce:animate-none');
    expect(tokens(punto!)).toContain('animate-pulse');
  });
});

describe('BadgeEstadoActivacionAlumno · L2.1', () => {
  it('conserva los textos actuales de cada estado y el override de archivado', () => {
    const casos = [
      [{ estadoActivacion: EstadoAlumno.ACTIVO, archivado: false }, 'Activo'],
      [{ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO, archivado: false }, 'Pausado'],
      [{ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO, archivado: false }, 'Suspendido por pago'],
      [{ estadoActivacion: EstadoAlumno.ACTIVO, archivado: true }, 'Archivado'],
    ] as const;

    for (const [props, texto] of casos) {
      const { unmount } = render(<BadgeEstadoActivacionAlumno {...props} />);
      expect(screen.getByText(texto)).toBeTruthy();
      unmount();
    }
  });

  it('el texto del badge no se parte ni se encoge dentro de un flex', () => {
    render(
      <BadgeEstadoActivacionAlumno estadoActivacion={EstadoAlumno.ACTIVO} archivado={false} />
    );

    const texto = screen.getByText('Activo');
    const badge = ancestroConClases(texto, ['whitespace-nowrap', 'shrink-0']);

    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('Activo');
  });
});
