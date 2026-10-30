// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato E3 · SaldoBsCartera sin tasa.
 *
 * E3:
 * - El "—" lleva aria-hidden="true".
 * - Hay un texto sr-only que contiene "Configura tu tasa en Ajustes".
 * - El span ya no tiene atributo title.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FilaCarteraDTO } from '@guachafit/shared';
import { SaldoBsCartera } from './SaldoBsCartera';

afterEach(() => {
  cleanup();
});

describe('Contrato E3 · SaldoBsCartera (UX-10)', () => {
  it('E3 · guion con aria-hidden="true", texto sr-only accesible y sin atributo title', () => {
    const fila = { saldoPendienteBs: null } as unknown as FilaCarteraDTO;
    const { container } = render(<SaldoBsCartera fila={fila} />);

    // El span o texto con el guion largo "—"
    const emDash = screen.getByText('—');
    expect(emDash.getAttribute('aria-hidden')).toBe('true');
    expect(emDash.getAttribute('title')).toBeNull();

    // Ningún span tiene atributo title
    const conTitle = container.querySelectorAll('[title]');
    expect(conTitle.length).toBe(0);

    // Texto accesible en sr-only
    const srOnly = screen.getByText(/Configura tu tasa en Ajustes/i);
    expect(srOnly).toBeTruthy();
    expect(srOnly.className).toContain('sr-only');
  });
});
