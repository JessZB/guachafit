/**
 * Logica pura de la conciliacion de evaluaciones antropometricas pendientes.
 *
 * Extraido verbatim de `AntropometriaPage.handleConciliar`: construye el cuerpo del
 * `PATCH /antropometria/:id/conciliar`, valida el motivo libre del rechazo (RN-04)
 * y produce los mensajes de exito. Sin React, sin red, sin estado.
 */

export type AccionConciliacionAntropometria = "aprobar" | "rechazar";

export interface CuerpoConciliacionAntropometria {
  accion: AccionConciliacionAntropometria;
  motivoRechazo?: string;
}

/** Copys vigentes de la pagina (no cambiar sin actualizar sus specs de caracterizacion). */
export const ERROR_MOTIVO_RECHAZO_VACIO_ANTROPOMETRIA =
  "Escribe el motivo del rechazo: el alumno lo recibirá como retroalimentación.";

export const EXITO_APROBACION_ANTROPOMETRIA =
  "Evaluación aprobada y consolidada en las curvas del alumno.";

export const EXITO_RECHAZO_ANTROPOMETRIA =
  "Evaluación rechazada: el motivo quedó registrado en el control.";

/**
 * Cuerpo del PATCH de conciliacion:
 * - `aprobar`: solo la accion (la observacion del coach es opcional y viaja aparte).
 * - `rechazar`: exige el motivo libre recortado que vera/recibira el alumno.
 */
export function construirCuerpoConciliacionAntropometria(
  accion: AccionConciliacionAntropometria,
  motivo?: string,
): CuerpoConciliacionAntropometria {
  if (accion === "aprobar") return { accion };
  return { accion, motivoRechazo: (motivo ?? "").trim() };
}

/** Valida el motivo del rechazo antes de enviar: `null` si es valido, el error si no. */
export function validarMotivoRechazoAntropometria(
  motivo?: string,
): string | null {
  const recortado = (motivo ?? "").trim();
  if (recortado.length === 0) return ERROR_MOTIVO_RECHAZO_VACIO_ANTROPOMETRIA;
  return null;
}

/** Mensaje de exito tras conciliar (solo se declara con 2xx o cambio local demo). */
export function mensajeExitoConciliacionAntropometria(
  accion: AccionConciliacionAntropometria,
): string {
  return accion === "aprobar"
    ? EXITO_APROBACION_ANTROPOMETRIA
    : EXITO_RECHAZO_ANTROPOMETRIA;
}
