// @vitest-environment jsdom
/**
 * ZH-2: tests en fase roja para `FormularioReportePago`.
 * Contrato 6:
 * `FormularioReportePago.tsx` (presentacional, sin useAuth) recibe una prop nueva obligatoria
 * `hoyLocal: string` y usa ese valor como `max` del campo fecha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MetodoPago, Moneda } from '@guachafit/shared';
import { FormularioReportePago, type FormularioReportePagoProps } from './FormularioReportePago';

const INSTANTE_REFERENCIA = '2026-11-03T20:00:00Z';

function crearPropsMinimas(): FormularioReportePagoProps {
  return {
    hoyLocal: '2026-11-03',
    metodoPago: MetodoPago.PAGO_MOVIL,
    onMetodoPago: vi.fn(),
    moneda: Moneda.VES,
    onMoneda: vi.fn(),
    montoOriginal: '100',
    onMonto: vi.fn(),
    referenciaBancaria: '123456',
    onReferencia: vi.fn(),
    fechaOperacion: '2026-11-04',
    onFecha: vi.fn(),
    onFechaInvalida: vi.fn(),
    isSubmitting: false,
    pagoVesSinTasa: false,
    contravalorUsd: '2.00',
    onSubmit: vi.fn(),
    comprobante: null,
  };
}

describe('ZH-2 · FormularioReportePago', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(INSTANTE_REFERENCIA));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('usa la prop hoyLocal="2026-11-04" como valor del atributo max del input[type="date"]', () => {
    const props = crearPropsMinimas();
    const { container } = render(
      <FormularioReportePago
        {...(props as any)}
        hoyLocal="2026-11-04"
      />
    );

    const inputFecha = container.querySelector('input[type="date"]');
    expect(inputFecha).not.toBeNull();
    expect(inputFecha?.getAttribute('max')).toBe('2026-11-04');
  });

  it('regresión Caracas: cuando hoyLocal="2026-11-03" el atributo max del input es 2026-11-03', () => {
    const props = crearPropsMinimas();
    const { container } = render(
      <FormularioReportePago
        {...(props as any)}
        hoyLocal="2026-11-03"
      />
    );

    const inputFecha = container.querySelector('input[type="date"]');
    expect(inputFecha).not.toBeNull();
    expect(inputFecha?.getAttribute('max')).toBe('2026-11-03');
  });
});
