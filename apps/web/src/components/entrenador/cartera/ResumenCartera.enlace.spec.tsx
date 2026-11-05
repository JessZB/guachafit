// @vitest-environment happy-dom
/**
 * UX-13 · Validación: corrección R1 en ResumenCartera.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ResumenCarteraDTO } from '@guachafit/shared';
import { ResumenCartera } from './ResumenCartera';

afterEach(() => {
  cleanup();
});

function fixtureResumen(parcial: Partial<ResumenCarteraDTO> = {}): ResumenCarteraDTO {
  return {
    recaudadoMesUsd: '1900.00',
    totalEnMoraUsd: '120.00',
    alumnosEnMora: 2,
    proximosAVencer: 1,
    totalPorVencerUsd: '80.00',
    pagosPorValidar: 3,
    contadores: {
      mora: 2,
      porVencer: 1,
      revision: 3,
      alDia: 10,
    } as any,
    tasaVigente: null,
    ...parcial,
  };
}

describe('ResumenCartera · enlace (UX-13)', () => {
  it('R1 · Tarjeta enlazada', () => {
    render(
      <MemoryRouter>
        <ResumenCartera resumen={fixtureResumen()} />
      </MemoryRouter>
    );

    const enlaces = screen.getAllByRole('link', { name: /Pagos por validar/i });
    expect(enlaces).toHaveLength(1);

    const enlace = enlaces[0];
    expect(enlace.getAttribute('href')).toBe('/coach/conciliacion');
    expect(enlace.querySelector('a')).toBeNull();
    expect(enlace.className).toContain('hover:border-primary/40');
  });
});
