// @vitest-environment jsdom
/**
 * D17 · RF-010 / Superadmin: Alta de entrenador sin campo coachCode manual.
 * Contratos: d17-contratos.md §4.5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FormularioAltaEntrenador } from './FormularioAltaEntrenador';
import {
  construirPayloadAltaEntrenador,
  FORMULARIO_INICIAL,
} from '../../../lib/admin-alta-payload';

afterEach(() => {
  cleanup();
});

describe('FormularioAltaEntrenador (D17 §4.5)', () => {
  it('ya no existe el campo admin-coach-code ni su etiqueta', () => {
    const props = {
      formulario: FORMULARIO_INICIAL,
      enviando: false,
      onCambiarCampo: vi.fn(() => vi.fn()),
      onSubmit: vi.fn(),
    };

    const { container } = render(<FormularioAltaEntrenador {...props} />);

    expect(container.querySelector('#admin-coach-code')).toBeNull();
    expect(screen.queryByLabelText(/código de entrenador/i)).toBeNull();
    expect(
      screen.queryByText(/Será el código del enlace de captación de sus alumnos/i)
    ).toBeNull();
  });

  it('al enviar, construirPayloadAltaEntrenador no incluye coachCode', () => {
    const estadoFormulario = {
      nombres: '  Marcos  ',
      apellidos: '  Fitness  ',
      email: '  marcos@gym.com  ',
      telefonoContacto: '  +58 412 000 0000  ',
      nombreComercial: '  Marcos Gym  ',
    };

    const payload = construirPayloadAltaEntrenador(estadoFormulario as unknown as typeof FORMULARIO_INICIAL);

    expect(payload).not.toHaveProperty('coachCode');
    expect(payload).toEqual({
      nombres: 'Marcos',
      apellidos: 'Fitness',
      email: 'marcos@gym.com',
      telefonoContacto: '+58 412 000 0000',
      nombreComercial: 'Marcos Gym',
    });
  });

  it('el formulario conserva los campos restantes y dispara onSubmit', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const props = {
      formulario: {
        nombres: 'Marcos',
        apellidos: 'Fitness',
        email: 'marcos@gym.com',
        telefonoContacto: '+584120000000',
        nombreComercial: '',
      },
      enviando: false,
      onCambiarCampo: vi.fn(() => vi.fn()),
      onSubmit,
    };

    const { container } = render(<FormularioAltaEntrenador {...props} />);

    expect(screen.getByLabelText('Nombres')).toBeTruthy();
    expect(screen.getByLabelText('Apellidos')).toBeTruthy();
    expect(screen.getByLabelText('Correo electrónico')).toBeTruthy();
    expect(screen.getByLabelText('Teléfono de contacto')).toBeTruthy();

    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
