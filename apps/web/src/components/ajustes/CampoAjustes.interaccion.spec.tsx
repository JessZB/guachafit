// @vitest-environment happy-dom
/**
 * 01 · UX-03 · Specs de interacción para CampoAjustes ampliado (Contrato B) y SelectAjustes (Contrato C).
 *
 * Contratos a testear:
 * - B: CampoAjustes ampliado con inputMode, sufijo, descripcion, placeholder, role="alert" y clases responsivas.
 * - C: SelectAjustes como componente accesible de selección con etiqueta, descripción y error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampoAjustes, SelectAjustes } from './CampoAjustes';

afterEach(() => {
  cleanup();
});

function clases(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

describe('CampoAjustes ampliado · Contrato B', () => {
  it('1. getByLabelText(etiqueta) devuelve el input asociado por htmlFor/id', () => {
    render(
      <CampoAjustes
        id="campo-prueba"
        etiqueta="Nombre del titular"
        valor=""
        onCambiar={() => {}}
      />
    );

    const input = screen.getByLabelText('Nombre del titular');
    expect(input).toBeTruthy();
    expect(input.id).toBe('campo-prueba');
    expect(input.tagName.toLowerCase()).toBe('input');
  });

  it('2. con inputMode="decimal" el input tiene inputmode="decimal" y type="text" (§6.13)', () => {
    render(
      <CampoAjustes
        id="campo-monto"
        etiqueta="Monto de la cuota"
        valor="40.00"
        onCambiar={() => {}}
        inputMode="decimal"
      />
    );

    const input = screen.getByLabelText('Monto de la cuota');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('type')).toBe('text');
  });

  it('3. sufijo visible en flujo (sin absolute, contenedor flex) con id y en aria-describedby', () => {
    render(
      <CampoAjustes
        id="campo-tasa"
        etiqueta="Tasa del día"
        valor="36.50"
        onCambiar={() => {}}
        sufijo="Bs/USD"
      />
    );

    const input = screen.getByLabelText('Tasa del día');
    const sufijo = screen.getByText('Bs/USD');

    expect(sufijo.id).toBe('campo-tasa-sufijo');
    expect(input.getAttribute('aria-describedby')).toContain('campo-tasa-sufijo');

    // El sufijo no debe ser position: absolute; su contenedor debe tener flex
    expect(clases(sufijo)).not.toContain('absolute');
    expect(sufijo.parentElement).not.toBeNull();
    expect(clases(sufijo.parentElement!)).toContain('flex');
  });

  it('4. descripcion visible con id y en aria-describedby', () => {
    render(
      <CampoAjustes
        id="campo-decimales"
        etiqueta="Monto sugerido"
        valor=""
        onCambiar={() => {}}
        descripcion="Hasta 2 decimales"
      />
    );

    const input = screen.getByLabelText('Monto sugerido');
    const desc = screen.getByText('Hasta 2 decimales');

    expect(desc.id).toBe('campo-decimales-descripcion');
    expect(input.getAttribute('aria-describedby')).toContain('campo-decimales-descripcion');
  });

  it('5. error con role="alert", id y aria-invalid="true"', () => {
    render(
      <CampoAjustes
        id="campo-invalido"
        etiqueta="Correo de cobro"
        valor="invalido"
        onCambiar={() => {}}
        error="Monto inválido"
      />
    );

    const input = screen.getByLabelText('Correo de cobro');
    const errorMsg = screen.getByRole('alert');

    expect(errorMsg.textContent).toBe('Monto inválido');
    expect(errorMsg.id).toBe('campo-invalido-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('campo-invalido-error');
  });

  it('6. orden de aria-describedby: descripcion sufijo error; solo error; y sin atributo si no hay piezas', () => {
    // Caso 1: las tres piezas presentes -> "<id>-descripcion <id>-sufijo <id>-error"
    const { unmount } = render(
      <CampoAjustes
        id="campo-todo"
        etiqueta="Completo"
        valor="10"
        onCambiar={() => {}}
        descripcion="Texto de ayuda"
        sufijo="USD"
        error="Dato con error"
      />
    );
    const inputTodo = screen.getByLabelText('Completo');
    expect(inputTodo.getAttribute('aria-describedby')).toBe(
      'campo-todo-descripcion campo-todo-sufijo campo-todo-error'
    );
    unmount();

    // Caso 2: solo error -> "<id>-error" (compatibilidad existente)
    render(
      <CampoAjustes
        id="campo-solo-error"
        etiqueta="Solo error"
        valor=""
        onCambiar={() => {}}
        error="Error puntual"
      />
    );
    const inputSoloError = screen.getByLabelText('Solo error');
    expect(inputSoloError.getAttribute('aria-describedby')).toBe('campo-solo-error-error');
    cleanup();

    // Caso 3: sin piezas -> sin atributo aria-describedby
    render(
      <CampoAjustes
        id="campo-limpio"
        etiqueta="Sin extras"
        valor=""
        onCambiar={() => {}}
      />
    );
    const inputLimpio = screen.getByLabelText('Sin extras');
    expect(inputLimpio.getAttribute('aria-describedby')).toBeNull();
  });

  it('7. zoom en iOS y área táctil: clases text-base, sm:text-sm y min-h-11 en input', () => {
    render(
      <CampoAjustes
        id="campo-tactil"
        etiqueta="Teléfono"
        valor=""
        onCambiar={() => {}}
      />
    );

    const input = screen.getByLabelText('Teléfono');
    const tokens = clases(input);

    expect(tokens).toContain('text-base');
    expect(tokens).toContain('sm:text-sm');
    expect(tokens).toContain('min-h-11');
  });

  it('8. placeholder llega al input', () => {
    render(
      <CampoAjustes
        id="campo-placeholder"
        etiqueta="Ejemplo"
        valor=""
        onCambiar={() => {}}
        placeholder="0.00"
      />
    );

    const input = screen.getByLabelText('Ejemplo');
    expect(input.getAttribute('placeholder')).toBe('0.00');
  });

  it('9. escribir llama a onCambiar con el valor ingresado', () => {
    const onCambiar = vi.fn();
    render(
      <CampoAjustes
        id="campo-escribir"
        etiqueta="Nombre"
        valor=""
        onCambiar={onCambiar}
      />
    );

    const input = screen.getByLabelText('Nombre');
    fireEvent.change(input, { target: { value: 'Nuevo texto' } });
    expect(onCambiar).toHaveBeenCalledWith('Nuevo texto');
  });

  it('10. con deshabilitado el input está disabled', () => {
    render(
      <CampoAjustes
        id="campo-disabled"
        etiqueta="Bloqueado"
        valor="fijo"
        onCambiar={() => {}}
        deshabilitado
      />
    );

    const input = screen.getByLabelText('Bloqueado');
    expect(input.hasAttribute('disabled')).toBe(true);
  });
});

describe('SelectAjustes · Contrato C', () => {
  const OPCIONES_PRUEBA = [
    { valor: 'usd', etiqueta: 'Dólares (USD)' },
    { valor: 'ves', etiqueta: 'Bolívares (VES)' },
    { valor: 'eur', etiqueta: 'Euros (EUR)' },
  ] as const;

  it('1. getByLabelText(etiqueta) devuelve un <select> con opciones en orden con value y texto', () => {
    expect(SelectAjustes, 'SelectAjustes debe estar exportado').toBeDefined();
    render(
      <SelectAjustes
        id="select-moneda"
        etiqueta="Moneda principal"
        valor="usd"
        onCambiar={() => {}}
        opciones={OPCIONES_PRUEBA}
      />
    );

    const select = screen.getByLabelText('Moneda principal');
    expect(select.tagName.toLowerCase()).toBe('select');

    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3);
    expect(options[0].value).toBe('usd');
    expect(options[0].textContent).toBe('Dólares (USD)');
    expect(options[1].value).toBe('ves');
    expect(options[1].textContent).toBe('Bolívares (VES)');
    expect(options[2].value).toBe('eur');
    expect(options[2].textContent).toBe('Euros (EUR)');
  });

  it('2. la opción con valor queda seleccionada y fireEvent.change llama a onCambiar con su valor', () => {
    expect(SelectAjustes, 'SelectAjustes debe estar exportado').toBeDefined();
    const onCambiar = vi.fn();
    render(
      <SelectAjustes
        id="select-cambio"
        etiqueta="Moneda"
        valor="usd"
        onCambiar={onCambiar}
        opciones={OPCIONES_PRUEBA}
      />
    );

    const select = screen.getByLabelText('Moneda') as HTMLSelectElement;
    expect(select.value).toBe('usd');

    fireEvent.change(select, { target: { value: 'ves' } });
    expect(onCambiar).toHaveBeenCalledWith('ves');
  });

  it('3. error y descripcion siguen reglas de role="alert", ids y orden de aria-describedby', () => {
    expect(SelectAjustes, 'SelectAjustes debe estar exportado').toBeDefined();
    render(
      <SelectAjustes
        id="select-val"
        etiqueta="Moneda de cobro"
        valor="usd"
        onCambiar={() => {}}
        opciones={OPCIONES_PRUEBA}
        descripcion="Moneda en que se liquidará"
        error="Moneda no habilitada"
      />
    );

    const select = screen.getByLabelText('Moneda de cobro');
    const errorMsg = screen.getByRole('alert');
    const desc = screen.getByText('Moneda en que se liquidará');

    expect(errorMsg.id).toBe('select-val-error');
    expect(desc.id).toBe('select-val-descripcion');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe(
      'select-val-descripcion select-val-error'
    );
  });

  it('4. el <select> incluye min-h-11, text-base y sm:text-sm', () => {
    expect(SelectAjustes, 'SelectAjustes debe estar exportado').toBeDefined();
    render(
      <SelectAjustes
        id="select-clases"
        etiqueta="Tipo"
        valor="usd"
        onCambiar={() => {}}
        opciones={OPCIONES_PRUEBA}
      />
    );

    const select = screen.getByLabelText('Tipo');
    const tokens = clases(select);

    expect(tokens).toContain('min-h-11');
    expect(tokens).toContain('text-base');
    expect(tokens).toContain('sm:text-sm');
  });

  it('5. con deshabilitado el <select> tiene atributo disabled', () => {
    expect(SelectAjustes, 'SelectAjustes debe estar exportado').toBeDefined();
    render(
      <SelectAjustes
        id="select-disabled"
        etiqueta="Moneda fija"
        valor="usd"
        onCambiar={() => {}}
        opciones={OPCIONES_PRUEBA}
        deshabilitado
      />
    );

    const select = screen.getByLabelText('Moneda fija');
    expect(select.hasAttribute('disabled')).toBe(true);
  });
});
