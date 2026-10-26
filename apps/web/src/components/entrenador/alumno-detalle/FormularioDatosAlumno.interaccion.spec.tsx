// @vitest-environment jsdom
/**
 * Ficha del alumno · `FormularioDatosAlumno` (fase roja L1.5 + L3.1–L3.4).
 *
 * Contratos que fija este spec:
 * - L1.5: las opciones de modalidad se llaman «Presencial» y «Remoto»; la edad («NN años») es un
 *   `<p>` debajo del campo de fecha de nacimiento, no un texto en la fila del label.
 * - L3.1: `getByLabelText` encuentra cada control; dos formularios simultáneos no repiten `id`.
 * - L3.2: teléfono con `inputMode="tel"`; nombres y apellidos con su `autoComplete`.
 * - L3.3: todos los `<input>` y `<select>` del formulario llevan `min-h-11`.
 * - L3.4: la fila tipo/número de documento es `grid-cols-1 sm:grid-cols-3`.
 *
 * Los textos de etiqueta son los ACTUALES del componente (L3.1 solo exige asociación, no renombrar
 * salvo lo que L1.5 renombra: las opciones de modalidad).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import {
  FormularioDatosAlumno,
  type FormularioDatosAlumnoProps,
} from './FormularioDatosAlumno';

const ETIQUETAS = [
  'Nombres',
  'Apellidos',
  'Tipo Doc',
  'Número de Documento',
  'Fecha Nacimiento',
  'Teléfono / WhatsApp',
  'Modalidad',
] as const;

function propsFormulario(
  overrides: Partial<FormularioDatosAlumnoProps> = {}
): FormularioDatosAlumnoProps {
  return {
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '12345678',
    fechaNacimiento: '1990-05-10',
    telefonoWhatsapp: '+584121234567',
    modalidad: Modalidad.PRESENCIAL,
    setNombres: vi.fn(),
    setApellidos: vi.fn(),
    setTipoDocumento: vi.fn(),
    setNumeroDocumento: vi.fn(),
    setFechaNacimiento: vi.fn(),
    setTelefonoWhatsapp: vi.fn(),
    setModalidad: vi.fn(),
    ...overrides,
  };
}

function renderFormulario(overrides: Partial<FormularioDatosAlumnoProps> = {}) {
  return render(<FormularioDatosAlumno {...propsFormulario(overrides)} />);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FormularioDatosAlumno · L1.5 textos', () => {
  it('llama a las opciones de modalidad «Presencial» y «Remoto»', () => {
    const { container } = renderFormulario();

    // El segundo <select> del formulario es Modalidad (el primero es Tipo Doc).
    const modalidad = container.querySelectorAll('select')[1];
    expect(modalidad).toBeDefined();
    expect(Array.from(modalidad.options).map((opcion) => opcion.textContent?.trim())).toEqual([
      'Presencial',
      'Remoto',
    ]);
  });

  it('muestra la edad como <p> debajo del campo de fecha de nacimiento', () => {
    // La edad se calcula con el reloj: se fija «hoy» para que el texto sea determinista.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T12:00:00-04:00'));

    const { container } = renderFormulario();

    const campoFecha = container.querySelector('input[type="date"]');
    const edad = screen.getByText('36 años');

    expect(campoFecha).not.toBeNull();
    expect(edad.tagName).toBe('P');
    // «Debajo del campo»: el contenedor de la edad incluye al input de fecha, que la precede.
    expect(edad.parentElement?.contains(campoFecha as Node)).toBe(true);
    expect(
      (campoFecha as Node).compareDocumentPosition(edad) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('FormularioDatosAlumno · L3.1 etiquetas asociadas', () => {
  it.each(ETIQUETAS)('asocia «%s» a su control', (etiqueta) => {
    renderFormulario();

    const control = screen.getByLabelText(etiqueta);
    expect(['INPUT', 'SELECT']).toContain(control.tagName);
  });

  it('genera ids únicos cuando hay dos formularios montados a la vez', () => {
    render(
      <>
        <FormularioDatosAlumno {...propsFormulario()} />
        <FormularioDatosAlumno {...propsFormulario()} />
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

describe('FormularioDatosAlumno · L3.2 teclado y autocompletado', () => {
  it('el teléfono abre el teclado telefónico', () => {
    renderFormulario();

    expect(screen.getByLabelText('Teléfono / WhatsApp').getAttribute('inputmode')).toBe('tel');
  });

  it('nombres y apellidos declaran su autocompletado', () => {
    renderFormulario();

    expect(screen.getByLabelText('Nombres').getAttribute('autocomplete')).toBe('given-name');
    expect(screen.getByLabelText('Apellidos').getAttribute('autocomplete')).toBe('family-name');
  });
});

describe('FormularioDatosAlumno · L3.3 altura táctil', () => {
  it('todos los inputs y selects llevan min-h-11', () => {
    const { container } = renderFormulario();

    const controles = Array.from(container.querySelectorAll<HTMLElement>('input, select'));
    expect(controles).toHaveLength(7);
    const sinAltura = controles
      .filter((control) => !control.classList.contains('min-h-11'))
      .map((control) => control.outerHTML.slice(0, 100));
    expect(sinAltura).toEqual([]);
  });
});

describe('FormularioDatosAlumno · L3.4 cuadrícula móvil', () => {
  it('la fila de tipo y número de documento es una columna en móvil y tres desde sm', () => {
    const { container } = renderFormulario();

    const tipoDocumento = container.querySelector('select');
    const fila = tipoDocumento?.closest('[class*="grid-cols"]');

    expect(fila).not.toBeNull();
    expect(fila?.classList.contains('grid-cols-1')).toBe(true);
    expect(fila?.classList.contains('sm:grid-cols-3')).toBe(true);
    expect(fila?.classList.contains('grid-cols-3')).toBe(false);
  });
});
