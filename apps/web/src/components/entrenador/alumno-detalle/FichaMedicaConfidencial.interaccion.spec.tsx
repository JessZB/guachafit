// @vitest-environment happy-dom
/**
 * 01 · Ficha del alumno (L1.3) · tarjeta de salud editable.
 *
 * Contrato:
 * - Título "Salud y limitaciones" y ayuda que explica para qué sirve el campo.
 * - `<textarea>` con etiqueta asociada, `maxLength=2000`, placeholder sin patologías y
 *   contador visible "N/2000" que se actualiza al escribir.
 * - Ya no aparecen "patologías", "hernias" ni "estrictamente invisible".
 */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FichaMedicaConfidencial } from './FichaMedicaConfidencial';

afterEach(() => {
  cleanup();
});

const AYUDA =
  'Condiciones, lesiones, cirugías, alergias u observaciones que debas tener presentes al entrenar. Solo tú la ves y se guarda cifrada.';

function FichaControlada() {
  const [valor, setValor] = useState('');
  return <FichaMedicaConfidencial valor={valor} onCambiar={setValor} />;
}

describe('FichaMedicaConfidencial · L1.3 textos', () => {
  it('titula la tarjeta "Salud y limitaciones" y explica el campo sin patologías', () => {
    render(<FichaControlada />);

    expect(screen.getByRole('heading', { name: 'Salud y limitaciones' })).toBeTruthy();
    expect(screen.getByText(AYUDA)).toBeTruthy();
    expect(screen.queryByText(/patologías/i)).toBeNull();
    expect(screen.queryByText(/hernias/i)).toBeNull();
    expect(screen.queryByText(/estrictamente invisible/i)).toBeNull();
  });
});

describe('FichaMedicaConfidencial · L1.3 campo accesible', () => {
  it('asocia la etiqueta al textarea y fija maxLength y placeholder', () => {
    render(<FichaControlada />);

    const campo = screen.getByLabelText('Salud y limitaciones') as HTMLTextAreaElement;
    expect(campo.tagName).toBe('TEXTAREA');
    expect(campo.getAttribute('maxlength')).toBe('2000');
    expect(campo.getAttribute('placeholder')).toBe(
      'Ej.: evitar sentadilla profunda por cirugía de rodilla'
    );
  });

  it('muestra el contador N/2000 y lo actualiza al escribir', () => {
    render(<FichaControlada />);

    const campo = screen.getByLabelText('Salud y limitaciones') as HTMLTextAreaElement;
    expect(screen.getByText('0/2000')).toBeTruthy();

    fireEvent.change(campo, { target: { value: 'dolor lumbar' } });

    expect(campo.value).toBe('dolor lumbar');
    expect(screen.getByText('12/2000')).toBeTruthy();
    expect(screen.queryByText('0/2000')).toBeNull();
  });
});
