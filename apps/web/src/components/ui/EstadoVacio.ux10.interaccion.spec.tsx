// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato A4 · Jerarquía de títulos (EstadoVacio, EstadoError, BandejaVaciaConciliacion, SinResultadosConciliacion).
 *
 * A4: ui/EstadoVacio y ui/EstadoError aceptan nivelTitulo?: 2 | 3, con 3 por defecto. Con 2, el título es un h2.
 *     Sin la prop, EstadoVacio sigue pintando h3.
 *     BandejaVaciaConciliacion y SinResultadosConciliacion pintan su título como h2.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstadoVacio } from './EstadoVacio';
import { EstadoError } from './EstadoError';
import { BandejaVaciaConciliacion } from '../entrenador/conciliacion/BandejaVaciaConciliacion';
import { SinResultadosConciliacion } from '../entrenador/conciliacion/SinResultadosConciliacion';

afterEach(() => {
  cleanup();
});

describe('Contrato A4 · Jerarquía de títulos (UX-10)', () => {
  it('A4 · sin la prop, EstadoVacio pinta su título como h3', () => {
    render(<EstadoVacio titulo="Título por defecto" />);
    const heading = screen.getByRole('heading', { level: 3, name: 'Título por defecto' });
    expect(heading).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('A4 · con nivelTitulo={2}, EstadoVacio pinta su título como h2', () => {
    // Se castea como any si la prop aún no está en el tipo TypeScript de producción
    render(<EstadoVacio titulo="Título nivel dos" {...({ nivelTitulo: 2 } as any)} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Título nivel dos' });
    expect(heading).toBeTruthy();
  });

  it('A4 · con nivelTitulo={2}, EstadoError pinta su título como h2', () => {
    render(
      <EstadoError
        onReintentar={vi.fn()}
        titulo="Error nivel dos"
        {...({ nivelTitulo: 2 } as any)}
      />
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Error nivel dos' });
    expect(heading).toBeTruthy();
  });

  it('A4 · BandejaVaciaConciliacion pinta su título como h2', () => {
    render(
      <MemoryRouter>
        <BandejaVaciaConciliacion />
      </MemoryRouter>
    );
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeTruthy();
  });

  it('A4 · SinResultadosConciliacion pinta su título como h2', () => {
    render(<SinResultadosConciliacion onLimpiar={vi.fn()} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Sin resultados' });
    expect(heading).toBeTruthy();
  });
});
