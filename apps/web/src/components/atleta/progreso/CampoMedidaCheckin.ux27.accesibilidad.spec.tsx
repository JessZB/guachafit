// @vitest-environment jsdom
/**
 * UX-27: Tests RED para PRO-03 (accesibilidad aria en campos de medida check-in).
 *
 * Contratos:
 * - El input debe vincularse con su mensaje de error mediante `aria-describedby="${id}-error"`.
 * - El párrafo del mensaje de error con role="alert" debe poseer el atributo id="${id}-error".
 * - Cuando no hay error, `aria-describedby` no debe estar presente o debe estar vacío.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CampoMedidaCheckin } from './CampoMedidaCheckin';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CampoMedidaCheckin — PRO-03: accesibilidad aria', () => {
  it('vincula el input con su error mediante aria-describedby', () => {
    const { container } = render(
      <CampoMedidaCheckin
        id="peso"
        etiqueta="Peso (kg)"
        valor="abc"
        onCambiar={vi.fn()}
        conError={true}
        error="Valor inválido"
      />
    );

    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    // FALLA: CampoMedidaCheckin.tsx:37-48 no tiene atributo aria-describedby en el input
    expect(input?.getAttribute('aria-describedby')).toBe('peso-error');
  });

  it('el párrafo de error tiene el id correcto (${id}-error)', () => {
    const { container } = render(
      <CampoMedidaCheckin
        id="peso"
        etiqueta="Peso (kg)"
        valor="abc"
        onCambiar={vi.fn()}
        conError={true}
        error="Valor inválido"
      />
    );

    // FALLA: CampoMedidaCheckin.tsx:49-53 no asigna id="${id}-error" al <p role="alert">
    const errorEl = container.querySelector('#peso-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toContain('Valor inválido');
  });

  it('cuando no hay error, aria-describedby no está presente o apunta a elemento vacío', () => {
    const { container } = render(
      <CampoMedidaCheckin
        id="peso"
        etiqueta="Peso (kg)"
        valor="70"
        onCambiar={vi.fn()}
        conError={false}
      />
    );

    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    const describedBy = input?.getAttribute('aria-describedby');
    expect(!describedBy || describedBy.trim() === '').toBe(true);
  });
});
