/**
 * RF-010 Escenario 1 (WU Admin): formulario y payload del alta de entrenadores.
 *
 * Lógica pura extraída de `AdminPage` (sin React ni red): estado inicial del formulario y
 * construcción del cuerpo del `POST /auth/entrenador` (recortes y `nombreComercial` solo
 * cuando no está vacío). D17: el código del entrenador ya no se escribe a mano; lo genera
 * el servidor y llega en la respuesta del alta.
 */

/** Campos del formulario de alta de entrenador del panel admin. */
export interface FormularioAltaEntrenador {
  nombres: string;
  apellidos: string;
  email: string;
  telefonoContacto: string;
  nombreComercial: string;
}

/** Estado inicial del formulario de alta (todo vacío). */
export const FORMULARIO_INICIAL: FormularioAltaEntrenador = {
  nombres: '',
  apellidos: '',
  email: '',
  telefonoContacto: '',
  nombreComercial: '',
};

/** Cuerpo del `POST /auth/entrenador` (`nombreComercial` solo cuando no está vacío). */
export interface PayloadAltaEntrenador {
  nombres: string;
  apellidos: string;
  email: string;
  telefonoContacto: string;
  nombreComercial?: string;
}

/** Construye el cuerpo del alta recortando y omitiendo el comercial vacío. */
export function construirPayloadAltaEntrenador(
  formulario: FormularioAltaEntrenador
): PayloadAltaEntrenador {
  const nombreComercial = formulario.nombreComercial.trim();
  return {
    nombres: formulario.nombres.trim(),
    apellidos: formulario.apellidos.trim(),
    email: formulario.email.trim(),
    telefonoContacto: formulario.telefonoContacto.trim(),
    ...(nombreComercial ? { nombreComercial } : {}),
  };
}
