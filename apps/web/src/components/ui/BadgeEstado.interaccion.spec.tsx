// @vitest-environment happy-dom
/**
 * Prompt 48 (fase C): spec de interacción del átomo `BadgeEstado`.
 *
 * Consolida `TablaCartera.tsx:64-70`, `DetalleSesionEntrenamiento.tsx:55-61`,
 * `ProgresoPage.tsx:62-69`, `AlumnoDetallePage.tsx:173-179` y
 * `TablaEntrenadoresAdmin.tsx:46-47`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { TonoSemaforo } from '../../lib/adherencia';
import { BadgeEstado } from './BadgeEstado';

afterEach(() => {
  cleanup();
});

describe('BadgeEstado', () => {
  it('muestra el texto con las clases del tono success', () => {
    render(<BadgeEstado tono="success">Al día</BadgeEstado>);

    const badge = screen.getByText('Al día');
    expect(badge.getAttribute('class')).toContain('bg-success/15');
    expect(badge.getAttribute('class')).toContain('text-[11px]');
  });

  it('aplica el ternario danger con el token danger', () => {
    render(<BadgeEstado tono="danger">Vencida</BadgeEstado>);

    const badge = screen.getByText('Vencida');
    expect(badge.getAttribute('class')).toContain('bg-danger/15');
    expect(badge.getAttribute('class')).toContain('text-danger');
  });

  it('un tono desconocido cae en neutral en vez de romper clases', () => {
    render(<BadgeEstado tono={'inexistente' as TonoSemaforo}>Sin dato</BadgeEstado>);

    const badge = screen.getByText('Sin dato');
    expect(badge.getAttribute('class')).toContain('bg-secondary');
    expect(badge.getAttribute('class')).toContain('text-muted-foreground');
  });

  it.each(['success', 'warning', 'danger', 'info', 'neutral'] as const)(
    'B1 · la raíz no se parte ni se encoge en flex (tono %s)',
    (tono) => {
      render(<BadgeEstado tono={tono}>Cuota pendiente</BadgeEstado>);

      const badge = screen.getByText('Cuota pendiente');
      expect(badge.getAttribute('class')).toContain('whitespace-nowrap');
      expect(badge.getAttribute('class')).toContain('shrink-0');
    },
  );

  it('B2 · las clases de className se añaden sin sustituir las del tono', () => {
    render(
      <BadgeEstado tono="info" className="ml-2">
        Extra
      </BadgeEstado>,
    );

    const badge = screen.getByText('Extra');
    expect(badge.getAttribute('class')).toContain('bg-primary/15');
    expect(badge.getAttribute('class')).toContain('ml-2');
  });
});
