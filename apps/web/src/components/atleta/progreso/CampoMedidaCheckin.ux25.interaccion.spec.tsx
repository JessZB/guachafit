// @vitest-environment happy-dom
/**
 * UX-25 (Fase Roja / TDD) · Contratos de accesibilidad táctil para CampoMedidaCheckin:
 * - PRO-02: Altura táctil mínima en inputs de check-in antropométrico (min-h-11, ≥44px)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CampoMedidaCheckin, CLASES_INPUT_MEDIDA } from './CampoMedidaCheckin';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CampoMedidaCheckin · UX-25 Fase Roja', () => {
  it('PRO-02: el input de medida antropométrica asociado por htmlFor tiene altura táctil min-h-11', () => {
    render(
      <CampoMedidaCheckin
        id="peso"
        etiqueta="Peso (kg)"
        valor="70"
        onCambiar={vi.fn()}
        conError={false}
      />
    );

    const input = screen.getByLabelText('Peso (kg)');
    expect(input).toBeTruthy();
    expect(input.id).toBe('peso');
    expect(input.className).toContain('min-h-11');
  });

  it('PRO-02: CLASES_INPUT_MEDIDA define la altura táctil mínima min-h-11', () => {
    expect(CLASES_INPUT_MEDIDA).toContain('min-h-11');
  });
});
