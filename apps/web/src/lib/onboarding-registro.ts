/**
 * Onboarding (WU-E RF-011): construccion pura del payload del registro publico.
 *
 * Extraido de `OnboardingPage.handleSubmit` sin cambiar el comportamiento: el cuerpo del
 * POST a `/alumnos/registro-publico` viaja con el `coachCode` YA validado contra la API
 * (nunca con uno inventado por el cliente) y el telefono en formato internacional.
 */
import type { Modalidad, TipoDocumento } from '@guachafit/shared';
import { componerTelefonoWhatsapp } from './formulario-registro';

export interface DatosRegistroOnboarding {
  nombres: string;
  apellidos: string;
  email: string;
  password: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
  prefijoWhatsapp: string;
  numeroWhatsapp: string;
  modalidad: Modalidad;
}

export interface PayloadRegistroOnboarding {
  coachCode: string;
  nombres: string;
  apellidos: string;
  email: string;
  password: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
  telefonoWhatsapp: string;
  modalidad: Modalidad;
}

/** Cuerpo del POST de alta: mismos campos y mismo orden que enviaba el contenedor. */
export function construirPayloadRegistroOnboarding(
  coachCodeValidado: string,
  datos: DatosRegistroOnboarding
): PayloadRegistroOnboarding {
  return {
    coachCode: coachCodeValidado,
    nombres: datos.nombres,
    apellidos: datos.apellidos,
    email: datos.email,
    password: datos.password,
    tipoDocumento: datos.tipoDocumento,
    numeroDocumento: datos.numeroDocumento,
    fechaNacimiento: datos.fechaNacimiento,
    telefonoWhatsapp: componerTelefonoWhatsapp(datos.prefijoWhatsapp, datos.numeroWhatsapp),
    modalidad: datos.modalidad,
  };
}
