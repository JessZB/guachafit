// @vitest-environment jsdom
/**
 * Ficha del alumno · `ModalCobroSala` (fase roja L3.1–L3.3).
 *
 * Contratos que fija este spec:
 * - L3.1: `getByLabelText` encuentra «Monto Recibido», «Moneda», «Fecha de la operación» (ya
 *   asociada hoy: regresión) y «Notas Internas»; dos modales simultáneos no repiten `id`.
 * - L3.2: «Monto Recibido» (el único importe numérico) lleva `inputMode="decimal"`. Moneda es un
 *   `<select>`, la fecha es `type="date"` y Notas es texto libre: NO son campos numéricos y no se
 *   les exige teclado decimal.
 * - L3.3: el botón de cerrar conserva su `aria-label` y gana `min-h-11 min-w-11`.
 *
 * El modal se monta con un `RetornoCobroSala` de prueba: no envía nada ni consulta la API.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Moneda } from '@guachafit/shared';
import { ModalCobroSala } from './ModalCobroSala';
import type { RetornoCobroSala } from './use-cobro-sala';

const ETIQUETAS = [
  'Monto Recibido',
  'Moneda',
  'Fecha de la operación',
  'Notas Internas',
] as const;

function cobroSala(overrides: Partial<RetornoCobroSala> = {}): RetornoCobroSala {
  return {
    isCobroModalOpen: true,
    setIsCobroModalOpen: vi.fn(),
    cobroMonto: '40.00',
    setCobroMonto: vi.fn(),
    cobroMoneda: Moneda.USD,
    setCobroMoneda: vi.fn(),
    cobroFecha: '2026-10-26',
    setCobroFecha: vi.fn(),
    tasaCobro: null,
    cobroNotas: '',
    setCobroNotas: vi.fn(),
    cobroSinPlan: false,
    isSubmittingCobro: false,
    cobroSuccessMsg: null,
    setCobroSuccessMsg: vi.fn(),
    cobroErrorMsg: null,
    setCobroErrorMsg: vi.fn(),
    abrirCobro: vi.fn(),
    cambiarFechaCobro: vi.fn(),
    manejarFechaInvalida: vi.fn(),
    registrarCobro: async () => {},
    ...overrides,
  };
}

function elementoModal(overrides: Partial<RetornoCobroSala> = {}) {
  return (
    <ModalCobroSala
      cobro={cobroSala(overrides)}
      onAsignarPlan={vi.fn()}
    />
  );
}

function renderModal(overrides: Partial<RetornoCobroSala> = {}) {
  return render(elementoModal(overrides));
}

afterEach(() => {
  cleanup();
});

describe('ModalCobroSala · L3.1 etiquetas asociadas', () => {
  it.each(ETIQUETAS)('asocia «%s» a su control', (etiqueta) => {
    renderModal();

    const control = screen.getByLabelText(etiqueta);
    expect(['INPUT', 'SELECT']).toContain(control.tagName);
  });

  it('genera ids únicos cuando hay dos modales montados a la vez', () => {
    render(
      <>
        {elementoModal()}
        {elementoModal()}
      </>
    );

    for (const etiqueta of ETIQUETAS) {
      const controles = screen.getAllByLabelText(etiqueta);
      expect(controles).toHaveLength(2);
      const ids = controles.map((control) => control.id);
      expect(ids.every((id) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(2);
    }
  });
});

describe('ModalCobroSala · L3.2 teclado numérico', () => {
  it('el monto recibido abre el teclado decimal', () => {
    renderModal();

    expect(screen.getByLabelText('Monto Recibido').getAttribute('inputmode')).toBe('decimal');
  });

  it('la fecha de la operación sigue siendo un campo de fecha (no numérico)', () => {
    renderModal();

    expect(screen.getByLabelText('Fecha de la operación').getAttribute('type')).toBe('date');
  });
});

describe('ModalCobroSala · L3.3 altura táctil', () => {
  it('el botón de cerrar conserva su aria-label y su área táctil mínima', () => {
    renderModal();

    const cerrar = screen.getByRole('button', { name: 'Cerrar cobro directo' });
    expect(cerrar.classList.contains('min-h-11')).toBe(true);
    expect(cerrar.classList.contains('min-w-11')).toBe(true);
  });
});
