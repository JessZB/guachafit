// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato D1 · CabeceraCartera.
 *
 * D1:
 * - La ceja dice "Cobros" y el h1 es exactamente "Control de cobros".
 * - El subtítulo es "Quién debe, quién está por vencer y a quién ya le recordaste."
 * - El enlace a /coach/conciliacion se llama "Pagos por validar".
 * - No existen "Cobranza y Cartera" ni "Bandeja de validación".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CabeceraCartera } from './CabeceraCartera';

afterEach(() => {
  cleanup();
});

describe('Contrato D1 · CabeceraCartera (UX-10)', () => {
  it('D1 · ceja "Cobros", h1 "Control de cobros", subtítulo exacto y enlace "Pagos por validar"', () => {
    render(
      <MemoryRouter>
        <CabeceraCartera />
      </MemoryRouter>
    );

    // Ceja
    expect(screen.getByText('Cobros')).toBeTruthy();

    // H1
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent?.trim()).toBe('Control de cobros');

    // Subtítulo
    expect(
      screen.getByText('Quién debe, quién está por vencer y a quién ya le recordaste.')
    ).toBeTruthy();

    // Enlace a conciliación
    const enlace = screen.getByRole('link', { name: /Pagos por validar/i });
    expect(enlace).toBeTruthy();
    expect(enlace.getAttribute('href')).toBe('/coach/conciliacion');

    // Literales viejos eliminados
    expect(screen.queryByText(/Cobranza y Cartera/i)).toBeNull();
    expect(screen.queryByText(/Bandeja de validación/i)).toBeNull();
  });
});
