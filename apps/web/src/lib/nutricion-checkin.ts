/**
 * Reglas de error al guardar el check-in nutricional diario (RF-002).
 *
 * El endpoint `POST /nutricion/checkin-diario` es de alta con unicidad diaria
 * (alumno_id, fecha): no existe endpoint de actualización. Por eso:
 * - 2xx es el ÚNICO resultado que cuenta como éxito.
 * - 409 (ya registrado hoy) se resuelve refrescando el reporte real del servidor y avisando,
 *   nunca encolando ni mostrando "Reporte registrado".
 * - Otros 4xx (400/422) son rechazos del negocio: se muestran tal cual, sin éxito ni cola.
 * - Errores de red (sin status) o 5xx conservan la cola offline legítima: el outbox reintenta.
 */

export const MENSAJE_COLA_SIN_CONEXION =
  'Sin conexión: tu reporte quedó guardado en el dispositivo y se enviará automáticamente al recuperar la señal.';

export const MENSAJE_COLA_SERVIDOR =
  'No pudimos confirmar el guardado con el servidor: tu reporte quedó en la cola y se enviará automáticamente.';

export const MENSAJE_YA_REGISTRADO_HOY = 'Ya registraste tu reporte de hoy.';

export const MENSAJE_ERROR_GENERICO =
  'No se pudo guardar tu reporte. Revisa los datos e inténtalo de nuevo.';

export type AccionErrorCheckinNutricional = 'encolar' | 'refrescar' | 'mostrar_error';

export interface DecisionErrorCheckinNutricional {
  accion: AccionErrorCheckinNutricional;
  mensaje: string;
}

/** Status HTTP de un error tipo ApiError; 0 = sin respuesta (fallo de red/fetch). */
export function obtenerStatusError(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

/**
 * Decide qué hacer ante un error de guardado del check-in nutricional.
 *
 * @param err error capturado (ApiError con `status`, Error de red, etc.).
 * @param isOnline estado de conexión observado al intentar el POST.
 */
export function decidirAccionErrorCheckinNutricional(
  err: unknown,
  isOnline: boolean
): DecisionErrorCheckinNutricional {
  if (!isOnline) {
    return { accion: 'encolar', mensaje: MENSAJE_COLA_SIN_CONEXION };
  }

  const status = obtenerStatusError(err);

  if (status === 409) {
    return { accion: 'refrescar', mensaje: MENSAJE_YA_REGISTRADO_HOY };
  }

  if (status >= 400 && status < 500) {
    const mensaje = err instanceof Error && err.message.trim().length > 0
      ? err.message
      : MENSAJE_ERROR_GENERICO;
    return { accion: 'mostrar_error', mensaje };
  }

  // Sin status (fetch caído) o 5xx: fallo no concluyente -> cola offline con reintento.
  return {
    accion: 'encolar',
    mensaje: status >= 500 ? MENSAJE_COLA_SERVIDOR : MENSAJE_COLA_SIN_CONEXION,
  };
}
