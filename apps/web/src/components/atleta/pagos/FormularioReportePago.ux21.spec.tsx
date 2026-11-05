// @vitest-environment happy-dom
/**
 * Specs de comportamiento UX-21: formulario de reporte de pago (`FormularioReportePago.tsx`).
 * Contratos C2 y C3: asociación accesible label/input (htmlFor/id) y atributos aria para errores.
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
    montoOriginal: '',
    onMonto: vi.fn(),
    referenciaBancaria: '',
    onReferencia: vi.fn(),
    fechaOperacion: '2026-10-11',
    hoyLocal: '2026-11-03',
    onFecha: vi.fn(),
    onFechaInvalida: vi.fn(),
    isSubmitting: false,
    pagoVesSinTasa: false,
    contravalorUsd: '0.00',
    onSubmit: vi.fn(),
    comprobante: <div data-testid="slot-comprobante">Slot comprobante</div>,
  };
}

describe('FormularioReportePago · UX-21 (C2, C3)', () => {
  afterEach(() => {
    cleanup();
  });

  it('C2 · control Método de pago se localiza por su etiqueta accesible screen.getByLabelText(\'Método de pago\')', () => {
    render(<FormularioReportePago {...propsBase()} />);
    const control = screen.getByLabelText('Método de pago');
    expect(control.tagName.toLowerCase()).toBe('select');
  });

  it('C2 · control Moneda se localiza por su etiqueta accesible screen.getByLabelText(\'Moneda\')', () => {
    render(<FormularioReportePago {...propsBase()} />);
    const control = screen.getByLabelText('Moneda');
    expect(control.tagName.toLowerCase()).toBe('select');
  });

  it('C2 · control Monto pagado se localiza por su etiqueta accesible screen.getByLabelText(\'Monto pagado\')', () => {
    render(<FormularioReportePago {...propsBase()} />);
    const control = screen.getByLabelText('Monto pagado');
    expect(control.tagName.toLowerCase()).toBe('input');
  });

  it('C2 · control Referencia bancaria se localiza por su etiqueta accesible screen.getByLabelText(/Referencia bancaria/)', () => {
    render(<FormularioReportePago {...propsBase()} />);
    const control = screen.getByLabelText(/Referencia bancaria/);
    expect(control.tagName.toLowerCase()).toBe('input');
  });

  it('C2 · control Fecha de operación se localiza por su etiqueta accesible screen.getByLabelText(\'Fecha de operación\')', () => {
    render(<FormularioReportePago {...propsBase()} />);
    const control = screen.getByLabelText('Fecha de operación');
    expect(control.tagName.toLowerCase()).toBe('input');
    expect((control as HTMLInputElement).type).toBe('date');
  });

  it('C3 · cuando hay errorMonto, el input Monto pagado tiene aria-invalid="true" y aria-describedby enlazado al role="alert"', () => {
    render(
      <FormularioReportePago
        {...propsBase()}
        {...({ errorMonto: 'Ingresa un monto válido mayor a 0.' } as any)}
      />
    );
    // Localizar el input por inputMode o etiqueta
    const inputs = document.querySelectorAll('input');
    const inputMonto = Array.from(inputs).find((i) => i.getAttribute('inputmode') === 'decimal') ?? inputs[0];

    expect(inputMonto.getAttribute('aria-invalid')).toBe('true');
    const alertId = inputMonto.getAttribute('aria-describedby');
    expect(alertId).toBeTruthy();

    const alertEl = document.getElementById(alertId!);
    expect(alertEl).not.toBeNull();
    expect(alertEl?.getAttribute('role')).toBe('alert');
    expect(alertEl?.textContent).toContain('Ingresa un monto válido mayor a 0.');
  });

  it('C3 · cuando hay errorFecha, el input Fecha de Operación tiene aria-invalid="true" y aria-describedby enlazado al role="alert"', () => {
    render(
      <FormularioReportePago
        {...propsBase()}
        {...({ errorFecha: 'La fecha del pago no puede ser posterior a hoy.' } as any)}
      />
    );
    const inputFecha = document.querySelector('input[type="date"]');
    expect(inputFecha).not.toBeNull();
    expect(inputFecha!.getAttribute('aria-invalid')).toBe('true');

    const alertId = inputFecha!.getAttribute('aria-describedby');
    expect(alertId).toBeTruthy();

    const alertEl = document.getElementById(alertId!);
    expect(alertEl).not.toBeNull();
    expect(alertEl?.getAttribute('role')).toBe('alert');
    expect(alertEl?.textContent).toContain('La fecha del pago no puede ser posterior a hoy.');
  });
});
