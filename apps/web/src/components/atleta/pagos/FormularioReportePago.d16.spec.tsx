// @vitest-environment happy-dom
/**
 * D16 / Ítem 22: Caracterización de aviso y botón de reporte de pago según falta de tasa.
 * Componente: `FormularioReportePago.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MetodoPago, Moneda } from '@guachafit/shared';
import { FormularioReportePago, type FormularioReportePagoProps } from './FormularioReportePago';

function propsBase(): FormularioReportePagoProps {
  return {
    metodoPago: MetodoPago.PAGO_MOVIL,
    onMetodoPago: vi.fn(),
    moneda: Moneda.VES,
    onMoneda: vi.fn(),
    montoOriginal: '1500',
    onMonto: vi.fn(),
    referenciaBancaria: '984521',
    onReferencia: vi.fn(),
    fechaOperacion: '2026-10-11',
    hoyLocal: '2026-11-03',
    onFecha: vi.fn(),
    onFechaInvalida: vi.fn(),
    isSubmitting: false,
    pagoVesSinTasa: false,
    contravalorUsd: '25.00',
    onSubmit: vi.fn(),
    comprobante: <div data-testid="slot-comprobante">Slot comprobante</div>,
  };
}

describe('FormularioReportePago · D16 / Ítem 22 (Aviso y bloqueo por falta de tasa)', () => {
  afterEach(() => {
    cleanup();
  });

  it('con pagoVesSinTasa: true se muestra el aviso de configuración, no el contravalor, y el botón queda disabled', () => {
    const { container } = render(
      <FormularioReportePago
        {...propsBase()}
        pagoVesSinTasa={true}
        contravalorUsd="—"
      />
    );

    expect(
      screen.getByText('Sin tasa configurada: tu entrenador debe definirla para reportar pagos en bolívares.')
    ).toBeTruthy();

    expect(screen.queryByText(/Monto en USD acreditado a tu cuota:/i)).toBeNull();

    const boton = screen.getByRole('button', { name: /Enviar comprobante de pago/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    expect(container.textContent).not.toContain('$— USD');
  });

  it('con pagoVesSinTasa: false se muestra el rótulo de acreditación, el botón se habilita y jamás se muestra $— USD', () => {
    const { container } = render(
      <FormularioReportePago
        {...propsBase()}
        pagoVesSinTasa={false}
        contravalorUsd="25.00"
      />
    );

    expect(screen.getByText('Monto en USD acreditado a tu cuota:')).toBeTruthy();

    const boton = screen.getByRole('button', { name: /Enviar comprobante de pago/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);

    expect(container.textContent).toContain('$25,00 USD');
    expect(container.textContent).not.toContain('$— USD');
  });

  it('con pagoVesSinTasa: false y contravalor vacío o no numérico tampoco se muestra $— USD', () => {
    const { container } = render(
      <FormularioReportePago
        {...propsBase()}
        pagoVesSinTasa={false}
        contravalorUsd="—"
      />
    );

    expect(screen.getByText('Monto en USD acreditado a tu cuota:')).toBeTruthy();
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toContain('$— USD');
  });
});
