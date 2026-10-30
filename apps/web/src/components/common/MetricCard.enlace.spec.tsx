// @vitest-environment jsdom
/**
 * UX-13 · MetricCard enlace opcional (Contrato K1–K3).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MetricCard } from './MetricCard';

describe('MetricCard · enlace (UX-13)', () => {
  afterEach(() => {
    cleanup();
  });

  it('K1 · Con enlace: produce un único enlace con href /coach/cartera cuyo nombre accesible contiene Cobros del mes', () => {
    render(
      <MemoryRouter>
        <MetricCard
          title="Cobros del mes"
          value="$1.900,00"
          enlace={{ to: '/coach/cartera' }}
        />
      </MemoryRouter>
    );

    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0].getAttribute('href')).toBe('/coach/cartera');
    expect(screen.getByRole('link', { name: /Cobros del mes/i })).toBeTruthy();
  });

  it('K2 · Sin enlace: no hay ningún enlace y ningún elemento tiene hover:border-primary en className', () => {
    const { container } = render(
      <MemoryRouter>
        <MetricCard title="Cobros del mes" value="$1.900,00" />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link')).toBeNull();
    const elementosHover = container.querySelectorAll('[class*="hover:border-primary"]');
    expect(elementosHover.length).toBe(0);
  });

  it('K3 · Badge intacto: con enlace y badge el texto del badge sigue visible', () => {
    render(
      <MemoryRouter>
        <MetricCard
          title="Cobros del mes"
          value="$1.900,00"
          enlace={{ to: '/coach/cartera' }}
          badge={{ text: 'Al día', variant: 'success' }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Al día')).toBeTruthy();
  });
});
