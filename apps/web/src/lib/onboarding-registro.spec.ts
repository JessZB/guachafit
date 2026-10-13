/**
 * Prompt 86 (Ola 3) · spec de logica pura de `lib/onboarding-registro.ts`.
 */
import { describe, expect, it } from 'vitest';
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import {
  construirPayloadRegistroOnboarding,
  type DatosRegistroOnboarding,
} from './onboarding-registro';

const DATOS_BASE: DatosRegistroOnboarding = {
  nombres: 'Carlos Alberto',
  apellidos: 'Mendoza',
  email: 'carlos@email.com',
  password: 'secreta99',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '24123456',
  fechaNacimiento: '1998-05-14',
  prefijoWhatsapp: '+58',
  numeroWhatsapp: '4121234567',
  modalidad: Modalidad.PRESENCIAL,
};

describe('construirPayloadRegistroOnboarding', () => {
  it('usa el coachCode validado y compone el telefono en formato internacional', () => {
    expect(construirPayloadRegistroOnboarding('COACH1', DATOS_BASE)).toEqual({
      coachCode: 'COACH1',
      nombres: 'Carlos Alberto',
      apellidos: 'Mendoza',
      email: 'carlos@email.com',
      password: 'secreta99',
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      fechaNacimiento: '1998-05-14',
      telefonoWhatsapp: '+584121234567',
      modalidad: Modalidad.PRESENCIAL,
    });
  });

  it('quita el 0 troncal del numero local con +58', () => {
    const payload = construirPayloadRegistroOnboarding('COACH1', {
      ...DATOS_BASE,
      numeroWhatsapp: '04121234567',
    });
    expect(payload.telefonoWhatsapp).toBe('+584121234567');
  });
});
