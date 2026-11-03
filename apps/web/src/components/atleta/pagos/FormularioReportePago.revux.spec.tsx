// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MetodoPago, Moneda } from '@guachafit/shared';
import { FormularioReportePago, type FormularioReportePagoProps } from './FormularioReportePago';
import { SubidaComprobantePago } from './SubidaComprobantePago';

function estaDeshabilitado(el: Element): boolean {
  return (
    el.matches(':disabled') ||
    (el as any).disabled === true ||
    Boolean(el.closest('fieldset')?.disabled)
  );
}

function renderFormulario(
  overrides?: Partial<FormularioReportePagoProps>,
  conArchivo = false
) {
  const inputRef = createRef<HTMLInputElement | null>();
  const dummyFile = conArchivo
    ? new File(['recibo'], 'comprobante.png', { type: 'image/png' })
    : null;

  const comprobante = (
    <SubidaComprobantePago
      inputRef={inputRef}
      selectedFile={dummyFile}
      previewUrl={conArchivo ? 'blob:mock-url' : null}
      onArchivo={vi.fn()}
      onQuitar={vi.fn()}
    />
  );

  const props: FormularioReportePagoProps = {
    metodoPago: MetodoPago.PAGO_MOVIL,
    onMetodoPago: vi.fn(),
    moneda: Moneda.VES,
    onMoneda: vi.fn(),
    montoOriginal: '50.00',
    onMonto: vi.fn(),
    referenciaBancaria: '123456',
    onReferencia: vi.fn(),
    fechaOperacion: '2026-11-03',
    hoyLocal: '2026-11-03',
    onFecha: vi.fn(),
    onFechaInvalida: vi.fn(),
    isSubmitting: false,
    pagoVesSinTasa: false,
    contravalorUsd: '10.00',
    onSubmit: vi.fn(),
    comprobante,
    ...overrides,
  };

  return render(<FormularioReportePago {...props} />);
}

describe('FormularioReportePago · REVUX (G1b)', () => {
  afterEach(() => {
    cleanup();
  });

  it('R3: isSubmitting=true deshabilita selects, inputs y botones de comprobante; isSubmitting=false los mantiene habilitados', () => {
    // 1. Con isSubmitting=true y sin archivo (botón adjuntar)
    const { unmount: unmount1 } = renderFormulario({ isSubmitting: true }, false);
    const selectMetodo = screen.getByLabelText('Método de pago');
    const selectMoneda = screen.getByLabelText('Moneda');
    const inputMonto = screen.getByLabelText('Monto pagado');
    const inputRef = screen.getByLabelText(/Referencia bancaria/);
    const inputFecha = screen.getByLabelText('Fecha de operación');
    const botonAdjuntar = screen.getByRole('button', { name: /Toca para adjuntar foto o captura/i });
    const botonEnviar = screen.getByRole('button', { name: /Enviando al entrenador.../i });

    expect(estaDeshabilitado(selectMetodo)).toBe(true);
    expect(estaDeshabilitado(selectMoneda)).toBe(true);
    expect(estaDeshabilitado(inputMonto)).toBe(true);
    expect(estaDeshabilitado(inputRef)).toBe(true);
    expect(estaDeshabilitado(inputFecha)).toBe(true);
    expect(estaDeshabilitado(botonAdjuntar)).toBe(true);
    expect(estaDeshabilitado(botonEnviar)).toBe(true);
    unmount1();

    // 2. Con isSubmitting=true y con archivo (botón quitar comprobante)
    const { unmount: unmount2 } = renderFormulario({ isSubmitting: true }, true);
    const botonQuitar = screen.getByRole('button', { name: /Quitar comprobante/i });
    expect(estaDeshabilitado(botonQuitar)).toBe(true);
    unmount2();

    // 3. Con isSubmitting=false, todos están habilitados
    renderFormulario({ isSubmitting: false }, true);
    const selectMetodoHab = screen.getByLabelText('Método de pago');
    const inputMontoHab = screen.getByLabelText('Monto pagado');
    const botonQuitarHab = screen.getByRole('button', { name: /Quitar comprobante/i });
    const botonEnviarHab = screen.getByRole('button', { name: /Enviar comprobante de pago/i });

    expect(estaDeshabilitado(selectMetodoHab)).toBe(false);
    expect(estaDeshabilitado(inputMontoHab)).toBe(false);
    expect(estaDeshabilitado(botonQuitarHab)).toBe(false);
    expect(estaDeshabilitado(botonEnviarHab)).toBe(false);
  });

  it('R4: contravalor muestra «—» si el monto está vacío o es «—» (sin «$0.00 USD» ni «$— USD»); con valor válido muestra USD', () => {
    // 1. Monto vacío y contravalor '—'
    const { container, unmount: unmount1 } = renderFormulario({
      montoOriginal: '',
      contravalorUsd: '—',
    });
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toContain('$0.00 USD');
    expect(container.textContent).not.toContain('$— USD');
    unmount1();

    // 2. Monto vacío y contravalor '0.00' (tasa o cálculo en cero)
    const { container: containerZero, unmount: unmount2 } = renderFormulario({
      montoOriginal: '',
      contravalorUsd: '0.00',
    });
    expect(containerZero.textContent).toContain('—');
    expect(containerZero.textContent).not.toContain('$0.00 USD');
    unmount2();

    // 3. Contravalor válido: muestra el monto en USD
    const { container: containerValido } = renderFormulario({
      montoOriginal: '1950.00',
      contravalorUsd: '30.00',
    });
    expect(containerValido.textContent).toContain('$30,00 USD');
  });

  it('R5: toda etiqueta label en la zona de comprobante tiene htmlFor o contiene un control', () => {
    const inputRef = createRef<HTMLInputElement | null>();
    const { container } = render(
      <SubidaComprobantePago
        inputRef={inputRef}
        selectedFile={null}
        previewUrl={null}
        onArchivo={vi.fn()}
        onQuitar={vi.fn()}
      />
    );

    const labels = container.querySelectorAll('label');
    labels.forEach((label) => {
      const htmlFor = label.getAttribute('for') || label.getAttribute('htmlFor');
      const tieneControl = label.querySelector('input, select, textarea, button') !== null;
      expect(Boolean(htmlFor || tieneControl)).toBe(true);
    });
  });
});
