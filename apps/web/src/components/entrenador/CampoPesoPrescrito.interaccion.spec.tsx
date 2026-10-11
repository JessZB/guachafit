// @vitest-environment jsdom
/**
 * Lote E3 · C5 (fase roja): interacción del campo de peso prescrito del entrenador.
 *
 * El componente actual no tiene etiqueta accesible "Peso (kg)", ni interruptor
 * "Peso corporal", ni filtra lo que se teclea: estos tests deben fallar por esas razones.
 *
 * `@testing-library/user-event` no está en las dependencias de la web: se usa `fireEvent`.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampoPesoPrescrito } from './CampoPesoPrescrito';

afterEach(() => {
  cleanup();
});

/**
 * Harness controlado: el valor vive en estado y cada `onChange` lo actualiza, igual que en la
 * app. Así se puede comprobar tanto las llamadas recibidas como lo que muestra el input.
 */
function renderizarCampo(valorInicial: string) {
  const onChange = vi.fn();
  function Harness() {
    const [valor, setValor] = useState(valorInicial);
    return (
      <CampoPesoPrescrito
        valor={valor}
        onChange={(nuevo) => {
          onChange(nuevo);
          setValor(nuevo);
        }}
      />
    );
  }
  render(<Harness />);
  return { onChange };
}

function inputNumerico(): HTMLInputElement {
  const input = screen.queryByLabelText('Peso (kg)') ?? screen.queryByRole('textbox');
  if (!input) throw new Error('No se encontró el input numérico del peso prescrito');
  return input as HTMLInputElement;
}

function interruptorCorporal(): HTMLElement {
  const interruptor =
    screen.queryByRole('switch', { name: 'Peso corporal' }) ??
    screen.queryByRole('checkbox', { name: 'Peso corporal' });
  if (!interruptor) throw new Error('No se encontró el interruptor "Peso corporal"');
  return interruptor;
}

function estaActivado(elemento: HTMLElement): boolean {
  const ariaChecked = elemento.getAttribute('aria-checked');
  if (ariaChecked !== null) return ariaChecked === 'true';
  return elemento instanceof HTMLInputElement && elemento.checked;
}

describe('CampoPesoPrescrito · C5: entrada filtrada e interruptor "Peso corporal"', () => {
  it('1: el input tiene la etiqueta "Peso (kg)" con inputmode decimal y existe el interruptor "Peso corporal"', () => {
    renderizarCampo('60');

    const input = screen.getByLabelText('Peso (kg)') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(interruptorCorporal()).toBeTruthy();
  });

  it('2: una letra al final no llega a onChange y el input sigue mostrando 60', () => {
    const { onChange } = renderizarCampo('60');
    const input = inputNumerico();

    fireEvent.change(input, { target: { value: '60a' } });

    for (const [nuevo] of onChange.mock.calls) {
      expect(String(nuevo)).not.toMatch(/[a-zA-Z]/);
    }
    expect(input.value).toBe('60');
  });

  it('3: escribir "72,5" sobre vacío termina llamando a onChange("72.5")', () => {
    const { onChange } = renderizarCampo('');
    const input = inputNumerico();

    fireEvent.change(input, { target: { value: '72,5' } });

    expect(onChange).toHaveBeenLastCalledWith('72.5');
  });

  it('4: sobre 99, el tercer 9 forma 999 y el cuarto dígito se bloquea (nunca "9999")', () => {
    const { onChange } = renderizarCampo('99');
    const input = inputNumerico();

    fireEvent.change(input, { target: { value: '999' } });
    expect(input.value).toBe('999');

    fireEvent.change(input, { target: { value: '9999' } });

    const llamadas = onChange.mock.calls.map(([nuevo]) => nuevo);
    expect(llamadas).not.toContain('9999');
    expect(input.value).toBe('999');
  });

  it('5: activar "Peso corporal" llama a onChange("Corporal") y deshabilita el input', () => {
    const { onChange } = renderizarCampo('60');

    fireEvent.click(interruptorCorporal());

    expect(onChange).toHaveBeenLastCalledWith('Corporal');
    expect(inputNumerico().disabled).toBe(true);
  });

  it('6: con "Moderado" el interruptor está activado y el input deshabilitado; al desactivarlo, onChange("")', () => {
    const { onChange } = renderizarCampo('Moderado');
    const interruptor = interruptorCorporal();

    expect(estaActivado(interruptor)).toBe(true);
    expect(inputNumerico().disabled).toBe(true);

    fireEvent.click(interruptor);

    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('7: la etiqueta del peso usa al menos 12 px (ni text-[11px] ni text-[10px])', () => {
    renderizarCampo('60');

    const etiqueta = screen.getByText('Peso (kg)');
    expect(etiqueta.className).not.toMatch(/text-\[1[01]px\]/);
  });
});

describe('CampoPesoPrescrito · S3/S6: número recuperado y resincronización del borrador', () => {
  it('S3: con valor "60", activar y desactivar "Peso corporal" termina en onChange("60") y el input muestra 60', () => {
    const { onChange } = renderizarCampo('60');
    const interruptor = interruptorCorporal();

    fireEvent.click(interruptor);
    expect(onChange).toHaveBeenLastCalledWith('Corporal');

    fireEvent.click(interruptor);

    expect(onChange).toHaveBeenLastCalledWith('60');
    expect(inputNumerico().value).toBe('60');
  });

  it('S6: rerender con "80" en la misma instancia resincroniza el input, y con "Corporal" activa el interruptor', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CampoPesoPrescrito valor="60" onChange={onChange} />);
    expect(inputNumerico().value).toBe('60');

    rerender(<CampoPesoPrescrito valor="80" onChange={onChange} />);
    expect(inputNumerico().value).toBe('80');

    rerender(<CampoPesoPrescrito valor="Corporal" onChange={onChange} />);
    expect(estaActivado(interruptorCorporal())).toBe(true);
  });
});
