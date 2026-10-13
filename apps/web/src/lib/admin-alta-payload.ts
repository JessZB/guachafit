/**
 * RF-010 Escenario 1 (WU Admin): formulario y payload del alta de entrenadores.
 *
 * Lógica pura extraída de `AdminPage` (sin React ni red): estado inicial del formulario y
 * construcción del cuerpo del `POST /auth/entrenador` (recortes, normalización del
 * `coachCode` y `nombreComercial` solo cuando no está vacío).
 */
import { normalizarCoachCode } from './onboarding-links';

/** Campos del formulario de alta de entrenador del panel admin. */
export interface FormularioAltaEntrenador {
  nombres: string;
  apellidos: string;
  email: string;
  telefonoContacto: string;
  coachCode: string;
  nombreComercial: string;
}

/** Estado inicial del formulario de alta (todo vacío). */
export const FORMULARIO_INICIAL: FormularioAltaEntrenador = {
  nombres: '',
  apellidos: '',
  email: '',
  telefonoContacto: '',
  coachCode: '',
  nombreComercial: '',
};

/** Cuerpo del `POST /auth/entrenador` (`nombreComercial` solo cuando no está vacío). */
export interface PayloadAltaEntrenador {
  nombres: string;
  apellidos: string;
  email: string;
  telefonoContacto: string;
  coachCode: string;
  nombreComercial?: string;
}

/** Construye el cuerpo del alta recortando, normalizando el código y omitiendo el comercial vacío. */
export function construirPayloadAltaEntrenador(
  formulario: FormularioAltaEntrenador
): PayloadAltaEntrenador {
  const nombreComercial = formulario.nombreComercial.trim();
  return {
    nombres: formulario.nombres.trim(),
    apellidos: formulario.apellidos.trim(),
    email: formulario.email.trim(),
    telefonoContacto: formulario.telefonoContacto.trim(),
    coachCode: normalizarCoachCode(formulario.coachCode),
    ...(nombreComercial ? { nombreComercial } : {}),
  };
}
