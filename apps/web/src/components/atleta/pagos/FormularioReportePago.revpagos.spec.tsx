// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MetodoPago, Moneda } from '@guachafit/shared';
import {
  FormularioReportePago,
  type FormularioReportePagoProps,
} from './FormularioReportePago';
import { formatDecimal, formatMonto } from '../../../lib/formato-monto';
import * as pagosMontosModule from '../../../lib/pagos-montos';

const { avisoMonedaMetodo } = pagosMontosModule as unknown as {
  avisoMonedaMetodo: (metodo: MetodoPago, moneda: Moneda) => string | null;
};

const fm = (v: string, m: 'USD' | 'VES', o?: { conCodigo?: boolean }) =>
  formatMonto(v, m, { ...o, formato: 'coma-decimal' });
const fd = (v: string, decimales: number) =>
  formatDecimal(v, { decimales, formato: 'coma-decimal' });

function propsBase(): FormularioReportePagoProps {
  return {
    metodoPago: MetodoPago.PAGO_MOVIL,
    onMetodoPago: vi.fn(),
    moneda: Moneda.VES,
    onMoneda: vi.fn(),
    montoOriginal: '100.00',
    onMonto: vi.fn(),
    referenciaBancaria: '',
    onReferencia: vi.fn(),
    fechaOperacion: '2026-10-10',
    onFecha: vi.fn(),
    onFechaInvalida: vi.fn(),
    isSubmitting: false,
    pagoVesSinTasa: false,
    contravalorUsd: '100.00',
    onSubmit: vi.fn(),
    comprobante: <div data-testid="comprobante-slot">Comprobante</div>,
  };
}

afterEach(() => {
  cleanup();
});

describe('components/atleta/pagos/FormularioReportePago · referencia, avisos y formato común (D11, D15)', () => {
  it('P12: campo Referencia Bancaria tiene maxLength 64, autoComplete off y enlaza errorReferencia con aria-invalid y role="alert"', () => {
    // 1. Con errorReferencia presente
    const { unmount: unmount1 } = render(
      <FormularioReportePago
        {...propsBase()}
        {...({ errorReferencia: 'La referencia debe tener entre 4 y 64 caracteres.' } as any)}
      />
    );

    const inputConError = screen.getByLabelText(/Referencia Bancaria/i) as HTMLInputElement;
    expect(inputConError.maxLength).toBe(64);
    expect(inputConError.getAttribute('autocomplete')).toBe('off');
    expect(inputConError.getAttribute('aria-invalid')).toBe('true');

    const alertId = inputConError.getAttribute('aria-describedby');
    expect(alertId).toBeTruthy();

    const alertEl = document.getElementById(alertId!);
    expect(alertEl).not.toBeNull();
    expect(alertEl?.getAttribute('role')).toBe('alert');
    expect(alertEl?.textContent).toContain('La referencia debe tener entre 4 y 64 caracteres.');

    unmount1();

    // 2. Sin errorReferencia
    render(<FormularioReportePago {...propsBase()} />);
    const inputSinError = screen.getByLabelText(/Referencia Bancaria/i) as HTMLInputElement;
    expect(inputSinError.getAttribute('aria-invalid')).toBeNull();
  });

  it('P13: select Moneda enlaza aria-describedby al aviso de moneda cuando no es coherente y lo desvincula cuando lo es', () => {
    // 1. Incoherente: ZELLE + VES
    const { unmount: unmount1 } = render(
      <FormularioReportePago
        {...propsBase()}
        metodoPago={MetodoPago.ZELLE}
        moneda={Moneda.VES}
      />
    );

    const selectIncoherente = screen.getByLabelText('Moneda');
    const describedById = selectIncoherente.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();

    const avisoEsperado = avisoMonedaMetodo(MetodoPago.ZELLE, Moneda.VES);
    expect(typeof avisoEsperado).toBe('string');

    const avisoEl = document.getElementById(describedById!);
    expect(avisoEl).not.toBeNull();
    expect(avisoEl?.textContent).toBe(avisoEsperado);

    unmount1();

    // 2. Coherente: ZELLE + USD
    render(
      <FormularioReportePago
        {...propsBase()}
        metodoPago={MetodoPago.ZELLE}
        moneda={Moneda.USD}
      />
    );

    const selectCoherente = screen.getByLabelText('Moneda');
    expect(avisoMonedaMetodo(MetodoPago.ZELLE, Moneda.USD)).toBeNull();
    const describedByCoherente = selectCoherente.getAttribute('aria-describedby');
    if (describedByCoherente) {
      const el = document.getElementById(describedByCoherente);
      expect(el).toBeNull();
    } else {
      expect(describedByCoherente).toBeNull();
    }
  });

  it('P14: previsualización de contravalor formatea con useFormatoNumero y no contiene el texto crudo', () => {
    render(<FormularioReportePago {...propsBase()} contravalorUsd="1900.00" />);

    const esperado = fm('1900.00', 'USD', { conCodigo: true });
    expect(document.body.textContent).toContain(esperado);
    expect(document.body.textContent).not.toContain('1900.00');
  });
});
