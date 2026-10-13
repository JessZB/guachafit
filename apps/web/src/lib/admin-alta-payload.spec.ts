/**
 * RF-010 Escenario 1 (WU Admin): contrato puro del formulario y el payload del alta.
 *
 * Fija el estado inicial vacío y la normalización del cuerpo del `POST /auth/entrenador`
 * (recortes, `coachCode` en mayúsculas sin espacios y `nombreComercial` solo si no vacío).
 */
import { describe, expect, it } from 'vitest';
import {
  construirPayloadAltaEntrenador,
  FORMULARIO_INICIAL,
} from './admin-alta-payload';

describe('admin-alta-payload: formulario inicial y payload del alta', () => {
  it('el formulario arranca completamente vacío', () => {
    expect(FORMULARIO_INICIAL).toEqual({
      nombres: '',
      apellidos: '',
      email: '',
      telefonoContacto: '',
      coachCode: '',
      nombreComercial: '',
    });
  });

  it('recorta los campos y normaliza el código a mayúsculas sin espacios', () => {
    expect(
      construirPayloadAltaEntrenador({
        nombres: '  Carlos ',
        apellidos: 'Mendoza ',
        email: ' carlos@gym.com ',
        telefonoContacto: ' +58 412 000 0000 ',
        coachCode: ' carlos-1 ',
        nombreComercial: '',
      })
    ).toEqual({
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@gym.com',
      telefonoContacto: '+58 412 000 0000',
      coachCode: 'CARLOS-1',
    });
  });

  it('omite el nombre comercial cuando está vacío o solo tiene espacios', () => {
    const base = {
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@gym.com',
      telefonoContacto: '+58 412 000 0000',
      coachCode: 'CARLOS-1',
    };

    expect(construirPayloadAltaEntrenador({ ...base, nombreComercial: '' })).not.toHaveProperty(
      'nombreComercial'
    );
    expect(construirPayloadAltaEntrenador({ ...base, nombreComercial: '   ' })).not.toHaveProperty(
      'nombreComercial'
    );
  });

  it('incluye el nombre comercial recortado cuando no está vacío', () => {
    expect(
      construirPayloadAltaEntrenador({
        nombres: 'Carlos',
        apellidos: 'Mendoza',
        email: 'carlos@gym.com',
        telefonoContacto: '+58 412 000 0000',
        coachCode: 'CARLOS-1',
        nombreComercial: '  Carlos Fitness  ',
      })
    ).toEqual({
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@gym.com',
      telefonoContacto: '+58 412 000 0000',
      coachCode: 'CARLOS-1',
      nombreComercial: 'Carlos Fitness',
    });
  });
});
