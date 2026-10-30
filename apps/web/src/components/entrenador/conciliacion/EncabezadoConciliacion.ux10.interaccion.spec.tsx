// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato A1 · EncabezadoConciliacion.
 *
 * A1: La ceja dice "Cobros", el h1 es exactamente "Pagos por validar",
 *     y el contador "N transacciones en cola" se ve una sola vez en la página.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EncabezadoConciliacion } from './EncabezadoConciliacion';

afterEach(() => {
  cleanup();
});

describe('Contrato A1 · EncabezadoConciliacion (UX-10)', () => {
  it('A1 · la ceja dice "Cobros", el h1 es "Pagos por validar" y el contador aparece una sola vez', () => {
    render(<EncabezadoConciliacion total={3} />);

    // Ceja / eyebrow dice exactamente "Cobros"
    const ceja = screen.getByText('Cobros');
    expect(ceja).toBeTruthy();
    expect(screen.queryByText(/Pagos y Cobros/i)).toBeNull();

    // h1 es exactamente "Pagos por validar"
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent?.trim()).toBe('Pagos por validar');

    // Contador aparece una sola vez
    const contadores = screen.getAllByText('3 transacciones en cola');
    expect(contadores).toHaveLength(1);
  });
});
