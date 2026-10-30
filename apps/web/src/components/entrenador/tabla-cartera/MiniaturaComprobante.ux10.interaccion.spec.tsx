// @vitest-environment jsdom
/**
 * 05 · UX-10 · R4 · MiniaturaComprobante con url={null}.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MiniaturaComprobante } from './MiniaturaComprobante';

afterEach(() => {
  cleanup();
});

describe('R4 · MiniaturaComprobante (UX-10)', () => {
  it('con url={null} muestra "Sin captura digital" y no pinta img', () => {
    const { container } = render(
      <MiniaturaComprobante url={null} alumnoNombre="Carlos Mendoza" />
    );

    expect(screen.getByText('Sin captura digital')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
