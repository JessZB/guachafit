// @vitest-environment happy-dom
/**
 * UX-25 (Fase Roja / TDD) · Contratos de interacción y accesibilidad para ChipsBloquesSemana:
 * - ENT-04: "Hoy" en bloque sugerido real vs "Consultando" en bloque activo diferente
 * - ENT-04: Eliminación del check '✓' duplicado en bloques completados
 * - ENT-05: Fecha visible en bloques pendientes
 * - ENT-05: Atributo semántico aria-current="true" en chip seleccionado
 * - ENT-05: Disposición flexible (flex-wrap) en el contenedor de chips
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SemanaEntrenamientoProgresoDTO } from '@guachafit/shared';
import { ChipsBloquesSemana } from './ChipsBloquesSemana';
import { formatFechaCalendario } from '../../../lib/date-format';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SEMANA_BASE: SemanaEntrenamientoProgresoDTO = {
  semanaIso: '2026-W42',
  inicioSemana: '2026-10-12',
  finSemana: '2026-10-18',
  totalBloques: 2,
  bloquesCompletados: 0,
  porcentajeCumplimiento: '0%',
  esDiaDescansoHoy: false,
  rachaDias: 3,
  bloques: [
    {
      bloqueId: 'b-1',
      titulo: 'Bloque 1: Fuerza',
      totalEjercicios: 4,
      completado: false,
      esSugeridoHoy: true,
      fechaProgramada: '2026-10-15',
    },
    {
      bloqueId: 'b-2',
      titulo: 'Bloque 2: Hipertrofia',
      totalEjercicios: 3,
      completado: false,
      esSugeridoHoy: false,
      fechaProgramada: '2026-10-16',
    },
  ],
};

describe('ChipsBloquesSemana · UX-25 Fase Roja', () => {
  it('ENT-04: el bloque sugerido conserva "Hoy" y el bloque activo consultado no dice "Hoy"', () => {
    // Al consultar un bloque activo diferente (b-2), el bloque que realmente es sugerido hoy (b-1)
    // debe mantener la indicación visible "Hoy", mientras que el bloque activo (b-2) NO debe decir "Hoy".
    render(
      <ChipsBloquesSemana
        semanaProgreso={SEMANA_BASE}
        bloqueActivoId="b-2"
        deshabilitado={false}
        onSelect={vi.fn()}
      />
    );

    const botonB1 = screen.getByRole('button', { name: /Bloque 1/i });
    const botonB2 = screen.getByRole('button', { name: /Bloque 2/i });

    expect(botonB1.textContent).toContain('Hoy');
    expect(botonB2.textContent).not.toContain('Hoy');
    expect(
      botonB2.getAttribute('aria-current') === 'true' ||
        botonB2.textContent?.includes('Consultando')
    ).toBe(true);
  });

  it('ENT-04: un bloque completado no muestra el carácter duplicado "✓" en su texto', () => {
    const semanaConCompletado: SemanaEntrenamientoProgresoDTO = {
      ...SEMANA_BASE,
      bloques: [
        {
          bloqueId: 'b-comp',
          titulo: 'Bloque 1: Pecho',
          totalEjercicios: 4,
          completado: true,
          fechaCompletadaUtc: '2026-10-15T14:30:00.000Z',
        },
      ],
    };

    render(
      <ChipsBloquesSemana
        semanaProgreso={semanaConCompletado}
        bloqueActivoId={null}
        deshabilitado={false}
        onSelect={vi.fn()}
      />
    );

    const boton = screen.getByRole('button', { name: /Bloque 1/i });
    expect(boton.textContent).not.toContain('✓');
  });

  it('ENT-05: renderiza la fecha visible en el DOM para bloques pendientes', () => {
    render(
      <ChipsBloquesSemana
        semanaProgreso={SEMANA_BASE}
        bloqueActivoId={null}
        deshabilitado={false}
        onSelect={vi.fn()}
      />
    );

    const fechaEsperada = formatFechaCalendario('2026-10-15');
    expect(fechaEsperada).toBeTruthy();

    const botonB1 = screen.getByRole('button', { name: /Bloque 1/i });
    expect(botonB1.textContent).toContain(fechaEsperada!);
  });

  it('ENT-05: asigna atributo semántico aria-current="true" únicamente al chip seleccionado', () => {
    render(
      <ChipsBloquesSemana
        semanaProgreso={SEMANA_BASE}
        bloqueActivoId="b-2"
        deshabilitado={false}
        onSelect={vi.fn()}
      />
    );

    const botonB1 = screen.getByRole('button', { name: /Bloque 1/i });
    const botonB2 = screen.getByRole('button', { name: /Bloque 2/i });

    expect(botonB2.getAttribute('aria-current')).toBe('true');
    expect(botonB1.getAttribute('aria-current')).toBeNull();
  });

  it('ENT-05: el contenedor del grupo de chips cuenta con role="group" y clase flex-wrap', () => {
    render(
      <ChipsBloquesSemana
        semanaProgreso={SEMANA_BASE}
        bloqueActivoId={null}
        deshabilitado={false}
        onSelect={vi.fn()}
      />
    );

    const grupo = screen.getByRole('group', { name: /entrenamientos de la semana/i });
    expect(grupo).toBeTruthy();
    expect(grupo.className).toContain('flex-wrap');
  });
});
